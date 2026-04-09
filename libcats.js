// ─── LibCats / Booksee Extension ────────────────────────────
//
// Searches en.booksee.org (mirrors: en.libcats.org) for ebooks
// and resolves direct download links from book detail pages.
//
// Uses fetchBrowser (WebView) to bypass Cloudflare protection.

__cinderExport = {
	id: "libcats",
	name: "LibCats",
	version: "1.0.2",
	icon: "https://en.booksee.org/favicon-32x32.png",
	description: "Search and download ebooks from LibCats / Booksee (2.4M+ books)",
	contentType: "books",

	capabilities: {
		search: true,
		discover: false,
		download: false,
		resolve: true,
		manga: false
	},

	_getBaseUrl: function() {
		var custom = cinder.store.get("base_url");
		return custom || "https://en.booksee.org";
	},

	search: function(query, page) {
		var self = this;
		var baseUrl = self._getBaseUrl();
		var url = baseUrl + "/s/?q=" + encodeURIComponent(query) + "&t=0";

		// Use fetchBrowser (WebView) to bypass Cloudflare protection
		return cinder.fetchBrowser(url).then(function(res) {
			if (!res.data || res.data.length < 200) {
				cinder.warn("[LibCats] Empty or blocked response, length: " + (res.data ? res.data.length : 0));
				return [];
			}

			var doc = cinder.parseHTML(res.data);
			var items = doc.querySelectorAll(".resItemBox");

			if (items.length === 0) {
				cinder.warn("[LibCats] No .resItemBox items found in HTML (len=" + res.data.length + ")");
				return [];
			}

			var results = [];

			for (var i = 0; i < items.length; i++) {
				var el = items[i];

				var linkEl = el.querySelector("a[href*='book/']");
				if (!linkEl) continue;
				var href = linkEl.attr("href") || "";
				var bookId = href.replace(/.*book\//, "").replace(/[^0-9]/g, "");
				if (!bookId) continue;

				var titleEl = el.querySelector("h3");
				var title = titleEl ? titleEl.text().trim() : "Unknown";

				var authorEls = el.querySelectorAll("a[itemprop='author']");
				var authors = [];
				for (var a = 0; a < authorEls.length; a++) {
					var authorText = authorEls[a].text().trim();
					if (authorText) authors.push(authorText);
				}
				var author = authors.join(", ") || "Unknown Author";

				var imgEl = el.querySelector("img");
				var cover = imgEl ? imgEl.attr("src") : "";
				if (cover && cover.indexOf("//") === 0) cover = "https:" + cover;
				if (cover && cover.indexOf("blank_80") !== -1) cover = "";

				var sizeText = "";
				var actionsEl = el.querySelector(".actionsHolder");
				if (actionsEl) {
					var rawText = actionsEl.text();
					var sizeMatch = rawText.match(/([\d.,]+)\s*(Kb|Mb|Gb)/i);
					if (sizeMatch) {
						sizeText = sizeMatch[1] + " " + sizeMatch[2];
					}
				}

				results.push({
					id: bookId,
					title: title,
					author: author,
					cover: cover || undefined,
					url: baseUrl + "/book/" + bookId,
					size: sizeText || undefined,
					extra: {}
				});
			}

			cinder.log("[LibCats] Found " + results.length + " results");
			return results;
		});
	},

	resolve: function(item) {
		// Use fetchBrowser for the detail page too (Cloudflare)
		return cinder.fetchBrowser(item.url).then(function(res) {
			if (!res.data || res.data.length < 200) {
				throw new Error("Failed to load book page (empty response)");
			}

			var doc = cinder.parseHTML(res.data);

			// Download link: <a class="button active" href="//booksee.org/dl/1032894/789940">
			var dlButton = doc.querySelector("a.active[href*='/dl/']");
			if (!dlButton) {
				dlButton = doc.querySelector("a[href*='/dl/']");
			}
			if (!dlButton) {
				throw new Error("No download link found on the book page.");
			}

			var dlHref = dlButton.attr("href") || "";
			if (dlHref.indexOf("//") === 0) dlHref = "https:" + dlHref;
			if (dlHref.indexOf("http") !== 0) dlHref = "https://booksee.org" + dlHref;

			// Detect format from text near download button: "(epub, 3.77 Mb)"
			var format = "epub";
			var fullText = res.data;
			var fmtMatch = fullText.match(/Download\s*<\/a><\/b>\s*\((\w+),/i);
			if (fmtMatch) {
				format = fmtMatch[1].toLowerCase();
			} else {
				// fallback: look for (format, size) pattern anywhere in details
				var altMatch = fullText.match(/\((\w+),\s*[\d.,]+\s*(?:Kb|Mb|Gb)\)/i);
				if (altMatch) {
					format = altMatch[1].toLowerCase();
				}
			}

			return {
				url: dlHref,
				fileName: item.title + "." + format,
				headers: {
					"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
					"Referer": item.url
				},
				fileSize: null
			};
		});
	},

	getSettings: function() {
		return [
			{
				id: "base_url",
				label: "Mirror URL",
				type: "text",
				defaultValue: "https://en.booksee.org",
				placeholder: "https://en.booksee.org"
			}
		];
	}
};
