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
	version: "1.0.16",
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
		const baseUrl = "https://rcostation.xyz";
		const rawQuery = String(query || "").trim();
		if (!rawQuery) return [];

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

		function normalizeComicSlug(value) {
			let raw = String(value || "").trim();
			if (!raw) return "";
			raw = raw.replace(baseUrl, "");
			raw = raw.replace(/^https?:\/\/[^/]+/i, "");
			raw = raw.replace(/^\/?Comic\//i, "");
			raw = raw.replace(/^\/+/, "");
			raw = raw.split(/[?#]/)[0];
			raw = raw.split("/")[0];
			return raw.trim();
		}

		function addItem(items, seen, rawSlug, title, coverPath) {
			const slug = normalizeComicSlug(rawSlug);
			if (!slug || seen[slug]) return;
			seen[slug] = true;

			let cover = "";
			if (coverPath) {
				if (coverPath.startsWith("/")) {
					cover = baseUrl + coverPath;
				} else if (coverPath.startsWith("http")) {
					cover = coverPath;
				}
			}

			items.push({
				id: slug,
				title: decodeHtml(title) || slug.replace(/-/g, " "),
				author: "Unknown",
				cover: cover,
				url: `${baseUrl}/Comic/${slug}`,
				format: "comics",
				extra: { slug: slug },
			});
		}

		function parseResults(html) {
			const items = [];
			const seen = {};

			// Original working search result parser.
			const blockRegex = /<a\s+href="\/Comic\/([^"]+)"[^>]*>\s*<img\s+title="([^"]*)"[^>]*src="([^"]*)"[^>]*>/g;
			let match;
			while ((match = blockRegex.exec(html)) !== null) {
				addItem(items, seen, match[1], match[2], match[3]);
			}

			// Exact title searches can redirect to a detail page instead of the
			// search grid. Desktop pages expose bigChar; mobile pages may only
			// expose issue links and image_src.
			if (items.length === 0) {
				const detailMatch = html.match(
					/<a\s+[^>]*class=["'][^"']*\bbigChar\b[^"']*["'][^>]*href=["']\/Comic\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
				);
				if (detailMatch) {
					const coverMatch =
						html.match(/<link\s+rel=["']image_src["']\s+href=["']([^"']+)["']/i) ||
						html.match(/<img\s+[^>]*(?:width=["']190px["'][^>]*height=["']250px["']|height=["']250px["'][^>]*width=["']190px["'])[^>]*src=["']([^"']+)["']/i);
					addItem(
						items,
						seen,
						detailMatch[1],
						detailMatch[2].replace(/<[^>]+>/g, ""),
						coverMatch ? coverMatch[1] : "",
					);
				}
			}

			if (items.length === 0) {
				const issueMatch = html.match(/href=["']\/Comic\/([^\/"']+)\/[^"']+["']/i);
				if (issueMatch) {
					const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
					const title = decodeHtml(titleMatch ? titleMatch[1] : "")
						.replace(/\s+comic\s*\|\s*Read[\s\S]*$/i, "")
						.replace(/\s+comic\s+online[\s\S]*$/i, "")
						.trim();
					const coverMatch = html.match(
						/<link\s+rel=["']image_src["']\s+href=["']([^"']+)["']/i,
					);
					addItem(
						items,
						seen,
						issueMatch[1],
						title,
						coverMatch ? coverMatch[1] : "",
					);
				}
			}

			return items;
		}

		async function fetchSearch(currentQuery) {
			const url = `${baseUrl}/Search/Comic?keyword=${encodeURIComponent(currentQuery)}`;
			const res = await cinder.fetch(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
					"Accept": "text/html",
				},
			});

			if (res.status !== 200) return [];
			return parseResults(res.data || "");
		}

		const rawItems = await fetchSearch(rawQuery);
		if (rawItems.length > 0) return rawItems;

		const fallbackQueries = [];
		const seenQueries = {};
		function addQuery(value) {
			const text = String(value || "").replace(/\s+/g, " ").trim();
			const key = text.toLowerCase();
			if (!text || key === rawQuery.toLowerCase() || seenQueries[key]) return;
			seenQueries[key] = true;
			fallbackQueries.push(text);
		}

		const normalized = rawQuery
			.replace(/[’']/g, "")
			.replace(/[“”"]/g, "")
			.replace(/[:;,.!?()[\]{}]/g, " ")
			.replace(/[–—]/g, "-")
			.replace(/\s+/g, " ")
			.trim();
		addQuery(normalized);
		addQuery(rawQuery.split(":")[0]);
		addQuery(normalized.split(/\s+-\s+/)[0]);

		for (let i = 0; i < fallbackQueries.length; i++) {
			const items = await fetchSearch(fallbackQueries[i]);
			if (items.length > 0) return this._sortSearchResults(rawQuery, items);
		}

		return [];
	},

	// ── Search helpers ───────────────────────────────

	_sortSearchResults(query, items) {
		const queryTokens = this._normalizeSearchText(query)
			.split(" ")
			.filter((token) => token.length > 1);

		return [...items].sort((a, b) => {
			const scoreA = this._scoreSearchResult(queryTokens, a);
			const scoreB = this._scoreSearchResult(queryTokens, b);
			if (scoreA !== scoreB) return scoreB - scoreA;
			return 0;
		});
	},

	_scoreSearchResult(queryTokens, item) {
		const title = this._normalizeSearchText(item.title || item.id || "");
		if (!title) return 0;
		let score = 0;
		for (const token of queryTokens) {
			if (title.includes(token)) score += 1;
		}
		if (queryTokens.length > 0 && queryTokens.every((token) => title.includes(token))) {
			score += 5;
		}
		return score;
	},

	_normalizeSearchText(value) {
		return String(value || "")
			.toLowerCase()
			.replace(/[’']/g, "")
			.replace(/[“”"]/g, "")
			.replace(/[^a-z0-9]+/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	},

	async getChapters(mangaId) {
		const baseUrl = this._baseUrl;
		const comicSlug = this._normalizeComicSlug(mangaId);
		if (!comicSlug) return [];

		const url = `${baseUrl}/Comic/${comicSlug}`;
		const res = await cinder.fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
				"Accept": "text/html",
			},
		});

		if (res.status !== 200) return [];

		const chapters = [];
		const seen = {};
		const escapedMangaId = comicSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
		const comicSlug = this._normalizeComicSlug(id);
		if (!comicSlug) throw new Error("Invalid comic id");

		const url = `${this._baseUrl}/Comic/${comicSlug}`;
		const res = await cinder.fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15",
				"Accept": "text/html",
			},
		});

		if (res.status !== 200) throw new Error("Failed to load comic details");

		const doc = cinder.parseHTML(res.data);

		const title = (doc.querySelector(".barContent h2, .bigChar") || {}).text?.() || comicSlug.replace(/-/g, " ");
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
			id: comicSlug,
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
		const seen = {};
		let match;

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

		function textFromSlug(slug) {
			return slug.replace(/-/g, " ").trim();
		}

		const addComic = (rawPath, title, coverPath) => {
			const slug = this._normalizeComicSlug(rawPath);
			if (!slug || seen[slug]) return;
			seen[slug] = true;

			let cleanTitle = decodeHtml(title);
			if (
				!cleanTitle ||
				/^(issue|tpb|full|chapter|annual|special)\b/i.test(cleanTitle)
			) {
				cleanTitle = textFromSlug(slug);
			}

			let cover = "";
			if (coverPath) {
				const cleanCover = coverPath.replace(/&amp;/g, "&");
				cover = cleanCover.startsWith("/")
					? this._baseUrl + cleanCover
					: cleanCover;
			}

			items.push({
				id: slug,
				title: cleanTitle,
				author: "Unknown",
				cover,
				url: `${this._baseUrl}/Comic/${slug}`,
				format: "comics",
			});
		};

		// Prefer cover cards when present because they carry stable series links,
		// title text, and cover URLs together.
		const cardRegex = /<a\s+[^>]*href=["']\/Comic\/([^"']+)["'][^>]*>\s*<img\b([^>]*)>/gi;
		while ((match = cardRegex.exec(html)) !== null) {
			const rawPath = match[1];
			const attrs = match[2] || "";
			const titleMatch = attrs.match(/\btitle=["']([^"']*)["']/i);
			const srcMatch = attrs.match(/\bsrc=["']([^"']*)["']/i);
			addComic(rawPath, titleMatch ? titleMatch[1] : "", srcMatch ? srcMatch[1] : "");
		}

		// Fallback for list/table pages. Normalize issue-level hrefs like
		// /Comic/Series/Issue-4?id=123 back to /Comic/Series so chapter loading
		// cannot accidentally use another page as the parent comic.
		const anchorRegex = /<a\s+[^>]*href=["']\/Comic\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
		while ((match = anchorRegex.exec(html)) !== null) {
			const rawPath = match[1];
			const text = (match[2] || "").replace(/<[^>]+>/g, "");
			addComic(rawPath, text, "");
		}

		return items;
	},

	_normalizeComicSlug(value) {
		let raw = String(value || "").trim();
		if (!raw) return "";

		raw = raw.replace(this._baseUrl, "");
		raw = raw.replace(/^https?:\/\/[^/]+/i, "");
		raw = raw.replace(/^\/?Comic\//i, "");
		raw = raw.replace(/^\/+/, "");
		raw = raw.split(/[?#]/)[0];
		raw = raw.split("/")[0];
		return raw.trim();
	},

	// ── Settings ──────────────────────────────────────

	getSettings() {
		return [];
	},
};

