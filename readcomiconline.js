// ─── ReadComicOnline Extension for Cinder ─────────────────────
//
// Connects to rcostation.xyz for western comic reading.
// Search and chapter listing use regular fetch.
// Page images require fetchBrowser (WebView) since they're JS-loaded.
//
// This is a COMMUNITY EXTENSION — all site-specific logic is here,
// not in the Cinder app itself.

__cinderExport = {
	id: "readcomiconline",
	name: "ReadComicOnline",
	version: "1.0.13",
	icon: "📚",
	description: "Read Marvel, DC, Image and more comics from ReadComicOnline",
	contentType: "comics",
	contentTypes: ["comic"],
	contentSubtypes: ["westernComic"],

	capabilities: {
		search: true,
		discover: true,
		download: false,
		resolve: false,
		manga: true,
	},

	_baseUrl: "https://rcostation.xyz",

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
		const baseUrl = this._baseUrl;
		const url = `${baseUrl}/Comic/${mangaId}`;
		const res = await cinder.fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15",
				"Accept": "text/html",
			},
		});

		if (res.status !== 200) return [];

		const chapters = [];
		const seen = {};
		const escapedMangaId = mangaId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

		function decodeHtml(value) {
			return (value || "")
				.replace(/&amp;/g, "&")
				.replace(/&#39;/g, "'")
				.replace(/&quot;/g, '"')
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.replace(/\s+/g, " ")
				.trim();
		}

		function labelFromSlug(slug) {
			let decodedSlug = (slug || "").split("?")[0];
			try {
				decodedSlug = decodeURIComponent(decodedSlug);
			} catch {}

			const cleanSlug = decodedSlug
				.replace(/-/g, " ")
				.trim();
			if (!cleanSlug) return "Issue";
			return cleanSlug
				.replace(/\bTPB\b/gi, "TPB")
				.replace(/\bIssue\s+(\d+)/i, "Issue #$1");
		}

		function addChapter(fullPath, rawText) {
			const normalizedPath = fullPath.replace(/&amp;/g, "&");
			const parts = normalizedPath.match(/^\/Comic\/[^/]+\/([^?#]+)(?:[?#].*)?$/);
			const slug = parts ? parts[1] : "";
			const key = normalizedPath.toLowerCase();
			if (!slug || seen[key]) return;
			seen[key] = true;

			const title = decodeHtml(rawText) || labelFromSlug(slug);
			const numberMatch = slug.match(/(?:Issue|TPB|Chapter|Part|Annual|Special)-?(\d+(?:-\d+)?)/i);
			const chapter = numberMatch
				? numberMatch[1].replace(/-/g, ".")
				: String(chapters.length + 1);

			chapters.push({
				id: normalizedPath,
				title,
				chapter,
				url: baseUrl + normalizedPath,
			});
		}

		// Parse all issue-style links for this comic from the listing table.
		// Some series use Issue-#, but collected editions use TPB-#, Annual,
		// Special, or other suffixes. Restrict to the current comic slug so
		// navigation/self/comment links are not treated as chapters.
		const issueRegex = new RegExp(
			`<a\\s+[^>]*href=["'](\\/Comic\\/${escapedMangaId}\\/[^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>`,
			"gi",
		);
		let match;
		while ((match = issueRegex.exec(res.data)) !== null) {
			const fullPath = match[1];
			const text = match[2].replace(/<[^>]+>/g, "");
			addChapter(fullPath, text);
		}

		// Legacy fallback for old pages where the anchor text may not be inside
		// the expected listing markup.
		const fullRegex = new RegExp(
			`href=["'](\\/Comic\\/${escapedMangaId}\\/Full[^"']*)["']`,
			"gi",
		);
		while ((match = fullRegex.exec(res.data)) !== null) {
			const fullPath = match[1];
			addChapter(fullPath, "Full Issue");
		}

		// Reverse so Issue #1 is at the top
		return chapters.reverse();
	},

	// ── Pages (Images) ───────────────────────────────

	async getPages(chapterId) {
		// readType=1 = all pages on one page
		const url = `${this._baseUrl}${chapterId}${chapterId.includes("?") ? "&" : "?"}readType=1`;
		const headers = {
			"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
			"Referer": this._baseUrl + "/",
		};

		const res = await cinder.fetch(url, { headers });
		if (res.status !== 200 || !res.data) return [];

		const pages = [];
		const seen = {};

		function addPage(src) {
			src = (src || "").trim();
			if (!src || seen[src] || !isValidPageImage(src)) return;
			seen[src] = true;
			pages.push({ url: src });
		}

		function isValidPageImage(src) {
			if (!/^https?:\/\//i.test(src)) return false;

			const hostMatch = src.match(/^https?:\/\/([^/?#]+)/i);
			const host = hostMatch ? hostMatch[1].toLowerCase() : "";
			const path = src.split("?")[0].toLowerCase();

			const isPageHost =
				/(^|\.)bp\.blogspot\.com$/.test(host) ||
				/(^|\.)googleusercontent\.com$/.test(host);
			if (!isPageHost) return false;

			if (path.includes("/content/") || path.includes("/uploads/")) return false;
			if (/(?:icon|logo|avatar|loading|analytics|dreemy|ads|banner|doubleclick|tracking|pixel)/i.test(path)) return false;
			if (/\.(?:gif|svg)(?:[?#]|$)/i.test(src)) return false;

			return true;
		}

		function escapeRegExp(value) {
			return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}

		function getETokens(html) {
			const tokens = ["kQ__Wgp3Ez_"];
			const tokenRegex = /pth\s*=\s*pth\.replace\(\/([^/]+)\/g,\s*['"]e['"]\);/g;
			let tokenMatch;

			while ((tokenMatch = tokenRegex.exec(html)) !== null) {
				const token = tokenMatch[1];
				if (token && !tokens.includes(token)) tokens.push(token);
			}

			return tokens;
		}

		function replaceETokens(value, tokens) {
			let current = value;
			for (const token of tokens) {
				current = current.replace(new RegExp(escapeRegExp(token), "g"), "e");
			}
			return current;
		}

		function step1(value) {
			return value.substring(15, 33) + value.substring(50);
		}

		function step2(value) {
			return value.substring(0, value.length - 11) + value[value.length - 2] + value[value.length - 1];
		}

		function decodeBase64(value) {
			try {
				return decodeURIComponent(escape(atob(value)));
			} catch (err) {
				try { return atob(value); } catch (err2) { return ""; }
			}
		}

		function decodeRcoPath(value, eTokens) {
			let current = replaceETokens(value, eTokens)
				.replace(/b/g, "pw_.g28x")
				.replace(/h/g, "d2pr.x_27")
				.replace(/pw_.g28x/g, "b")
				.replace(/d2pr.x_27/g, "h");

			if (current.indexOf("https") === 0) return current;

			const queryIndex = current.indexOf("?");
			const s0Index = current.indexOf("=s0?");
			const s1600Index = current.indexOf("=s1600?");
			const suffixIndex = s0Index > 0 ? s0Index : s1600Index;
			if (queryIndex < 0 || suffixIndex < 0) return "";

			const query = current.substring(queryIndex);
			const encoded = current.substring(0, suffixIndex);
			let decoded = decodeBase64(step2(step1(encoded)));
			if (!decoded) return "";

			decoded = decoded.substring(0, 13) + decoded.substring(17);
			decoded = decoded.substring(0, decoded.length - 2) + (s0Index > 0 ? "=s0" : "=s1600");
			return "https://2.bp.blogspot.com/" + decoded + query;
		}

		// Current RCO pages embed obfuscated image paths in pth assignments.
		const eTokens = getETokens(res.data);
		const pthRegex = /pth\s*=\s*'([^']+)'[\s\S]*?\.push\(pth\);/g;
		let match;
		while ((match = pthRegex.exec(res.data)) !== null) {
			addPage(decodeRcoPath(match[1], eTokens));
		}

		// Fallback for older pages only. Do not mix this into decoded pth pages;
		// page HTML can contain cover, tracking, and site images too.
		if (pages.length === 0) {
			const pushedUrlRegex = /\.push\(['"](https?:\/\/[^'"]+)['"]\);/g;
			while ((match = pushedUrlRegex.exec(res.data)) !== null) {
				addPage(replaceETokens(match[1], eTokens));
			}

			const imgRegex = /<img[^>]*src="(https?:\/\/[^\"]+)"[^>]*>/gi;
			while ((match = imgRegex.exec(res.data)) !== null) {
				addPage(replaceETokens(match[1], eTokens));
			}
		}

		return pages;
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

