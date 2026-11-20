__cinderExport = {
	id: "libgen",
	name: "LibGen",
	version: "0.1.9",
	icon: "LG",
	description: "Direct download-source extension for LibGen.",
	contentType: "books",
	contentTypes: ["ebook"],
	excludeFromDefaultMetadataProviders: true,
	_DEFAULT_BASE_URL: "https://libgen.li",
	_USER_AGENT: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
	_DEFAULT_SEARCH_PATH: "/index.php?req={query}&columns%5B%5D=t&columns%5B%5D=a&columns%5B%5D=i&objects%5B%5D=f&objects%5B%5D=e&objects%5B%5D=s&objects%5B%5D=a&objects%5B%5D=p&objects%5B%5D=w&topics%5B%5D=l&topics%5B%5D=c&topics%5B%5D=f&topics%5B%5D=a&topics%5B%5D=m&topics%5B%5D=r&topics%5B%5D=s&res=25&filesuns=all{pageParam}",
	_DEFAULT_DETAIL_TEMPLATE: "https://libgen.li/edition.php?id={id}",
	_DEFAULT_DOWNLOAD_TEMPLATE: "https://libgen.li/file.php?id={id}",
	_DEFAULT_MD5_DOWNLOAD_TEMPLATE: "https://libgen.li/ads.php?md5={md5}",

	capabilities: {
		search: true,
		discover: false,
		download: true,
		resolve: true,
		resolveOnDownload: true,
		searchDownloads: true,
		manga: false,
	},

	getSettings: function() {
		return [
			{
				id: "base_url",
				label: "Base URL",
				type: "text",
				defaultValue: this._DEFAULT_BASE_URL,
				placeholder: this._DEFAULT_BASE_URL,
			},
			{
				id: "search_path",
				label: "Search Path",
				type: "text",
				defaultValue: this._DEFAULT_SEARCH_PATH,
				placeholder: this._DEFAULT_SEARCH_PATH,
			},
			{
				id: "result_selector",
				label: "Result Selector",
				type: "text",
				defaultValue: "[data-cinder-result], article, .result, .book-result",
				placeholder: "[data-cinder-result], article, .result",
			},
			{
				id: "direct_link_selector",
				label: "Direct Link Selector",
				type: "text",
				defaultValue: "a[data-direct-download], a.download, a[href$='.epub'], a[href$='.pdf'], a[href$='.cbz'], a[href$='.cbr']",
				placeholder: "a[data-direct-download], a.download",
			},
			{
				id: "placeholder_detail_template",
				label: "Placeholder Detail Template",
				type: "text",
				defaultValue: this._DEFAULT_DETAIL_TEMPLATE,
				placeholder: this._DEFAULT_DETAIL_TEMPLATE,
			},
			{
				id: "placeholder_download_template",
				label: "Placeholder Download Template",
				type: "text",
				defaultValue: this._DEFAULT_DOWNLOAD_TEMPLATE,
				placeholder: this._DEFAULT_DOWNLOAD_TEMPLATE,
			},
			{
				id: "placeholder_md5_download_template",
				label: "Placeholder MD5 Download Template",
				type: "text",
				defaultValue: this._DEFAULT_MD5_DOWNLOAD_TEMPLATE,
				placeholder: this._DEFAULT_MD5_DOWNLOAD_TEMPLATE,
			},
		];
	},

	_clean: function(value) {
		return cinder.normalizeText(String(value || ""))
			.replace(/\s+/g, " ")
			.trim();
	},

	_attr: function(node, name) {
		return node ? this._clean(node.attr(name) || "") : "";
	},

	_absUrl: function(baseUrl, value) {
		var url = this._clean(value);
		if (!url) return "";
		if (url.indexOf("//") === 0) return "https:" + url;
		if (/^https?:\/\//i.test(url)) return url;
		var base = this._clean(baseUrl).replace(/\/+$/, "");
		if (!base) return url;
		if (url.charAt(0) === "/") return base + url;
		return base + "/" + url;
	},

	_getSetting: async function(id, fallback) {
		var value = await cinder.store.get(id);
		value = this._clean(value);
		return value || fallback;
	},

	_getBaseUrl: async function() {
		return (await this._getSetting("base_url", this._DEFAULT_BASE_URL)).replace(/\/+$/, "");
	},

	_fetchPage: async function(url, referer, requestOptions) {
		requestOptions = requestOptions || {};
		var attempts = requestOptions.retry === false ? 1 : 2;
		var headers = {
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.8",
			"User-Agent": this._USER_AGENT,
		};
		// The download landing page returns an empty HTTP 200 without its
		// referring catalog/file page. Preserve it on retries and nested hops.
		if (referer) headers.Referer = referer;
		var resp = null;
		for (var attempt = 0; attempt < attempts; attempt++) {
			var timeout = this._remainingTime(requestOptions.deadline, requestOptions.timeout || 30000);
			resp = await cinder.fetch(url, {
				headers: headers,
				timeout: timeout,
			});
			if (resp && resp.status >= 200 && resp.status < 400) {
				return { html: resp.data || "", url: resp.url || url };
			}
			var status = resp ? Number(resp.status) || 0 : 0;
			if (attempt + 1 < attempts && (status === 0 || status >= 500)) {
				await new Promise(function(resolve) { setTimeout(resolve, 250); });
				continue;
			}
			break;
		}
		var finalStatus = resp ? Number(resp.status) || 0 : 0;
		var prefix = finalStatus === 0
			? "LibGen server did not return an HTTP response (connection failed or timed out)"
			: "LibGen server returned HTTP " + finalStatus;
		throw new Error(prefix + ": " + url);
	},

	_fetchHtml: async function(url, referer, options) {
		return (await this._fetchPage(url, referer, options)).html;
	},

	_remainingTime: function(deadline, limit) {
		if (!deadline) return limit;
		var remaining = deadline - Date.now();
		if (remaining <= 0) throw new Error("LibGen timed out contacting the file servers. Retry or choose another edition.");
		return Math.min(limit, remaining);
	},

	_pageLink: function(pageUrl, value) {
		if (!value) return "";
		var url = cinder.resolveUrl(this._decodeUrlText(value), pageUrl);
		return /^https?:\/\//i.test(url) ? url : "";
	},

	_searchUrl: async function(query, page) {
		var baseUrl = await this._getBaseUrl();
		var path = await this._getSetting("search_path", this._DEFAULT_SEARCH_PATH);
		// Upgrade only the exact former default. Publisher/series matches (for
		// example Titan + Curse) crowded real editions off the first page.
		var formerDefault = this._DEFAULT_SEARCH_PATH.replace("&columns%5B%5D=i", "&columns%5B%5D=s&columns%5B%5D=y&columns%5B%5D=p&columns%5B%5D=i");
		if (path === formerDefault) path = this._DEFAULT_SEARCH_PATH;
		var pageNumber = (page || 0) + 1;
		var pageParam = pageNumber > 1 ? "&curtab=f&order=&ordermode=desc&filesuns=all&page=" + pageNumber : "";
		var encodedQuery = encodeURIComponent(query || "").replace(/%20/g, "+");
		var resolved = path
			.replace(/\{query\}/g, encodedQuery)
			.replace(/\{pageParam\}/g, pageParam)
			.replace(/\{page\}/g, String(pageNumber))
			.replace(/\{page0\}/g, String(page || 0));
		return this._absUrl(baseUrl, resolved);
	},

	_firstText: function(node, selectors) {
		for (var i = 0; i < selectors.length; i++) {
			var found = node.querySelector(selectors[i]);
			var text = found ? this._clean(found.text()) : "";
			if (text) return text;
		}
		return "";
	},

	_firstAttr: function(node, selectors, attrs) {
		for (var i = 0; i < selectors.length; i++) {
			var found = node.querySelector(selectors[i]);
			if (!found) continue;
			for (var j = 0; j < attrs.length; j++) {
				var value = this._attr(found, attrs[j]);
				if (value) return value;
			}
		}
		return "";
	},

	_detectFormat: function(text) {
		var match = this._clean(text).toLowerCase().match(/\b(epub|pdf|cbz|cbr|mobi|azw3?|fb2|djvu|txt|rtf|docx?)\b/);
		return match ? match[1] : "";
	},

	_supportedFormat: function(format) {
		var clean = this._clean(format).toLowerCase().replace(/^\./, "");
		return /^(epub|pdf|cbz|cbr)$/.test(clean) ? clean : "";
	},

	_detectSupportedFormat: function(text, url) {
		var detected = this._supportedFormat(this._detectFormat(text));
		if (detected) return detected;
		var urlMatch = this._clean(url).toLowerCase().match(/\.(epub|pdf|cbz|cbr)(?:[?#]|$)/);
		return urlMatch ? urlMatch[1] : "";
	},

	_renderTemplate: function(template, values) {
		values = values || {};
		return this._clean(template).replace(/\{([a-zA-Z0-9_]+)\}/g, function(_all, key) {
			return encodeURIComponent(values[key] == null ? "" : String(values[key]));
		});
	},

	_fileIdFromUrl: function(url) {
		var text = String(url || "");
		var idMatch = text.match(/[?&]id=([0-9A-Za-z._-]+)/);
		if (idMatch) return idMatch[1];
		var pathMatch = text.match(/\/([0-9A-Za-z._-]+)(?:\.[a-z0-9]+)?(?:[?#]|$)/i);
		return pathMatch ? pathMatch[1] : "";
	},

	_md5FromUrl: function(url) {
		var text = String(url || "");
		var queryMatch = text.match(/[?&]md5=([0-9a-f]{8,64})/i);
		if (queryMatch) return queryMatch[1];
		var pathMatch = text.match(/\/md5\/([0-9a-f]{8,64})(?:[/?#]|$)/i);
		return pathMatch ? pathMatch[1] : "";
	},

	_firstMd5FromLinks: function(node) {
		if (!node) return "";
		var links = node.querySelectorAll("a[href]");
		for (var i = 0; i < links.length; i++) {
			var md5 = this._md5FromUrl(links[i].attr("href") || "");
			if (md5) return md5;
		}
		return "";
	},

	_isRestrictedDistributionUrl: function(url) {
		var lower = String(url || "").toLowerCase();
		return (
			lower.indexOf(".onion") !== -1 ||
			lower.indexOf("/torrents/") !== -1 ||
			lower.indexOf("/nzb/") !== -1 ||
			lower.indexOf("dbdumps") !== -1 ||
			lower.indexOf("/md5/") !== -1
		);
	},

	_isHtmlDownloadPageUrl: function(url) {
		var lower = String(url || "").toLowerCase();
		return (
			lower.indexOf("/ads.php") !== -1 ||
			lower.indexOf("/file.php") !== -1 ||
			lower.indexOf("/edition.php") !== -1
		);
	},

	_isKeyedDownloadUrl: function(url) {
		var lower = String(url || "").toLowerCase();
		return lower.indexOf("get.php") !== -1 &&
			lower.indexOf("md5=") !== -1 &&
			lower.indexOf("key=") !== -1;
	},

	_decodeUrlText: function(value) {
		return String(value || "")
			.replace(/&amp;/gi, "&")
			.replace(/&#38;/g, "&")
			.replace(/\\u0026/gi, "&")
			.trim();
	},

	_extractKeyedDownloadUrl: function(html, baseUrl, expectedMd5) {
		var normalizedHtml = this._decodeUrlText(html);
		var matches = normalizedHtml.match(/(?:https?:\/\/|\/\/|\/)?[^"'<>\\\s]*get\.php\?[^"'<>\\\s]+/ig) || [];
		var expected = this._clean(expectedMd5 || "").toLowerCase();
		var seen = {};

		for (var i = 0; i < matches.length; i++) {
			var candidate = this._decodeUrlText(matches[i]);
			if (!candidate || seen[candidate]) continue;
			seen[candidate] = true;
			if (!this._isKeyedDownloadUrl(candidate)) continue;
			var candidateMd5 = this._md5FromUrl(candidate).toLowerCase();
			if (expected && candidateMd5 !== expected) continue;
			return this._pageLink(baseUrl, candidate);
		}

		return "";
	},

	_extractHtmlDownloadPageUrls: function(html, baseUrl, expectedMd5) {
		var normalizedHtml = this._decodeUrlText(html);
		var matches = normalizedHtml.match(/(?:https?:\/\/|\/\/|\/)?[^"'<>\\\s]*(?:ads|file|edition)\.php\?[^"'<>\\\s]+/ig) || [];
		var expected = this._clean(expectedMd5 || "").toLowerCase();
		var seen = {};
		var results = [];

		for (var i = 0; i < matches.length; i++) {
			var candidate = this._pageLink(baseUrl, matches[i]);
			if (!candidate || seen[candidate]) continue;
			seen[candidate] = true;
			if (!this._isHtmlDownloadPageUrl(candidate)) continue;
			var candidateMd5 = this._md5FromUrl(candidate).toLowerCase();
			if (expected && candidateMd5 && candidateMd5 !== expected) continue;
			results.push(candidate);
		}

		return results;
	},

	_extractHtmlDownloadPageUrl: function(html, baseUrl, expectedMd5) {
		var urls = this._extractHtmlDownloadPageUrls(html, baseUrl, expectedMd5);
		return urls.length > 0 ? urls[0] : "";
	},

	_resolvedDownload: function(item, url, referer, useBrowser) {
		var headers = { "User-Agent": this._USER_AGENT };
		if (referer) headers.Referer = referer;
		if (useBrowser) {
			headers = headers || {};
			headers["X-Cinder-Expect-Interstitial"] = "1";
		}
		var format = this._supportedFormat(item && item.format);
		if (!format) {
			throw new Error("LibGen result is not a supported Cinder format.");
		}
		return {
			url: url,
			fileName: this._clean(item.title || "download") + "." + format,
			headers: headers,
			downloadRequest: useBrowser ? { method: "GET", useBrowser: true } : undefined,
		};
	},

	_resolveHtmlDownloadPage: async function(item, pageUrl, referer, md5, visited, deadline) {
		var baseUrl = await this._getBaseUrl();
		visited = visited || {};
		var visitKey = this._clean(pageUrl).toLowerCase();
		if (!visitKey || visited[visitKey]) {
			throw new Error("LibGen download page loop detected.");
		}
		if (Object.keys(visited).length >= 8) throw new Error("LibGen returned too many download redirects. Try another result.");
		visited[visitKey] = true;
		var page = await this._fetchPage(pageUrl, referer || baseUrl + "/", { timeout: 6000, deadline: deadline });
		var html = page.html;
		pageUrl = page.url;
		var keyedUrl = this._extractKeyedDownloadUrl(html, pageUrl, md5 || this._md5FromUrl(pageUrl));
		if (keyedUrl) {
			return this._resolvedDownload(item, keyedUrl, pageUrl, false);
		}

		var nestedDownloadPages = this._extractHtmlDownloadPageUrls(html, pageUrl, md5 || this._md5FromUrl(pageUrl));
		for (var nestedIndex = 0; nestedIndex < nestedDownloadPages.length; nestedIndex++) {
			var nestedDownloadPage = nestedDownloadPages[nestedIndex];
			if (!nestedDownloadPage || nestedDownloadPage === pageUrl) continue;
			try {
				return await this._resolveHtmlDownloadPage(
					item,
					nestedDownloadPage,
					pageUrl,
					md5 || this._md5FromUrl(nestedDownloadPage),
					visited,
					deadline,
				);
			} catch (nestedError) {
				cinder.log("[LibGen] Alternate download page failed; trying the next candidate");
			}
		}

		var doc = cinder.parseHTML(html);
		var formDownload = await this._extractFormDownload(doc, pageUrl);
		if (formDownload) {
			var formFormat = this._supportedFormat(item && item.format);
			if (!formFormat) {
				throw new Error("LibGen result is not a supported Cinder format.");
			}
			formDownload.fileName = this._clean(item.title || "download") + "." + formFormat;
			return formDownload;
		}

		throw new Error("LibGen did not expose a direct ebook file URL for this result.");
	},

	_placeholderDetailUrl: async function(id, format, catalogUrl) {
		var template = await this._getSetting("placeholder_detail_template", this._DEFAULT_DETAIL_TEMPLATE);
		if (template === this._DEFAULT_DETAIL_TEMPLATE && catalogUrl) template = catalogUrl + "/edition.php?id={id}";
		return this._renderTemplate(template, {
			id: id,
			format: format || "epub",
		});
	},

	_placeholderDownloadUrl: async function(id, format, tokens, catalogUrl) {
		tokens = tokens || {};
		var md5 = this._clean(tokens.md5 || "");
		var template = md5
			? await this._getSetting("placeholder_md5_download_template", this._DEFAULT_MD5_DOWNLOAD_TEMPLATE)
			: await this._getSetting("placeholder_download_template", this._DEFAULT_DOWNLOAD_TEMPLATE);
		if (catalogUrl && template === this._DEFAULT_MD5_DOWNLOAD_TEMPLATE) template = catalogUrl + "/ads.php?md5={md5}";
		if (catalogUrl && template === this._DEFAULT_DOWNLOAD_TEMPLATE) template = catalogUrl + "/file.php?id={id}";
		return this._renderTemplate(template, {
			id: id,
			format: format || "epub",
			md5: md5,
		});
	},

	_parseLegacyTableRows: async function(doc, catalogUrl) {
		var rows = doc.querySelectorAll("table.table-striped tbody tr");
		if (!rows || rows.length === 0) rows = doc.querySelectorAll("table.table-striped tr");
		if (!rows || rows.length === 0) rows = doc.querySelectorAll("table tr");
		var results = [];
		var seen = {};

		for (var i = 0; i < rows.length; i++) {
			try {
				var row = rows[i];
				// Only this row's cells: wrapper tables can contain the entire
				// catalogue and otherwise collapse many books into one false hit.
				var cells = row.children ? row.children.filter(function(cell) { return String(cell.tagName).toLowerCase() === "td"; }) : row.querySelectorAll("td");
				if (!cells || cells.length < 9) continue;

				var infoCell = cells[0];
				var titleLink = infoCell.querySelector("a[data-detail]") ||
					infoCell.querySelector("a[href*='edition']") ||
					infoCell.querySelector("a[href]");
				var rawTitle = titleLink ? this._clean(titleLink.text()) : this._clean(infoCell.text());
				var series = this._firstText(infoCell, ["b"]);
				var title = rawTitle || series;
				if (!title || title.length < 2) continue;

				var author = this._clean(cells[1].text());
				var publisher = this._clean(cells[2].text());
				var year = this._clean(cells[3].text());
				var language = this._clean(cells[4].text());
				var pages = this._clean(cells[5].text());
				var sizeLink = cells[6].querySelector("a[href]");
				var size = this._clean(cells[6].text());
				var mirrorCell = cells[8] || null;
				var sizeHref = sizeLink ? sizeLink.attr("href") : "";
				var titleHref = titleLink ? titleLink.attr("href") : "";
				var format = this._detectSupportedFormat(cells[7].text(), sizeHref || titleHref);
				if (!format) continue;
				var sourceMd5 = this._firstMd5FromLinks(mirrorCell) || this._md5FromUrl(sizeHref) || this._md5FromUrl(titleHref);
				var fileId = this._fileIdFromUrl(sizeHref);
				var detailId = this._fileIdFromUrl(titleHref);
				var sourceId = sourceMd5 || fileId || detailId;
				if (!sourceId) sourceId = "row-" + i;

				var id = "fixture-table-" + sourceId + "-" + format;
				if (seen[id]) continue;
				seen[id] = true;

				var detailUrl = await this._placeholderDetailUrl(detailId || fileId || sourceId, format, catalogUrl);
				var directUrl = await this._placeholderDownloadUrl(sourceId, format, { md5: sourceMd5 }, catalogUrl);
				results.push({
					id: id,
					title: title,
					author: author || undefined,
					url: detailUrl,
					format: format,
					size: size || undefined,
						source: "LibGen",
					extra: {
						directUrl: directUrl,
						detailUrl: detailUrl,
						md5: sourceMd5 || undefined,
						fileId: fileId || undefined,
						detailId: detailId || undefined,
						publisher: publisher || undefined,
						year: year || undefined,
						language: language || undefined,
						pages: pages || undefined,
						series: series && series !== title ? series : undefined,
					},
				});
			} catch (err) {
				cinder.warn("[LibGen] Failed to parse table row: " + err);
			}
		}

		return results;
	},

	_parseResults: async function(html) {
		var baseUrl = await this._getBaseUrl();
		var selector = await this._getSetting(
			"result_selector",
			"[data-cinder-result], article, .result, .book-result",
		);
		var doc = cinder.parseHTML(html);
		var nodes = doc.querySelectorAll(selector);
		var results = await this._parseLegacyTableRows(doc, baseUrl);
		var seen = {};
		for (var existingIndex = 0; existingIndex < results.length; existingIndex++) {
			seen[results[existingIndex].id] = true;
		}

		for (var i = 0; i < nodes.length; i++) {
			try {
				var node = nodes[i];
				var title = this._attr(node, "data-title") ||
					this._firstText(node, ["[data-title]", ".title", ".book-title", "h1", "h2", "h3", "a"]);
				var author = this._attr(node, "data-author") ||
					this._firstText(node, ["[data-author]", ".author", ".book-author"]);
				var cover = this._attr(node, "data-cover") ||
					this._firstAttr(node, ["img"], ["data-src", "src"]);
				var directUrl = this._attr(node, "data-direct-url") ||
					this._firstAttr(node, ["a[data-direct-download]"], ["href", "data-url"]);
				var detailUrl = this._attr(node, "data-url") ||
					this._attr(node, "data-detail-url") ||
					this._firstAttr(node, ["a[href]"], ["href"]);
				var size = this._attr(node, "data-size") ||
					this._firstText(node, ["[data-size]", ".size", ".file-size"]);
				var format = this._supportedFormat(this._attr(node, "data-format")) ||
					this._detectSupportedFormat(node.text(), directUrl || detailUrl);
				if (!format) continue;

				detailUrl = this._absUrl(baseUrl, detailUrl);
				directUrl = this._absUrl(baseUrl, directUrl);
				cover = this._absUrl(baseUrl, cover);
				if (!title || (!detailUrl && !directUrl)) continue;
				if (this._isRestrictedDistributionUrl(detailUrl)) {
					detailUrl = await this._placeholderDetailUrl(this._fileIdFromUrl(detailUrl) || this._clean(title).toLowerCase(), format);
				}
				if (this._isRestrictedDistributionUrl(directUrl)) {
					var directMd5 = this._md5FromUrl(directUrl);
					directUrl = await this._placeholderDownloadUrl(
						directMd5 || this._fileIdFromUrl(directUrl) || this._clean(title).toLowerCase(),
						format,
						{ md5: directMd5 },
					);
				}

				var id = (detailUrl || directUrl || title) + "#" + format;
				if (seen[id]) continue;
				seen[id] = true;
				results.push({
					id: id,
					title: title,
					author: author || undefined,
					cover: cover || undefined,
					url: detailUrl || directUrl,
					format: format,
					size: size || undefined,
					source: "LibGen",
					extra: {
						directUrl: directUrl || undefined,
						detailUrl: detailUrl || undefined,
					},
				});
			} catch (err) {
				cinder.warn("[LibGen] Failed to parse result: " + err);
			}
		}

		return results.slice(0, 50);
	},

	_extractFormDownload: async function(doc, pageUrl) {
		var form = doc.querySelector("form[data-cinder-download], form.download, form[action*='get.php']");
		if (!form) return null;
		var action = this._pageLink(pageUrl, form.attr("action") || pageUrl);
		if (!action) return null;

		var method = this._clean(form.attr("method") || "GET").toUpperCase();
		if (method !== "POST") method = "GET";

		var body = {};
		var inputs = form.querySelectorAll("input[name], select[name], textarea[name]");
		for (var i = 0; i < inputs.length; i++) {
			var input = inputs[i];
			var name = this._clean(input.attr("name") || "");
			if (!name || name === "__proto__" || name === "constructor" || name === "prototype") continue;
			body[name] = input.attr("value") || "";
		}
		if (method === "GET") {
			var query = Object.keys(body).map(function(name) { return encodeURIComponent(name) + "=" + encodeURIComponent(body[name]); }).join("&");
			if (query) action += (action.indexOf("?") >= 0 ? "&" : "?") + query;
		}

		return {
			url: action,
			downloadRequest: method === "POST"
				? { method: "POST", body: body, bodyEncoding: "form" }
				: undefined,
			headers: { Referer: pageUrl, "User-Agent": this._USER_AGENT },
		};
	},

	search: async function(query, page) {
		var url = await this._searchUrl(query, page || 0);
		cinder.log("[LibGen] Search: " + url);
		// Search has a 15s caller deadline (30s for downloads/test connection).
		// Do not inherit download retries: two 30s attempts continue running
		// after the caller has timed out and cannot return results anymore.
		var html = await this._fetchHtml(url, undefined, { timeout: 12000, retry: false });
		if (!String(html).trim()) {
			throw new Error("LibGen server returned an empty search response: " + url);
		}
		if (/<title>\s*Welcome to nginx!\s*<\/title>/i.test(html)) {
			throw new Error("LibGen server returned a default web-server page instead of its catalog: " + url);
		}
		return await this._parseResults(html);
	},

	_probeFile: async function(url, headers, deadline) {
		var timeout = this._remainingTime(deadline, 4500);
		var response;
		try {
			response = await cinder.fetch(url, { method: "HEAD", headers: headers, timeout: timeout });
		} catch (err) {
			if (err && err.name === "AbortError") throw err;
		}
		var status = response ? Number(response.status) || 0 : 0;
		// Some storage servers allow GET but do not implement HEAD.
		if (!status || status === 405 || status === 501) return { unknown: true, status: status };
		if (status < 200 || status >= 300) return { status: status };
		var metadata = {};
		Object.keys(response.headers || {}).forEach(function(name) {
			metadata[name.toLowerCase()] = String(response.headers[name]).toLowerCase().trim();
		});
		var type = (metadata["content-type"] || "").split(";")[0].trim();
		if (status === 204 || metadata["content-length"] === "0" || /^(?:text\/|image\/|audio\/|video\/|application\/(?:json|xml|xhtml\+xml)$)/.test(type)) {
			return { reason: "the server returned an empty file or a web page" };
		}
		var binary = /^(?:application\/(?:octet-stream|epub\+zip|pdf|(?:x-)?zip(?:-compressed)?|x-rar(?:-compressed)?|vnd\.rar|vnd\.comicbook\+(?:zip|rar)|x-cb[rz])|binary\/octet-stream)$/.test(type);
		return { ok: binary, unknown: !binary, status: status };
	},

	_fileGateways: function(html, md5) {
		// The edition page can contain multiple EPUBs with different hashes.
		// Only use the identity fields on the single file's own metadata page.
		var fileHash = html.match(/<strong>\s*MD5\s*:\s*<\/strong>\s*<\/label>\s*([a-f0-9]{32})\s*</i);
		var fileCid = html.match(/<strong>\s*IPFS CID\s*:\s*<\/strong>\s*<\/label>\s*(b[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44})\s*</i);
		if (!fileHash || fileHash[1].toLowerCase() !== md5 || !fileCid) return [];
		var urls = [];
		var seenHosts = {};
		cinder.parseHTML(html).querySelectorAll("a[href]").forEach(function(link) {
			var raw = link.attr("href") || "";
			if (!/^https:\/\//i.test(raw)) return;
			var href = cinder.resolveUrl(raw, raw);
			var match = href.match(/^https:\/\/(cloudflare-ipfs\.com|gateway\.ipfs\.io|gateway\.pinata\.cloud|ipfs\.io)\/ipfs\/([A-Za-z0-9]+)(?:\?[^#\s]*)?$/i);
			if (!match || match[2] !== fileCid[1] || seenHosts[match[1].toLowerCase()]) return;
			seenHosts[match[1].toLowerCase()] = true;
			urls.push(href);
		});
		return urls;
	},

	resolve: async function(item) {
		var deadline = Date.now() + 28000;
		var extra = item.extra || {};
		var md5 = this._clean(extra.md5 || this._md5FromUrl(extra.directUrl)).toLowerCase();
		var fileId = this._clean(extra.fileId);
		var hasFile = /^[a-f0-9]{32}$/.test(md5) && /^\d+$/.test(fileId);
		var primary, primaryError, probe;
		try {
			primary = await this._resolvePrimary(item, md5, hasFile, deadline);
			if (!this._isKeyedDownloadUrl(primary.url) || (primary.downloadRequest && primary.downloadRequest.method === "POST")) return primary;
			probe = await this._probeFile(primary.url, primary.headers, deadline);
			if (probe.ok || (probe.unknown && !hasFile)) return primary;
		} catch (err) {
			if (!hasFile || (err && err.name === "AbortError")) throw err;
			primaryError = err;
		}
		if (hasFile) {
			var fileUrl = await this._placeholderDownloadUrl(fileId, item.format, {}, await this._getBaseUrl());
			var urls = [];
			try {
				var file = await this._fetchPage(fileUrl, item.url, { timeout: 5500, retry: false, deadline: deadline });
				urls = this._fileGateways(file.html, md5);
			} catch (metadataError) {
				if (metadataError && metadataError.name === "AbortError") throw metadataError;
				if (!primaryError) primaryError = metadataError;
			}
			var self = this;
			var checks = await Promise.all(urls.map(function(url) {
				return self._probeFile(url, { "User-Agent": self._USER_AGENT }, deadline);
			}));
			// Keep ambiguous HEAD results available for an actual GET after
			// confirmed mirrors. A timeout/DNS failure alone is not a healthy mirror.
			var available = urls.filter(function(_, i) { return checks[i].ok; });
			var uncertain = urls.filter(function(_, i) { return checks[i].unknown && checks[i].status; });
			var ordered = available.concat(uncertain);
			if (ordered.length && (available.length || !primary || !probe || !probe.unknown)) {
				var result = this._resolvedDownload(item, ordered[0], "", false);
				if (ordered.length > 1) result.fallbackUrls = ordered.slice(1);
				return result;
			}
		}
		if (primary && probe && probe.unknown) return primary;
		var reason = probe ? (probe.reason || "HTTP " + probe.status) : (primaryError && primaryError.message);
		throw new Error("LibGen could not serve this file" + (reason ? " (" + reason + ")" : "") + ". Retry later or choose another edition.");
	},

	_resolvePrimary: async function(item, md5, hasFile, deadline) {
		var baseUrl = await this._getBaseUrl();
		var directUrl = this._absUrl(baseUrl, item && item.extra ? item.extra.directUrl : "");
		if (this._isRestrictedDistributionUrl(directUrl)) {
			var directMd5 = this._md5FromUrl(directUrl) || this._clean(item && item.extra ? item.extra.md5 : "");
			directUrl = await this._placeholderDownloadUrl(
				directMd5 || this._fileIdFromUrl(directUrl) || this._clean(item.id || item.title),
				item.format || "epub",
				{ md5: directMd5 },
			);
		}
		if (directUrl) {
			if (this._isHtmlDownloadPageUrl(directUrl)) {
				try {
					return await this._resolveHtmlDownloadPage(
						item,
						directUrl,
						item.url,
						md5 || this._md5FromUrl(directUrl), {}, deadline,
					);
				} catch (directError) {
					if (hasFile || (directError && directError.name === "AbortError")) throw directError;
					cinder.log("[LibGen] Primary download page failed; trying the result detail page");
				}
			} else {
				return this._resolvedDownload(item, directUrl, item.url, false);
			}
		}

		var pageUrl = this._absUrl(baseUrl, item.url || (item.extra ? item.extra.detailUrl : ""));
		if (!pageUrl) throw new Error("LibGen result has no detail URL to resolve.");

		cinder.log("[LibGen] Resolve: " + pageUrl);
		var page = await this._fetchPage(pageUrl, undefined, { timeout: 6000, deadline: deadline });
		var html = page.html;
		pageUrl = page.url;
		var keyedUrl = this._extractKeyedDownloadUrl(html, pageUrl, md5);
		if (keyedUrl) return this._resolvedDownload(item, keyedUrl, pageUrl, false);
		var nestedDownloadPages = this._extractHtmlDownloadPageUrls(
			html,
			pageUrl,
			this._clean(item && item.extra ? item.extra.md5 : "") || this._md5FromUrl(pageUrl),
		);
		var nestedError = null;
		for (var nestedIndex = 0; nestedIndex < nestedDownloadPages.length; nestedIndex++) {
			var nestedDownloadPage = nestedDownloadPages[nestedIndex];
			if (!nestedDownloadPage || nestedDownloadPage === pageUrl) continue;
			try {
				return await this._resolveHtmlDownloadPage(
					item,
					nestedDownloadPage,
					pageUrl,
					this._clean(item && item.extra ? item.extra.md5 : "") || this._md5FromUrl(nestedDownloadPage),
					{}, deadline,
				);
			} catch (candidateError) {
				nestedError = candidateError;
				cinder.log("[LibGen] Download-page candidate failed; trying the next candidate");
			}
		}

		var doc = cinder.parseHTML(html);
		var selector = await this._getSetting(
			"direct_link_selector",
			"a[data-direct-download], a.download, a[href$='.epub'], a[href$='.pdf'], a[href$='.cbz'], a[href$='.cbr']",
		);
		var link = doc.querySelector(selector);
		var href = link
			? (link.attr("data-url") || link.attr("data-href") || link.attr("href") || "")
			: "";
		href = this._pageLink(pageUrl, href);
		if (this._isRestrictedDistributionUrl(href)) {
			var hrefMd5 = this._md5FromUrl(href) || this._clean(item && item.extra ? item.extra.md5 : "");
			href = await this._placeholderDownloadUrl(
				hrefMd5 || this._fileIdFromUrl(href) || this._clean(item.id || item.title),
				item.format || "epub",
				{ md5: hrefMd5 },
			);
		}
		if (href) {
			if (this._isHtmlDownloadPageUrl(href)) {
				return await this._resolveHtmlDownloadPage(
					item,
					href,
					pageUrl,
					this._clean(item && item.extra ? item.extra.md5 : "") || this._md5FromUrl(href),
					{}, deadline,
				);
			}
			return this._resolvedDownload(item, href, pageUrl, this._isHtmlDownloadPageUrl(href));
		}

		var formDownload = await this._extractFormDownload(doc, pageUrl);
		if (formDownload) {
			var formFormat = this._supportedFormat(item && item.format);
			if (!formFormat) {
				throw new Error("LibGen result is not a supported Cinder format.");
			}
			formDownload.fileName = this._clean(item.title || "download") + "." + formFormat;
			return formDownload;
		}

		if (nestedError) throw nestedError;
		throw new Error("LibGen did not expose a download link for this file. Try another result.");
	},
};
