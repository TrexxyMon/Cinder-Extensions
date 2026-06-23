__cinderExport = {
	id: "oceanofpdf",
	name: "OceanofPDF",
	version: "0.1.3",
	icon: "OPDF",
	description: "OceanofPDF download-source extension with separate EPUB/PDF results and POST form downloads.",
	contentType: "books",
	contentTypes: ["ebook"],
	excludeFromDefaultMetadataProviders: true,

	capabilities: {
		search: true,
		discover: false,
		download: true,
		resolve: true,
		searchDownloads: true,
		manga: false,
	},

	_BASE_URL: "https://oceanofpdf.com",

	_absUrl: function(url) {
		if (!url) return "";
		if (url.indexOf("//") === 0) return "https:" + url;
		if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return url;
		if (url.charAt(0) === "/") return this._BASE_URL + url;
		return this._BASE_URL + "/" + url;
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

	_fetchPage: async function(url) {
		try {
			var resp = await cinder.fetch(url, {
				headers: {
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en-US,en;q=0.8",
					"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
				},
				timeout: 30000,
			});
			if (this._isUsableHtml(resp)) return resp;
			cinder.warn("[OceanofPDF] Fetch returned challenge/unusable HTML, using browser fetch.");
		} catch (err) {
			cinder.warn("[OceanofPDF] Fetch failed, using browser fetch: " + err);
		}

		return await cinder.fetchBrowser(url, {
			headers: {
				"X-Cinder-Suppress-Interactive": "1",
			},
			timeout: 60000,
		});
	},

	_isUsableHtml: function(resp) {
		if (!resp || resp.status < 200 || resp.status >= 400) return false;
		var data = resp.data || "";
		if (data.length < 1000) return false;
		var lower = data.toLowerCase();
		if (lower.indexOf("cf-challenge") !== -1) return false;
		if (lower.indexOf("enable javascript and cookies") !== -1) return false;
		if (lower.indexOf("just a moment") !== -1 && lower.indexOf("cloudflare") !== -1) return false;
		return true;
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

	_extractDownloadForms: function(html) {
		var doc = cinder.parseHTML(html);
		var forms = doc.querySelectorAll('form[action*="Fetching_Resource.php"]');
		var results = [];

		for (var i = 0; i < forms.length; i++) {
			try {
				var form = forms[i];
				var endpoint = this._absUrl(form.attr("action") || "");
				var idInput = form.querySelector('input[name="id"]');
				var fileInput = form.querySelector('input[name="filename"]');
				var requestId = this._clean(idInput ? idInput.attr("value") || "" : "");
				var fileName = this._clean(fileInput ? fileInput.attr("value") || "" : "");
				if (!endpoint || !requestId || !fileName) continue;

				var format = "";
				var extMatch = fileName.toLowerCase().match(/\.([a-z0-9]{2,5})(?:\s|$)/);
				if (extMatch) format = extMatch[1];

				results.push({
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

	_extractDownloadForms: function(html) {
		var doc = cinder.parseHTML(html);
		var forms = doc.querySelectorAll('form[action*="Fetching_Resource.php"]');
		var results = [];

		for (var i = 0; i < forms.length; i++) {
			try {
				var form = forms[i];
				var endpoint = this._absUrl(form.attr("action") || "");
				var idInput = form.querySelector('input[name="id"]');
				var fileInput = form.querySelector('input[name="filename"]');
				var requestId = this._clean(idInput ? idInput.attr("value") || "" : "");
				var fileName = this._clean(fileInput ? fileInput.attr("value") || "" : "");
				if (!endpoint || !requestId || !fileName) continue;

				var format = "";
				var extMatch = fileName.toLowerCase().match(/\.([a-z0-9]{2,5})(?:\s|$)/);
				if (extMatch) format = extMatch[1];

				results.push({
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

	_parseResultArticles: function(html) {
		var doc = cinder.parseHTML(html);
		var articles = doc.querySelectorAll("main#genesis-content article.entry");
		var results = [];

		for (var i = 0; i < articles.length; i++) {
			try {
				var article = articles[i];
				var titleLink = article.querySelector("h2.entry-title a.entry-title-link") ||
					article.querySelector("h1.entry-title a.entry-title-link");
				if (!titleLink) continue;

				var title = this._clean(titleLink.text());
				var url = this._absUrl(titleLink.attr("href") || "");
				if (!title || !url) continue;

				var meta = article.querySelector(".postmetainfo");
				var metaText = meta ? this._clean(meta.text()).replace(/\s*(Author|Language|Genre)\s*:/g, "\n$1:") : "";
				var author = this._extractMetaValue(metaText, "Author");
				var genre = this._extractMetaValue(metaText, "Genre");

				var image = article.querySelector("a.entry-image-link img") ||
					article.querySelector("img.entry-image") ||
					article.querySelector("img");
				var cover = "";
				if (image) cover = image.attr("data-src") || image.attr("src") || "";
				cover = this._absUrl(cover);
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
						extra: {
							genre: genre || undefined,
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

	search: async function(query, page) {
		page = page || 0;
		var url = page > 0
			? this._BASE_URL + "/page/" + (page + 1) + "/?s=" + encodeURIComponent(query)
			: this._BASE_URL + "/?s=" + encodeURIComponent(query);
		cinder.log("[OceanofPDF] Search: " + url);
		var resp = await this._fetchPage(url);
		if (!this._isUsableHtml(resp)) return [];
		return this._parseResultArticles(resp.data).slice(0, 50);
	},

	resolve: async function(item) {
		var preferredFormat =
			String(item.format || item.extra?.preferredFormat || "epub").toLowerCase();
		if (!item?.url) throw new Error("OceanofPDF item is missing a source page URL.");

		var resp = await cinder.fetchBrowser(item.url, {
			headers: {
				"X-Cinder-Suppress-Interactive": "1",
			},
			timeout: 60000,
		});
		if (!this._isUsableHtml(resp)) {
			resp = await this._fetchPage(item.url);
		}
		if (!this._isUsableHtml(resp)) {
			throw new Error("OceanofPDF detail page could not be loaded.");
		}

		var forms = this._extractDownloadForms(resp.data || "");
		var selected = this._pickDownloadForm(forms, preferredFormat);
		if (!selected) {
			throw new Error("OceanofPDF download form was not found on the detail page.");
		}

		return {
			url: selected.endpoint,
			fileName: selected.fileName,
			headers: item.url
				? {
					Referer: item.url,
					"X-Cinder-Expect-Interstitial": "1",
				}
				: undefined,
			downloadRequest: {
				method: "POST",
				bodyEncoding: "form",
				body: {
					id: selected.requestId,
					filename: selected.fileName,
				},
				useBrowser: true,
			},
		};
	},
};
