__cinderExport = {
	id: "libgen",
	name: "LibGen",
	version: "0.1.4",
	icon: "LG",
	description: "Direct download-source extension for LibGen.",
	contentType: "books",
	contentTypes: ["ebook"],
	excludeFromDefaultMetadataProviders: true,
	_DEFAULT_BASE_URL: "https://libgen.li",
	_DEFAULT_SEARCH_PATH: "/index.php?req={query}&columns%5B%5D=t&columns%5B%5D=a&columns%5B%5D=s&columns%5B%5D=y&columns%5B%5D=p&columns%5B%5D=i&objects%5B%5D=f&objects%5B%5D=e&objects%5B%5D=s&objects%5B%5D=a&objects%5B%5D=p&objects%5B%5D=w&topics%5B%5D=l&topics%5B%5D=c&topics%5B%5D=f&topics%5B%5D=a&topics%5B%5D=m&topics%5B%5D=r&topics%5B%5D=s&res=25&filesuns=all{pageParam}",
	_DEFAULT_DETAIL_TEMPLATE: "https://libgen.li/edition.php?id={id}",
	_DEFAULT_DOWNLOAD_TEMPLATE: "https://libgen.li/file.php?id={id}",
	_DEFAULT_MD5_DOWNLOAD_TEMPLATE: "https://libgen.li/ads.php?md5={md5}",

	capabilities: {
		search: true,
		discover: false,
		download: true,
		resolve: true,
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

	_fetchHtml: async function(url) {
		var resp = await cinder.fetch(url, {
			headers: {
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.8",
				"User-Agent": "Mozilla/5.0 (Cinder Research Fixture)",
			},
			timeout: 30000,
		});
		if (!resp || resp.status < 200 || resp.status >= 400) {
			var status = resp ? resp.status : "unknown";
			var prefix = status === 0
				? "Fixture request failed before receiving an HTTP response"
				: "Fixture request failed with status " + status;
			throw new Error(prefix + ": " + url);
		}
		return resp.data || "";
	},

	_searchUrl: async function(query, page) {
		var baseUrl = await this._getBaseUrl();
		var path = await this._getSetting("search_path", this._DEFAULT_SEARCH_PATH);
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
			if (expected && candidateMd5 && candidateMd5 !== expected) continue;
			return this._absUrl(baseUrl, candidate);
		}

		return "";
	},

	_extractHtmlDownloadPageUrl: function(html, baseUrl, expectedMd5) {
		var normalizedHtml = this._decodeUrlText(html);
		var matches = normalizedHtml.match(/(?:https?:\/\/|\/\/|\/)?[^"'<>\\\s]*(?:ads|file|edition)\.php\?[^"'<>\\\s]+/ig) || [];
		var expected = this._clean(expectedMd5 || "").toLowerCase();
		var seen = {};

		for (var i = 0; i < matches.length; i++) {
			var candidate = this._decodeUrlText(matches[i]);
			if (!candidate || seen[candidate]) continue;
			seen[candidate] = true;
			if (!this._isHtmlDownloadPageUrl(candidate)) continue;
			var candidateMd5 = this._md5FromUrl(candidate).toLowerCase();
			if (expected && candidateMd5 && candidateMd5 !== expected) continue;
			return this._absUrl(baseUrl, candidate);
		}

		return "";
	},

	_resolvedDownload: function(item, url, referer, useBrowser) {
		var headers = referer ? { Referer: referer } : undefined;
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

	_resolveHtmlDownloadPage: async function(item, pageUrl, referer, md5) {
		var baseUrl = await this._getBaseUrl();
		var html = await this._fetchHtml(pageUrl);
		var keyedUrl = this._extractKeyedDownloadUrl(html, baseUrl, md5 || this._md5FromUrl(pageUrl));
		if (keyedUrl) {
			return this._resolvedDownload(item, keyedUrl, pageUrl, false);
		}

		var nestedDownloadPage = this._extractHtmlDownloadPageUrl(html, baseUrl, md5 || this._md5FromUrl(pageUrl));
		if (nestedDownloadPage && nestedDownloadPage !== pageUrl) {
			return await this._resolveHtmlDownloadPage(
				item,
				nestedDownloadPage,
				pageUrl,
				md5 || this._md5FromUrl(nestedDownloadPage),
			);
		}

		var doc = cinder.parseHTML(html);
		var formDownload = await this._extractFormDownload(doc, pageUrl, baseUrl);
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

	_placeholderDetailUrl: async function(id, format) {
		var template = await this._getSetting("placeholder_detail_template", this._DEFAULT_DETAIL_TEMPLATE);
		return this._renderTemplate(template, {
			id: id,
			format: format || "epub",
		});
	},

	_placeholderDownloadUrl: async function(id, format, tokens) {
		tokens = tokens || {};
		var md5 = this._clean(tokens.md5 || "");
		var template = md5
			? await this._getSetting("placeholder_md5_download_template", this._DEFAULT_MD5_DOWNLOAD_TEMPLATE)
			: await this._getSetting("placeholder_download_template", this._DEFAULT_DOWNLOAD_TEMPLATE);
		return this._renderTemplate(template, {
			id: id,
			format: format || "epub",
			md5: md5,
		});
	},

	_parseLegacyTableRows: async function(doc) {
		var rows = doc.querySelectorAll("table.table-striped tbody tr");
		if (!rows || rows.length === 0) rows = doc.querySelectorAll("table tbody tr");
		var results = [];
		var seen = {};

		for (var i = 0; i < rows.length; i++) {
			try {
				var row = rows[i];
				var cells = row.querySelectorAll("td");
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

				var detailUrl = await this._placeholderDetailUrl(detailId || fileId || sourceId, format);
				var directUrl = await this._placeholderDownloadUrl(sourceId, format, { md5: sourceMd5 });
				results.push({
					id: id,
					title: title,
					author: author || undefined,
					url: detailUrl,
					format: format,
					size: size || undefined,
					source: "Generic Direct Fixture",
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
		var results = await this._parseLegacyTableRows(doc);
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

	_extractFormDownload: async function(doc, pageUrl, baseUrl) {
		var form = doc.querySelector("form[data-cinder-download], form.download, form[action]");
		if (!form) return null;
		var action = this._absUrl(baseUrl, form.attr("action") || pageUrl);
		if (!action) return null;

		var method = this._clean(form.attr("method") || "GET").toUpperCase();
		if (method !== "POST") method = "GET";

		var body = {};
		var inputs = form.querySelectorAll("input[name], select[name], textarea[name]");
		for (var i = 0; i < inputs.length; i++) {
			var input = inputs[i];
			var name = this._clean(input.attr("name") || "");
			if (!name) continue;
			body[name] = input.attr("value") || "";
		}

		return {
			url: action,
			downloadRequest: method === "POST"
				? { method: "POST", body: body, bodyEncoding: "form" }
				: undefined,
			headers: { Referer: pageUrl },
		};
	},

	search: async function(query, page) {
		var url = await this._searchUrl(query, page || 0);
		cinder.log("[GenericDirectFixture] Search: " + url);
		var html = await this._fetchHtml(url);
		return await this._parseResults(html);
	},

	resolve: async function(item) {
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
				return await this._resolveHtmlDownloadPage(
					item,
					directUrl,
					item.url,
					this._clean(item && item.extra ? item.extra.md5 : "") || this._md5FromUrl(directUrl),
				);
			}
			return this._resolvedDownload(item, directUrl, item.url, this._isHtmlDownloadPageUrl(directUrl));
		}

		var pageUrl = this._absUrl(baseUrl, item.url || (item.extra ? item.extra.detailUrl : ""));
		if (!pageUrl) throw new Error("No fixture detail URL to resolve.");

		cinder.log("[LibGen] Resolve: " + pageUrl);
		var html = await this._fetchHtml(pageUrl);
		var nestedDownloadPage = this._extractHtmlDownloadPageUrl(
			html,
			baseUrl,
			this._clean(item && item.extra ? item.extra.md5 : "") || this._md5FromUrl(pageUrl),
		);
		if (nestedDownloadPage && nestedDownloadPage !== pageUrl) {
			return await this._resolveHtmlDownloadPage(
				item,
				nestedDownloadPage,
				pageUrl,
				this._clean(item && item.extra ? item.extra.md5 : "") || this._md5FromUrl(nestedDownloadPage),
			);
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
		href = this._absUrl(baseUrl, href);
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
				);
			}
			return this._resolvedDownload(item, href, pageUrl, this._isHtmlDownloadPageUrl(href));
		}

		var formDownload = await this._extractFormDownload(doc, pageUrl, baseUrl);
		if (formDownload) {
			var formFormat = this._supportedFormat(item && item.format);
			if (!formFormat) {
				throw new Error("LibGen result is not a supported Cinder format.");
			}
			formDownload.fileName = this._clean(item.title || "download") + "." + formFormat;
			return formDownload;
		}

		throw new Error("No fixture direct link or download form found.");
	},
};
