// ─── ReadComicOnline Extension for Cinder ─────────────────────
//
// Connects to readcomiconline.li for western comic reading.
// Search and chapter listing use regular fetch.
// Page images require fetchBrowser (WebView) since they're JS-loaded.
//
// This is a COMMUNITY EXTENSION — all site-specific logic is here,
// not in the Cinder app itself.

__cinderExport = {
	id: "readcomiconline",
	name: "ReadComicOnline",
	version: "1.0.4",
	icon: "📚",
	description: "Read Marvel, DC, Image and more comics from ReadComicOnline",
	contentType: "manga",

	capabilities: {
		search: true,
		discover: true,
		download: false,
		resolve: false,
		manga: true,
	},

	_baseUrl: "https://readcomiconline.li",

	// ── Search ───────────────────────────────────────

	async search(query, page = 0) {
		const url = `${this._baseUrl}/Search/Comic?keyword=${encodeURIComponent(query)}`;

		const res = await cinder.fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
				"Accept": "text/html",
			},
		});

		if (res.status !== 200) return [];

		const items = [];
		const seen = {};

		// The HTML structure is:
		//   <div class="section group list">
		//     <div class="col cover"><a href="/Comic/SLUG"><img title="TITLE" src="/Uploads/..." /></a></div>
		//     <div class="col info"><p><a href="/Comic/SLUG">TITLE</a></p></div>
		//   </div>
		//
		// We match each listing block by finding <img> tags inside cover links
		const blockRegex = /<a\s+href="\/Comic\/([^"]+)"[^>]*>\s*<img\s+title="([^"]*)"[^>]*src="([^"]*)"[^>]*>/g;
		let match;

		while ((match = blockRegex.exec(res.data)) !== null) {
			const slug = match[1];
			const title = match[2] || slug.replace(/-/g, " ");
			const coverPath = match[3];

			if (seen[slug]) continue;
			seen[slug] = true;

			let cover = "";
			if (coverPath.startsWith("/")) {
				cover = this._baseUrl + coverPath;
			} else if (coverPath.startsWith("http")) {
				cover = coverPath;
			}

			items.push({
				id: slug,
				title: title,
				author: "Unknown",
				cover: cover,
				url: `${this._baseUrl}/Comic/${slug}`,
				format: "comics",
				extra: { slug: slug },
			});
		}

		return items;
	},

	// ── Chapters (Issues) ────────────────────────────

	async getChapters(mangaId) {
		const url = `${this._baseUrl}/Comic/${mangaId}`;
		const res = await cinder.fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15",
				"Accept": "text/html",
			},
		});

		if (res.status !== 200) return [];

		const chapters = [];

		// Parse issue links via regex (more reliable than DOM for table rows)
		const issueRegex = /href="(\/Comic\/[^"]*\/Issue-([^"?]+)[^"]*)"/g;
		let match;
		const seen = {};

		while ((match = issueRegex.exec(res.data)) !== null) {
			const fullPath = match[1];
			const issueNum = match[2];
			const key = issueNum;

			if (seen[key]) continue;
			seen[key] = true;

			chapters.push({
				id: fullPath,
				title: `Issue #${issueNum.replace(/-/g, ".")}`,
				chapter: issueNum.replace(/-/g, "."),
				url: this._baseUrl + fullPath,
			});
		}

		// Also check for full-issue / TPB links
		const fullRegex = /href="(\/Comic\/[^"]*\/Full[^"]*)"/g;
		while ((match = fullRegex.exec(res.data)) !== null) {
			const fullPath = match[1];
			if (seen["full"]) continue;
			seen["full"] = true;

			chapters.push({
				id: fullPath,
				title: "Full Issue",
				chapter: "0",
				url: this._baseUrl + fullPath,
			});
		}

		// Reverse so Issue #1 is at the top
		return chapters.reverse();
	},

	// ── Pages (Images) ───────────────────────────────

	async *getPages(chapterId) {
		// readType=1 = all pages on one page
		const url = `${this._baseUrl}${chapterId}${chapterId.includes("?") ? "&" : "?"}readType=1`;

		// Page images start with empty src="" and are populated by obfuscated JS.
		// We use fetchBrowser (WebView) which runs the JS, then extract once images load.
		const res = await cinder.fetchBrowser(url);

		if (!res.data) return;

		// After WebView JS runs, images should have their src populated.
		// Find all <img> tags with non-empty src that look like comic page images.
		const imgRegex = /<img[^>]*src="(https?:\/\/[^"]+)"[^>]*>/gi;
		let match;
		const seen = {};
		
		let currentChunk = [];

		while ((match = imgRegex.exec(res.data)) !== null) {
			const src = match[1];
			if (seen[src]) continue;
			// Skip site chrome images (ads, icons, avatars, loading gif)
			if (src.includes("/Content/") || src.includes("/Uploads/") ||
				src.includes("icon") || src.includes("logo") ||
				src.includes("avatar") || src.includes("loading") ||
				src.includes("google") || src.includes("analytics") ||
				src.includes(".gif") || src.includes("dreemy") ||
				src.includes("ads") || src.includes("banner")) continue;
			seen[src] = true;
			currentChunk.push({ url: src });
			
			if (currentChunk.length >= 3) {
				yield currentChunk;
				currentChunk = [];
			}
		}
		
		if (currentChunk.length > 0) {
			yield currentChunk;
		}
	},

	// ── Manga Details ────────────────────────────────

	async getMangaDetails(id) {
		const url = `${this._baseUrl}/Comic/${id}`;
		const res = await cinder.fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15",
				"Accept": "text/html",
			},
		});

		if (res.status !== 200) throw new Error("Failed to load comic details");

		const doc = cinder.parseHTML(res.data);

		const title = (doc.querySelector(".barContent h2, .bigChar") || {}).text?.() || id.replace(/-/g, " ");
		const descEl = doc.querySelector(".summary, .barContent p");
		const description = descEl ? descEl.text().trim() : "";

		const coverEl = doc.querySelector(".rightBox img, .barContent img");
		let cover = "";
		if (coverEl) {
			const src = coverEl.attr("src") || "";
			cover = src.startsWith("/") ? this._baseUrl + src : src;
		}

		// Extract genres
		const genres = [];
		const genreLinks = doc.querySelectorAll("a[href*='Genre']");
		for (const g of genreLinks) {
			const text = g.text().trim();
			if (text) genres.push(text);
		}

		return {
			id: id,
			title: title,
			author: "Various",
			description: description,
			cover: cover,
			genres: genres,
			status: "unknown",
		};
	},

	// ── Discover ─────────────────────────────────────

	async getDiscoverSections() {
		return [
			{ id: "popular", title: "🔥 Popular Comics", icon: "flame" },
			{ id: "latest", title: "📚 Latest Updates", icon: "time" },
		];
	},

	async getDiscoverItems(sectionId, page = 0) {
		let url;
		if (sectionId === "popular") {
			url = `${this._baseUrl}/ComicList/MostPopular`;
		} else {
			url = `${this._baseUrl}/ComicList/LatestUpdate`;
		}

		if (page > 0) {
			url += `?page=${page + 1}`;
		}

		const res = await cinder.fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15",
				"Accept": "text/html",
			},
		});

		if (res.status !== 200) return [];

		// Reuse search parser (same HTML structure)
		return this._parseComicList(res.data);
	},

	_parseComicList(html) {
		const items = [];
		const linkRegex = /href="\/Comic\/([^"]+)"[^>]*>/g;
		const coverRegex = /src="(\/Uploads[^"]+)"/g;
		const titleRegex = /title="([^"]+)"/g;

		const comics = [];
		let match;
		while ((match = linkRegex.exec(html)) !== null) {
			const slug = match[1];
			if (comics.some(c => c === slug)) continue;
			comics.push(slug);
		}

		const covers = [];
		while ((match = coverRegex.exec(html)) !== null) {
			covers.push(this._baseUrl + match[1]);
		}

		for (let i = 0; i < comics.length; i++) {
			items.push({
				id: comics[i],
				title: comics[i].replace(/-/g, " "),
				author: "Unknown",
				cover: covers[i] || "",
				url: `${this._baseUrl}/Comic/${comics[i]}`,
				format: "comics",
			});
		}

		return items;
	},

	// ── Settings ──────────────────────────────────────

	getSettings() {
		return [];
	},
};
