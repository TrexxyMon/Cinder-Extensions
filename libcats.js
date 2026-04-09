// ─── LibCats / Booksee Extension ────────────────────────────
//
// Searches en.booksee.org (mirrors: en.libcats.org) for ebooks
// and resolves direct download links from book detail pages.
//
// Search:  https://en.booksee.org/s/?q={query}&t=0
// Detail:  https://en.booksee.org/book/{id}
// Download: https://libcats.org/dl/{id}/{hash}

__cinderExport = {
	id: "libcats",
	name: "LibCats",
	version: "1.0.0",
	icon: "📚",
	description: "Search and download ebooks from LibCats / Booksee (2.4M+ books)",
	contentType: "books",

	capabilities: {
		search: true,
		discover: false,
		download: false,
		resolve: true,
		manga: false,
	},

	_getBaseUrl: function () {
		var custom = cinder.store.get("base_url");
		return custom || "https://en.booksee.org";
	},

	_headers: {
		"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
		"Accept": "text/html",
		"Accept-Language": "en-US,en;q=0.9",
	},

	async search(query, page) {
		var baseUrl = this._getBaseUrl();
		var url = baseUrl + "/s/?q=" + encodeURIComponent(query) + "&t=0";

		var res = await cinder.fetch(url, {
			headers: this._headers,
			timeout: 15000,
		});

		if (res.status !== 200) {
			cinder.warn("[LibCats] Search failed with status: " + res.status);
			return [];
		}

		var doc = cinder.parseHTML(res.data);
		var items = doc.querySelectorAll(".resItemBox");
		var results = [];

		for (var i = 0; i < items.length; i++) {
			var item = items[i];

			// Extract book link and ID
			var linkEl = item.querySelector("a[href*='book/']");
			if (!linkEl) continue;
			var href = linkEl.attr("href") || "";
			var bookId = href.replace(/.*book\//, "").replace(/[^0-9]/g, "");
			if (!bookId) continue;

			// Title
			var titleEl = item.querySelector("h3");
			var title = titleEl ? titleEl.text().trim() : "Unknown";

			// Author(s)
			var authorEls = item.querySelectorAll("a[itemprop='author']");
			var authors = [];
			for (var a = 0; a < authorEls.length; a++) {
				var authorText = authorEls[a].text().trim();
				if (authorText) authors.push(authorText);
			}
			var author = authors.join(", ") || "Unknown Author";

			// Cover
			var imgEl = item.querySelector("img");
			var cover = imgEl ? imgEl.attr("src") : "";
			if (cover && cover.indexOf("//") === 0) cover = "https:" + cover;
			if (cover && cover.indexOf("blank_80") !== -1) cover = "";

			// Size
			var sizeText = "";
			var actionsEl = item.querySelector(".actionsHolder");
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
				extra: {},
			});
		}

		return results;
	},

	async resolve(item) {
		var res = await cinder.fetch(item.url, {
			headers: this._headers,
			timeout: 15000,
		});

		if (res.status !== 200) {
			throw new Error("Failed to load book page (status " + res.status + ")");
		}

		var doc = cinder.parseHTML(res.data);

		// Find the main download button: <a class="button active" href="//libcats.org/dl/1032894/789940">
		var dlButton = doc.querySelector("a.active[href*='/dl/']");
		if (!dlButton) {
			dlButton = doc.querySelector("a[href*='/dl/']");
		}
		if (!dlButton) {
			throw new Error("No download link found on the book page.");
		}

		var dlHref = dlButton.attr("href") || "";
		if (dlHref.indexOf("//") === 0) dlHref = "https:" + dlHref;
		if (dlHref.indexOf("http") !== 0) dlHref = "https://libcats.org" + dlHref;

		// Detect format from the text near the download button, e.g. "(epub, 3.77 Mb)"
		var format = "epub";
		var detailsEl = doc.querySelector("#book_details_rc");
		if (detailsEl) {
			var fullText = detailsEl.text();
			var fmtMatch = fullText.match(/\((\w+),\s*[\d.,]+\s*(?:Kb|Mb|Gb)\)/i);
			if (fmtMatch) {
				format = fmtMatch[1].toLowerCase();
			}
		}

		return {
			url: dlHref,
			fileName: item.title + "." + format,
			headers: {
				"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
				"Referer": item.url,
			},
			fileSize: null,
		};
	},

	getSettings: function () {
		return [
			{
				id: "base_url",
				label: "Mirror URL",
				type: "text",
				defaultValue: "https://en.booksee.org",
				placeholder: "https://en.booksee.org",
			},
		];
	},
};
