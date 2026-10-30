__cinderExport = {
	id: "oceanofpdf",
	name: "OceanofPDF",
	version: "0.1.10",
	icon: "OPDF",
	description: "OceanofPDF download-source extension with separate EPUB/PDF results, OceanofPDF-first search, optional ReadRobe fallback, and POST form downloads.",
	contentType: "books",
	contentTypes: ["ebook"],
	excludeFromDefaultMetadataProviders: true,
	browser: { startUrl: "https://oceanofpdf.com/?s=test", userAgent: "mobile" },

	capabilities: {
		search: true,
		discover: false,
		download: true,
		resolve: true,
		searchDownloads: true,
		manga: false,
	},

	_BASE_URL: "https://oceanofpdf.com",
	_BASE_URLS: ["https://oceanofpdf.com", "https://readrobe.com"],
	_SEARCH_BUDGET_MS: 14000,
	_searchBrowserTask: null,
	_browserUserAgent: "",
	_browserUserAgentTask: null,
	_LEGACY_USER_AGENT: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",

	getSettings: function() {
		return [{
			id: "verify_website", label: "Verify Website", type: "webview",
			url: "https://oceanofpdf.com/?s=test",
			subtitle: "Complete the browser check, then return and retry search.",
		}];
	},

	_error: function(message, status) {
		var error = new Error(message);
		error.status = status || 0;
		error.stopSearch = true;
		return error;
	},

	_isChallenge: function(html) {
		return /<title[^>]*>\s*(?:Just a moment[^<]*|Attention Required[^<]*)<\/title>/i.test(String(html || "")) ||
			/enable javascript and cookies|id=["']cf-challenge|window\._cf_chl_opt\s*=/i.test(String(html || ""));
	},

	_isMaintenance: function(html) {
		// Match the page heading, not a book mentioning an outage in its title/summary.
		return /<title[^>]*>[^<]*(?:temporarily offline|under maintenance|service unavailable)[^<]*<\/title>/i.test(String(html || ""));
	},

	_pageError: function(resp) {
		if (Number(resp && resp.status) === 403 || this._isChallenge(resp && resp.data)) {
			return this._error("OceanofPDF could not complete the automatic browser check. Open extension settings > Verify Website, complete the check, then retry.", 403);
		}
		return this._error("OceanofPDF search is temporarily unavailable. Please retry later.", Number(resp && resp.status));
	},

	_searchTimeoutError: function(context) {
		if (context && context.signal && context.signal.aborted) return this._error("OceanofPDF search cancelled.");
		// Keep a confirmed browser check actionable even when the hidden browser
		// is still waiting when this search's deadline expires. Never carry this
		// state into another search, or mistake a plain network timeout for it.
		if (context && context.challengeDetected) return this._pageError({ status: 403 });
		return this._error("OceanofPDF search timed out. Open extension settings > Verify Website if a browser check is required.");
	},

	_assertSearchActive: function(context) {
		if (!context) return;
		if (context.signal && context.signal.aborted) throw this._error("OceanofPDF search cancelled.");
		if (context.expired || Date.now() >= context.deadline) {
			throw this._searchTimeoutError(context);
		}
	},

	_absUrl: function(url, baseUrl) {
		if (!url) return "";
		if (url.indexOf("//") === 0) return "https:" + url;
		if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return url;
		baseUrl = baseUrl || this._BASE_URL;
		if (url.charAt(0) === "/") return baseUrl + url;
		return baseUrl + "/" + url;
	},

	_baseForUrl: function(url) {
		var match = String(url || "").match(/^(https?:\/\/[^/]+)/i);
		return match ? match[1] : this._BASE_URL;
	},

	_clean: function(value) {
		return cinder.normalizeText(String(value || ""))
			.replace(/\s+/g, " ")
			.trim();
	},

	_slug: function(value) {
		return this._clean(value)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
	},

	_fetchPage: async function(url, context) {
		this._assertSearchActive(context);
		var resp = { status: 0, data: "" };
		try {
			resp = await cinder.fetch(url, {
				headers: {
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en-US,en;q=0.8",
					// Keep native requests consistent with the verification browser.
					"User-Agent": this._browserUserAgent || this._LEGACY_USER_AGENT,
				},
				timeout: context ? Math.min(3500, Math.max(1, context.deadline - Date.now())) : 30000,
				signal: context && context.signal,
			});
		} catch (_) {
			// Network errors can still succeed through the existing browser session.
		}
		if (context && (Number(resp && resp.status) === 403 || this._isChallenge(resp && resp.data))) context.challengeDetected = true;
		this._assertSearchActive(context);
		if (this._isUsableHtml(resp)) return resp;
		// Do not spend another browser timeout on an offline mirror or real HTTP
		// error. Some browser challenges use 503, so recognize those separately.
		if (this._isMaintenance(resp && resp.data) ||
			(resp && resp.status >= 400 && resp.status !== 403 && !this._isChallenge(resp.data))) return resp;
		if (typeof cinder.fetchBrowser !== "function") return resp;
		if (context && this._searchBrowserTask) throw this._error("OceanofPDF browser check is already running. Please retry shortly.");
		var remaining = context ? context.deadline - Date.now() : 45000;
		if (remaining < 1000) { context.expired = true; this._assertSearchActive(context); }
		var task = cinder.fetchBrowser(url, {
			headers: {
				"X-Cinder-Suppress-Interactive": "1",
				"X-Cinder-Min-Wait-Ms": "500",
				"X-Cinder-Visible-Layout": "1",
				"X-Cinder-Wait-For-Selector": context
					? "article.entry, article.post-item, .no-results, .search-no-results"
					: 'form[action*="Fetching_Resource.php"] input[name="filename"], form[action*="fetching-ebook-php"] input[name="filename"]',
				"X-Cinder-Max-Wait-Ms": String(context ? Math.max(1000, remaining - 500) : 45000),
			},
			timeout: context ? remaining : 60000,
		});
		if (context) this._searchBrowserTask = task;
		try {
			var browserResp = await task;
			if (context && (Number(browserResp && browserResp.status) === 403 || this._isChallenge(browserResp && browserResp.data))) context.challengeDetected = true;
			this._assertSearchActive(context);
			if (this._isUsableHtml(browserResp)) return browserResp;
			// A browser timeout can appear as either status 0 or empty HTTP 200.
			// Preserve the primary challenge instead of reporting false success.
			if (resp && (resp.status === 403 || this._isChallenge(resp.data))) return resp;
			return browserResp && browserResp.status ? browserResp : resp;
		} catch (err) {
			this._assertSearchActive(context);
			if (resp && (resp.status === 403 || this._isChallenge(resp.data))) return resp;
			throw err;
		} finally {
			if (this._searchBrowserTask === task) this._searchBrowserTask = null;
		}
	},

	_isUsableHtml: function(resp) {
		if (!resp || !(Number(resp.status) >= 200 && Number(resp.status) < 400)) return false;
		var data = typeof resp.data === "string" ? resp.data : "";
		return data.length >= 1000 && !this._isChallenge(data) && !this._isMaintenance(data);
	},

	_extractMetaValue: function(text, label) {
		var pattern = new RegExp(label + "\\s*:\\s*([^\\n\\r]+)", "i");
		var match = text.match(pattern);
		return match ? this._clean(match[1]) : "";
	},

	_parseFormatsFromText: function(text) {
		var formats = [];
		var seen = {};
		var matches = String(text || "").match(/\b(epub|pdf|mobi|azw3|cbz|cbr)\b/gi) || [];
		for (var i = 0; i < matches.length; i++) {
			var fmt = matches[i].toLowerCase();
			if (!seen[fmt]) {
				seen[fmt] = true;
				formats.push(fmt);
			}
		}
		return formats;
	},

	_extractDownloadForms: function(html, pageUrl) {
		var doc = cinder.parseHTML(html);
		var forms = doc.querySelectorAll(
			'form[action*="Fetching_Resource.php"], form[action*="fetching-ebook-php"]'
		);
		var results = [];
		var baseUrl = this._baseForUrl(pageUrl);

		for (var i = 0; i < forms.length; i++) {
			try {
				var form = forms[i];
				var endpoint = this._absUrl(form.attr("action") || "", baseUrl);
				var idInput = form.querySelector('input[name="id"]');
				var fileInput = form.querySelector('input[name="filename"]');
				var requestId = this._clean(idInput ? idInput.attr("value") || "" : "");
				var fileName = this._clean(fileInput ? fileInput.attr("value") || "" : "");
				if (!endpoint || !requestId || !fileName) continue;

				var format = "";
				var extMatch = fileName.toLowerCase().match(/\.([a-z0-9]{2,5})(?:\s|$)/);
				if (extMatch) format = extMatch[1];

				var fields = {};
				var inputs = form.querySelectorAll("input[name]");
				for (var n = 0; n < inputs.length; n++) {
					var name = inputs[n].attr("name") || "";
					var type = String(inputs[n].attr("type") || "text").toLowerCase();
					if (!name || name === "__proto__" || name === "constructor" || name === "prototype" ||
						type === "image" || type === "submit" || type === "button") continue;
					fields[name] = inputs[n].attr("value") || "";
				}
				fields.id = requestId;
				fields.filename = fileName;
				results.push({
					fields: fields,
					endpoint: endpoint,
					requestId: requestId,
					fileName: fileName,
					format: format,
				});
			} catch (err) {
				cinder.warn("[OceanofPDF] Failed to parse download form: " + err);
			}
		}

		return results;
	},

	_pickDownloadForm: function(forms, preferredFormat) {
		if (!forms || !forms.length) return null;
		var normalized = this._clean(preferredFormat).toLowerCase();
		var hasTaggedFormats = false;
		for (var i = 0; i < forms.length; i++) {
			if (forms[i].format) hasTaggedFormats = true;
			if (forms[i].format === normalized) return forms[i];
		}
		if (normalized && hasTaggedFormats) return null;
		return forms[0];
	},

	_parseResultArticles: function(html, baseUrl) {
		var doc = cinder.parseHTML(html);
		var articles = doc.querySelectorAll(
			"main#genesis-content article.entry, main#main article.post-item, article.post-item.entry"
		);
		var results = [];

		for (var i = 0; i < articles.length; i++) {
			try {
				var article = articles[i];
				var titleLink = article.querySelector("h2.entry-title a.entry-title-link") ||
					article.querySelector("h1.entry-title a.entry-title-link") ||
					article.querySelector("h2.post-title a") ||
					article.querySelector(".entry-title a") ||
					article.querySelector("h1 a, h2 a, h3 a");
				if (!titleLink) continue;

				var title = this._clean(titleLink.text());
				var url = this._absUrl(titleLink.attr("href") || "", baseUrl);
				if (!title || !url) continue;

				var meta = article.querySelector(".postmetainfo") ||
					article.querySelector(".post-details");
				var metaText = meta ? this._clean(meta.text()).replace(/\s*(Author|Language|Genre)\s*:/g, "\n$1:") : "";
				var author = this._extractMetaValue(metaText, "Author");
				var genre = this._extractMetaValue(metaText, "Genre");

				var image = article.querySelector("a.entry-image-link img") ||
					article.querySelector("img.entry-image") ||
					article.querySelector("img");
				var cover = "";
				if (image) cover = image.attr("data-src") || image.attr("src") || "";
				cover = this._absUrl(cover, baseUrl);
				if (cover.indexOf("data:image/svg+xml") === 0) cover = "";

				var summaryEl = article.querySelector(".entry-content p");
				var summary = summaryEl ? this._clean(summaryEl.text()) : "";
				var formats = this._parseFormatsFromText(summary + " " + article.attr("aria-label"));

				var resultFormats = formats.length ? formats : ["epub", "pdf"];
				var baseId = url.replace(/^https?:\/\/[^/]+/i, "").replace(/#.*$/, "") || this._slug(title);
				for (var f = 0; f < resultFormats.length; f++) {
					var format = resultFormats[f];
					if (format !== "epub" && format !== "pdf") continue;
					results.push({
						id: baseId + "#" + format,
						title: title,
						author: author || undefined,
						cover: cover || undefined,
						url: url,
						format: format,
						source: "OceanofPDF",
						description: summary || undefined,
						extra: {
							genre: genre || undefined,
							description: summary || undefined,
							summary: summary || undefined,
							preferredFormat: format,
							sourcePageOnly: true,
						},
					});
				}
			} catch (err) {
				cinder.warn("[OceanofPDF] Failed to parse result article: " + err);
			}
		}

		return results;
	},

	search: function(query, page, selections, options) {
		var self = this;
		var context = { deadline: Date.now() + this._SEARCH_BUDGET_MS, expired: false, challengeDetected: false, signal: options && options.signal };
		var work = async function() {
			self._assertSearchActive(context);
			await self._getBrowserUserAgent(self._BASE_URL);
			self._assertSearchActive(context);
			page = page || 0;
			var bases = self._BASE_URLS || [self._BASE_URL];
			var failure;
			for (var i = 0; i < bases.length; i++) {
				self._assertSearchActive(context);
				var baseUrl = bases[i];
				var url = page > 0
					? baseUrl + "/page/" + (page + 1) + "/?s=" + encodeURIComponent(query)
					: baseUrl + "/?s=" + encodeURIComponent(query);
				try {
					var resp = await self._fetchPage(url, context);
					self._assertSearchActive(context);
					if (!self._isUsableHtml(resp)) throw self._pageError(resp);
					var results = self._parseResultArticles(resp.data, baseUrl).slice(0, 50);
					if (results.length) return results;
					// A genuine empty search is successful; do not substitute a
					// different site's catalogue, or treat an error page as empty.
					if (/<title[^>]*>[^<]*(?:Search Results|You searched for)/i.test(resp.data) &&
					/<(?:main|div)\b[^>]*id=["'](?:genesis-content|main)["']/i.test(resp.data)) return [];
					throw self._pageError(resp);
				} catch (err) {
					self._assertSearchActive(context);
					// Prefer actionable verification instructions to the offline
					// fallback's generic error. Never log query text or cookies.
					if (!failure || err.status === 403) failure = err;
				}
			}
			throw failure || self._pageError(null);
		};
		return new Promise(function(resolve, reject) {
			var settled = false;
			// Older sandboxes expose setTimeout but not clearTimeout. Bound the
			// entire search below Cinder's 15-second search/Test Connection limit.
			setTimeout(function() {
				if (settled) return;
				settled = true;
				context.expired = true;
				reject(self._searchTimeoutError(context));
			}, self._SEARCH_BUDGET_MS);
			work().then(function(result) { if (!settled) { settled = true; resolve(result); } },
				function(error) { if (!settled) { settled = true; reject(error); } });
		});
	},

	_responseHeader: function(headers, name) {
		var keys = Object.keys(headers || {});
		for (var i = 0; i < keys.length; i++) {
			if (keys[i].toLowerCase() === name.toLowerCase()) {
				var value = headers[keys[i]];
				return Array.isArray(value) ? value.join(", ") : String(value || "");
			}
		}
		return "";
	},

	_downloadCookies: function(headers) {
		var raw = this._responseHeader(headers, "set-cookie");
		// Axios on older builds joins Set-Cookie values. Do not split the comma
		// inside an Expires date, or forward cookie attributes as cookie names.
		var parts = raw.split(/,(?=\s*[^\s;,=]+=)/);
		var cookies = [];
		for (var i = 0; i < parts.length; i++) {
			var pair = parts[i].split(";")[0].trim();
			if (/^[^\s;,=]+=[^\r\n;]*$/.test(pair)) cookies.push(pair);
		}
		return cookies.join("; ");
	},

	_resolveMirrorForm: async function(selected, pageUrl) {
		// This mirror returns a session-bound link in the HTTP Refresh header,
		// not in its HTML. Resolve it here using the long-standing fetch/headers
		// API so older apps need neither new WebView hooks nor a binary bridge.
		var response = await cinder.fetch(selected.endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Referer: pageUrl,
			},
			body: "id=" + encodeURIComponent(selected.requestId) +
				"&filename=" + encodeURIComponent(selected.fileName),
			timeout: 20000,
		});
		if (!response || response.status < 200 || response.status >= 300) {
			throw new Error("OceanofPDF mirror could not prepare the file (HTTP " +
				(response ? response.status : 0) + "). Please try again.");
		}
		var refresh = this._responseHeader(response.headers, "refresh");
		var match = refresh.match(/(?:^|;)\s*url\s*=\s*["']?([^\r\n]+?)["']?\s*$/i);
		if (!match) {
			throw new Error("OceanofPDF mirror did not return a download redirect. Please try again.");
		}
		var target = match[1].replace(/&amp;/gi, "&");
		var url = typeof cinder.resolveUrl === "function"
			? cinder.resolveUrl(target, selected.endpoint)
			: this._absUrl(target, this._baseForUrl(selected.endpoint));
		var filenameMatch = url.match(/[?&]filename=([^&#]*)/i);
		var filename = "";
		try {
			filename = filenameMatch ? decodeURIComponent(filenameMatch[1].replace(/\+/g, " ")) : "";
		} catch (_err) {}
		// Never attach this session to another host, or silently select a
		// different file/format when the provider returns an unexpected link.
		if (this._baseForUrl(url).toLowerCase() !== this._baseForUrl(selected.endpoint).toLowerCase() ||
			!/^https?:\/\/[^/]+\/download\.php\?/i.test(url) ||
			(filenameMatch && (url.match(/[?&]filename=/ig) || []).length !== 1) ||
			filename !== selected.fileName || !/[?&]token=[^&#\s]+/i.test(url) ||
			/[\r\n]/.test(url)) {
			throw new Error("OceanofPDF mirror returned an unexpected file redirect.");
		}
		var headers = { Referer: selected.endpoint };
		var cookies = this._downloadCookies(response.headers);
		if (cookies) headers.Cookie = cookies;
		return { url: url, fileName: selected.fileName, headers: headers };
	},



	_getBrowserUserAgent: async function(pageUrl) {
		if (this._browserUserAgent) return this._browserUserAgent;
		if (typeof cinder.executeBrowserScript !== "function") return this._LEGACY_USER_AGENT;
		var self = this;
		if (!this._browserUserAgentTask) {
			// Ask the same default WebView used for verification. This loads only
			// trusted blank HTML: no remote scripts, images, cookies in JS, or UI.
			var task = Promise.resolve().then(function() {
				return cinder.executeBrowserScript({
					source: { html: "<!doctype html><html><body></body></html>", baseUrl: pageUrl,
						loadCSS: false, loadImages: false },
					inject: "String(navigator.userAgent || '')",
					storage: { cookies: [] },
				});
			}).then(function(result) {
				var ua = result && result.result;
				if (typeof ua === "string" && ua.length >= 10 && ua.length <= 1024 && !/[\x00-\x1f\x7f]/.test(ua)) {
					self._browserUserAgent = ua;
				}
				return self._browserUserAgent || self._LEGACY_USER_AGENT;
			}, function() { return self._LEGACY_USER_AGENT; });
			this._browserUserAgentTask = task;
			task.then(function() { if (self._browserUserAgentTask === task) self._browserUserAgentTask = null; });
		}
		// A busy browser queue must not stall a download just to identify its UA.
		// A late successful probe remains useful; overlapping calls share it.
		return Promise.race([this._browserUserAgentTask, new Promise(function(resolve) {
			setTimeout(function() { resolve(self._browserUserAgent || self._LEGACY_USER_AGENT); }, 1500);
		})]);
	},

	_clearanceCookie: function(headers) {
		var value = this._responseHeader(headers, "cookie");
		if (!value || value.length > 65536 || /[\x00-\x1f\x7f]/.test(value)) return "";
		var matches = value.split(";").map(function(part) { return part.trim(); }).filter(function(part) {
			return part.indexOf("cf_clearance=") === 0;
		});
		if (matches.length !== 1 || !matches[0].slice(13) || /[,\s]/.test(matches[0])) return "";
		return matches[0];
	},

	_fileHeaders: async function(url, pageUrl, endpoint, userAgent) {
		var headers = { Referer: endpoint, "User-Agent": userAgent };
		// Live file servers require the parent-zone clearance as well as the
		// same UA. Scope this exception narrowly; never forward arbitrary site
		// credentials to a redirect host, even if its filename matches.
		if (!/^https:\/\/fs[0-9]+\.oceanofpdf\.com\//i.test(url) || typeof cinder.getBrowserSessionHeaders !== "function") return headers;
		try {
			var cookie = this._clearanceCookie(await cinder.getBrowserSessionHeaders(pageUrl));
			if (!cookie) cookie = this._clearanceCookie(await cinder.getBrowserSessionHeaders(url));
			if (cookie) headers.Cookie = cookie;
		} catch (_) { /* Older hosts can still use their shared browser cookie jar. */ }
		return headers;
	},

	_formBody: function(selected) {
		var fields = selected.fields || { id: selected.requestId, filename: selected.fileName };
		return Object.keys(fields).filter(function(key) {
			return key !== "__proto__" && key !== "constructor" && key !== "prototype";
		}).map(function(key) { return encodeURIComponent(key) + "=" + encodeURIComponent(fields[key]); }).join("&");
	},

	_fileRedirect: function(response, selected) {
		if (!response || !(Number(response.status) >= 200 && Number(response.status) < 400) || this._isChallenge(response.data)) return null;
		var self = this;
		var validate = function(raw, delay) {
			var value = String(raw || "");
			if (/[\x00-\x1f\x7f\\]/.test(value)) return null;
			value = value.trim().replace(/&amp;/gi, "&");
			if ((value.charAt(0) === "'" && value.slice(-1) === "'") ||
				(value.charAt(0) === '"' && value.slice(-1) === '"')) value = value.slice(1, -1).trim();
			if (!value || /[\r\n\\]/.test(value)) return null;
			var url;
			try {
				url = typeof cinder.resolveUrl === "function" ? cinder.resolveUrl(value, selected.endpoint) : self._absUrl(value, self._baseForUrl(selected.endpoint));
			} catch (_) { return null; }
			// Signed file hosts differ from the website. Accept only an explicit
			// HTTPS link for the requested filename. _fileHeaders scopes the
			// clearance exception to the provider's known file servers only.
			if (!/^https:\/\/[^\s/@?#]+(?:\/|$)/i.test(url)) return null;
			var path = url.replace(/^https:\/\/[^/]+/i, "").split(/[?#]/)[0];
			var name = path.slice(path.lastIndexOf("/") + 1);
			try {
				name = decodeURIComponent(name);
			} catch (_) { return null; }
			if (name !== selected.fileName) return null;
			return { url: url, delay: Math.min(10, Math.max(0, Number(delay) || 0)) };
		};
		var parseRefresh = function(value) {
			var match = String(value || "").match(/^\s*(\d+(?:\.\d+)?)?\s*;?\s*url\s*=\s*(.+?)\s*$/i);
			return match ? validate(match[2], match[1]) : null;
		};
		var result = parseRefresh(this._responseHeader(response.headers, "refresh"));
		if (result) return result;
		var doc = cinder.parseHTML(String(response.data || ""));
		var metas = doc.querySelectorAll("meta[http-equiv]");
		for (var i = 0; i < metas.length; i++) {
			if (String(metas[i].attr("http-equiv") || "").toLowerCase() !== "refresh") continue;
			result = parseRefresh(metas[i].attr("content"));
			if (result) return result;
		}
		var links = doc.querySelectorAll("a[href]");
		for (var j = 0; j < links.length; j++) {
			result = validate(links[j].attr("href"), 0);
			if (result) return result;
		}
		return null;
	},

	_resolveOceanForm: async function(selected, pageUrl) {
		if (this._baseForUrl(selected.endpoint) !== this._baseForUrl(pageUrl) ||
			!/^https:\/\/oceanofpdf\.com\/Fetching_Resource\.php(?:[?#]|$)/i.test(selected.endpoint)) {
			throw this._error("OceanofPDF returned an unexpected download form.");
		}
		await this._getBrowserUserAgent(pageUrl);
		var headers = {
			"Content-Type": "application/x-www-form-urlencoded",
			"Accept": "text/html,application/xhtml+xml",
			"Referer": pageUrl,
			"Origin": this._baseForUrl(pageUrl),
			"User-Agent": this._browserUserAgent || this._LEGACY_USER_AGENT,
		};
		// cinder.fetch supplies this extension's stored website cookies. Read
		// the small response here instead of handing an HTML form endpoint to
		// a binary WebView and waiting for it to guess the final file URL.
		for (var attempt = 0; attempt < 2; attempt++) {
			headers["User-Agent"] = this._browserUserAgent || this._LEGACY_USER_AGENT;
			var response = await cinder.fetch(selected.endpoint, {
				method: "POST", headers: headers, body: this._formBody(selected), timeout: 15000,
			});
			var redirect = this._fileRedirect(response, selected);
			if (redirect) {
				if (redirect.delay) await new Promise(function(resolve) { setTimeout(resolve, redirect.delay * 1000); });
				return { url: redirect.url, fileName: selected.fileName,
					headers: await this._fileHeaders(redirect.url, pageUrl, selected.endpoint, headers["User-Agent"]) };
			}
			var challenged = response && (response.status === 403 || this._isChallenge(response.data));
			if (!challenged) {
				cinder.warn("[OceanofPDF] Download link response", {
					status: Number(response && response.status) || 0,
					bytes: String(response && response.data || "").length,
					type: this._responseHeader(response && response.headers, "content-type"),
				});
				throw this._error("OceanofPDF did not return a valid link for the selected file. Please retry later.", Number(response && response.status));
			}
			if (attempt || typeof cinder.fetchBrowser !== "function") throw this._pageError(response);
			// One silent, source-scoped refresh, then repeat the same form POST.
			// A verification GET must not replace or discard the POST body.
			var refreshed = await cinder.fetchBrowser(pageUrl, { headers: {
				"X-Cinder-Suppress-Interactive": "1", "X-Cinder-Visible-Layout": "1",
				"X-Cinder-Min-Wait-Ms": "500", "X-Cinder-Max-Wait-Ms": "15000",
				"X-Cinder-Wait-For-Selector": 'form[action*="Fetching_Resource.php"] input[name="filename"]',
			} });
			if (!this._isUsableHtml(refreshed)) throw this._pageError(response);
			var forms = this._extractDownloadForms(refreshed.data, pageUrl);
			var updated = null;
			for (var f = 0; f < forms.length; f++) {
				if (forms[f].endpoint === selected.endpoint && forms[f].fileName === selected.fileName &&
					forms[f].format === selected.format) { updated = forms[f]; break; }
			}
			if (!updated) throw this._error("OceanofPDF no longer offers the selected file. Please search again.");
			selected = updated;
		}
		throw this._error("OceanofPDF could not prepare the download.");
	},

	resolve: async function(item) {
		var preferredFormat =
			String(item.format || item.extra?.preferredFormat || "epub").toLowerCase();
		if (!item?.url) throw new Error("OceanofPDF item is missing a source page URL.");

		await this._getBrowserUserAgent(item.url);
		var resp = await this._fetchPage(item.url);
		if (!this._isUsableHtml(resp)) {
			throw this._pageError(resp);
		}

		var forms = this._extractDownloadForms(resp.data || "", item.url);
		var selected = this._pickDownloadForm(forms, preferredFormat);
		if (!selected) {
			throw new Error("OceanofPDF download form was not found on the detail page.");
		}
		if (/^https:\/\/readrobe\.com\/fetching-ebook-php\/?(?:[?#]|$)/i.test(selected.endpoint)) {
			return await this._resolveMirrorForm(selected, item.url);
		}

		return await this._resolveOceanForm(selected, item.url);
	},
};
