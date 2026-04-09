// ─── LibCats / Booksee Extension ────────────────────────────
//
// Searches en.booksee.org for ebooks and resolves direct
// download links from book detail pages.
//
// Uses fetchBrowser (WebView) to bypass Cloudflare protection
// since booksee.org/libcats.org return 403 to regular HTTP clients.

__cinderExport = {
	id: "libcats",
	name: "LibCats",
	version: "1.0.4",
	icon: "https://en.booksee.org/favicon-32x32.png",
	description: "Search and download ebooks from LibCats / Booksee (2.4M+ books)",
	contentType: "books",

	capabilities: {
		search: true,
		discover: false,
		download: false,
		resolve: true,
		manga: false,
	},

	_defaultUrl: "https://en.booksee.org",

	_headers: {
		"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
		"Accept": "text/html",
	},

	// ── Search ───────────────────────────────────────

	async search(query, page) {
		// Check for user-configured mirror URL (store.get is async!)
		var customUrl = await cinder.store.get("base_url");
		var baseUrl = (customUrl && customUrl.length > 5) ? customUrl : this._defaultUrl;
		var url = baseUrl + "/s/?q=" + encodeURIComponent(query) + "&t=0";

		cinder.log("[LibCats] Searching: " + url);

		// Cloudflare blocks regular HTTP — must use WebView
		var res = await cinder.fetchBrowser(url);

		cinder.log("[LibCats] Response status: " + res.status + ", data length: " + (res.data ? res.data.length : 0));

		if (!res.data || res.data.length < 500) {
			cinder.warn("[LibCats] Response too short or empty, likely blocked");
			return [];
		}

		// Try DOM parsing first
		var doc = cinder.parseHTML(res.data);
		var items = doc.querySelectorAll(".resItemBox");

		cinder.log("[LibCats] DOM found " + items.length + " .resItemBox items");

		if (items.length > 0) {
			return this._parseDomResults(items, baseUrl);
		}

		// Fallback: regex parsing
		cinder.log("[LibCats] Trying regex fallback...");
		return this._regexSearch(res.data, baseUrl);
	},

	_parseDomResults(items, baseUrl) {
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
				extra: {},
			});
		}

		cinder.log("[LibCats] DOM parsed " + results.length + " results");
		return results;
	},

	// Regex fallback parser
	_regexSearch(html, baseUrl) {
		var results = [];
		// Match: <a href="book/1032894" ><h3 class="color1" itemprop="name">The Way of Kings</h3></a>
		var blockRegex = /href="[^"]*book\/(\d+)"[^>]*>\s*<h3[^>]*>([^<]+)<\/h3>/g;
		var match;

		while ((match = blockRegex.exec(html)) !== null) {
			var bookId = match[1];
			var title = match[2].trim();
			if (!bookId || !title) continue;

			results.push({
				id: bookId,
				title: title,
				author: "Unknown Author",
				cover: undefined,
				url: baseUrl + "/book/" + bookId,
				extra: {},
			});
		}

		cinder.log("[LibCats] Regex fallback found " + results.length + " results");
		return results;
	},

	// ── Resolve ──────────────────────────────────────

	async resolve(item) {
		cinder.log("[LibCats] Resolving: " + item.url);

		// Use WebView to bypass Cloudflare on detail page too
		var res = await cinder.fetchBrowser(item.url);

		if (!res.data || res.data.length < 500) {
			throw new Error("Failed to load book page (empty/blocked response)");
		}

		// Download link: <a class="button active" href="//booksee.org/dl/1032894/789940">
		var dlMatch = res.data.match(/href="([^"]*\/dl\/\d+\/[^"]*)"/);
		if (!dlMatch) {
			cinder.warn("[LibCats] No /dl/ link found in response");
			throw new Error("No download link found on the book page.");
		}

		var dlHref = dlMatch[1];
		if (dlHref.indexOf("//") === 0) dlHref = "https:" + dlHref;
		if (dlHref.indexOf("http") !== 0) dlHref = "https://booksee.org" + dlHref;

		cinder.log("[LibCats] Download URL: " + dlHref);

		// Detect format: "(epub, 3.77 Mb)"
		var format = "epub";
		var fmtMatch = res.data.match(/\((\w+),\s*[\d.,]+\s*(?:Kb|Mb|Gb)\)/i);
		if (fmtMatch) {
			format = fmtMatch[1].toLowerCase();
		}

		return {
			url: dlHref,
			fileName: item.title + "." + format,
			headers: {
				"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15",
				"Referer": item.url,
			},
			fileSize: null,
		};
	},

	// ── Settings ──────────────────────────────────────

	getSettings() {
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
