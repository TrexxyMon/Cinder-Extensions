// WeebCentral Extension for Cinder
// Manga, manhwa, and manhua from WeebCentral.com

__cinderExport = {
	id: "weebcentral",
	name: "WeebCentral",
	version: "1.0.6",
	icon: "📚",
	description: "Read manga, manhwa, and manhua from WeebCentral.com",
	contentType: "manga",

	capabilities: {
		search: true,
		discover: true,
		download: false,
		resolve: false,
		manga: true,
	},

	BASE_URL: "https://weebcentral.com",
	COVER_URL: "https://temp.compsci88.com/cover/fallback/",

	_coverUrl(id) {
		return this.COVER_URL + id + ".jpg";
	},

	_matchAll(html, patternStr, flags) {
		const results = [];
		const re = new RegExp(patternStr, flags || "gi");
		let match;
		while ((match = re.exec(html)) !== null) {
			results.push(match);
		}
		return results;
	},

	_match(html, patternStr, flags, fallback = "") {
		const re = new RegExp(patternStr, flags || "i");
		const m = re.exec(html);
		return m ? m[1].trim() : fallback;
	},

	_decode(str) {
		return str
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#039;/g, "'")
			.replace(/&apos;/g, "'");
	},

	_stripTags(str) {
		return str.replace(/<[^>]*>/g, "").trim();
	},

	_seriesIdFromUrl(url) {
		const m = /\/series\/([A-Z0-9]{20,})/i.exec(url);
		return m ? m[1] : null;
	},

	_chapterIdFromUrl(url) {
		const m = /\/chapters\/([A-Z0-9]{20,})/i.exec(url);
		return m ? m[1] : null;
	},

	// --- Search ---

	async search(query, page = 1) {
		const limit = 20;
		const offset = (Math.max(1, page) - 1) * limit;

		const res = await cinder.fetch(
			this.BASE_URL + "/search/simple?location=main&limit=" + limit + "&offset=" + offset,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					"User-Agent": "CinderApp/2.0 (iOS; Cinder)",
					"HX-Request": "true",
				},
				body: "text=" + encodeURIComponent(query),
			}
		);

		if (res.status === 200 && res.data && res.data.length > 10) {
			const results = this._parseSearchResults(res.data);
			if (results.length > 0) { return results; }
		}

		const fallback = await cinder.fetch(
			this.BASE_URL + "/search?text=" + encodeURIComponent(query) +
			"&limit=" + limit + "&offset=" + offset +
			"&official=Any&display_mode=Minimal%20Display&sort=Best+Match&order=Ascending&status=Any&type=Any",
			{
				headers: { "User-Agent": "CinderApp/2.0 (iOS; Cinder)" }
			}
		);

		if (fallback.status !== 200) {
			cinder.error("WeebCentral search failed: " + fallback.status);
			return [];
		}

		return this._parseSearchResults(fallback.data);
	},

	_parseSearchResults(html) {
		const results = [];
		const seen = {};

		const links = this._matchAll(
			html,
			'href="(https?://weebcentral\\.com/series/([A-Z0-9]{20,})[^"]*)"',
			"gi"
		);

		for (const link of links) {
			const href = link[1];
			const id = link[2];
			if (seen[id]) { continue; }
			seen[id] = true;

			const pos = html.indexOf(link[0]);
			const window = html.substring(pos, pos + 800);

			let title = this._match(window, 'alt="([^"]+)\\s+cover"', "i", "");

			if (!title) {
				title = this._match(window, '<div[^>]*truncate[^>]*>([^<]{2,})<\\/div>', "i", "");
			}

			if (!title) { continue; }
			title = this._decode(title.trim());

			results.push({
				id: id,
				title: title,
				cover: this._coverUrl(id),
				url: this.BASE_URL + "/series/" + id,
				format: "manga",
			});
		}

		return results;
	},

	// --- Discover ---

	async getDiscoverSections() {
		return [
			{ id: "latest",      title: "Latest Updates",   icon: "🆕" },
			{ id: "hot-weekly",  title: "Hot This Week",    icon: "🔥" },
			{ id: "hot-monthly", title: "Hot This Month",   icon: "📈" },
			{ id: "hot-alltime", title: "All-Time Popular", icon: "⭐" },
		];
	},

	async getDiscoverItems(sectionId, page = 0) {
		const limit = 20;
		const offset = page * limit;

		const sort = sectionId === "latest" ? "Latest+Updates" : "Most+Popular";

		const url =
			this.BASE_URL + "/search?text=" +
			"&limit=" + limit + "&offset=" + offset +
			"&official=Any&display_mode=Minimal%20Display" +
			"&sort=" + sort + "&order=Descending&status=Any&type=Any";

		const res = await cinder.fetch(url, {
			headers: { "User-Agent": "CinderApp/2.0 (iOS; Cinder)" }
		});

		if (res.status !== 200) { return []; }
		return this._parseSearchResults(res.data);
	},

	// --- Manga Details ---

	async getMangaDetails(id) {
		const url = this.BASE_URL + "/series/" + id;

		const res = await cinder.fetch(url, {
			headers: { "User-Agent": "CinderApp/2.0 (iOS; Cinder)" }
		});

		if (res.status !== 200) {
			throw new Error("Failed to fetch series: " + res.status);
		}

		const html = res.data;

		const title = this._decode(
			this._match(html, '<h1[^>]*>\\s*([^<]+?)\\s*<\\/h1>', "i", "Unknown")
		);

		const descRaw = this._match(
			html,
			'<p[^>]*whitespace-pre-wrap[^>]*>([\\s\\S]*?)<\\/p>',
			"i",
			""
		);
		const description = descRaw ? this._decode(this._stripTags(descRaw)) : "";

		const authorBlock = this._match(html, 'Author\\(s\\)[^<]*<\\/strong>([\\s\\S]*?)<\\/li>', "i", "");
		const author = authorBlock
			? this._decode(this._match(authorBlock, '>([^<]{2,})<\\/a>', "i", ""))
			: "";

		const statusBlock = this._match(html, '<strong>Status[^<]*<\\/strong>([\\s\\S]*?)<\\/li>', "i", "");
		const status = statusBlock
			? this._decode(this._match(statusBlock, '>([^<]{2,})<\\/a>', "i", ""))
			: "";

		const tagsBlock = this._match(html, 'Tags\\(s\\)[^<]*<\\/strong>([\\s\\S]*?)<\\/li>', "i", "");
		const tagMatches = tagsBlock
			? this._matchAll(tagsBlock, '>([^<,]+)<\\/a>', "gi")
			: [];
		const genres = tagMatches.map(m => this._decode(m[1].trim()));

		return {
			id: id,
			title: title,
			cover: this._coverUrl(id),
			description: description,
			author: author || undefined,
			status: status ? status.toLowerCase().trim() : undefined,
			genres: genres,
		};
	},

	// --- Chapters ---

	async getChapters(seriesId) {
		const url = this.BASE_URL + "/series/" + seriesId + "/full-chapter-list";

		const res = await cinder.fetch(url, {
			headers: {
				"User-Agent": "CinderApp/2.0 (iOS; Cinder)",
				"HX-Request": "true",
				"Accept": "text/html, */*",
			}
		});

		if (res.status !== 200) {
			throw new Error("Failed to fetch chapter list: " + res.status);
		}

		return this._parseChapterList(res.data);
	},

	_parseChapterList(html) {
		const chapters = [];

		const rows = this._matchAll(
			html,
			'href="https://weebcentral\\.com/chapters/([A-Z0-9]{20,})"[^>]*>([\\s\\S]*?)<\\/a>',
			"gi"
		);

		for (const row of rows) {
			const chapterId = row[1];
			const inner = row[2];

			// Try "Chapter 42" inside a span first
			let numStr = this._match(inner, '<span[^>]*>\\s*Chapter\\s+([\\d.]+)\\s*<\\/span>', "i", "");

			// Fallback: search the stripped text for any chapter number
			if (!numStr) {
				const text = this._decode(this._stripTags(inner)).trim();
				const m = /(?:Chapter|Ch\.?)\s*([\d.]+)/i.exec(text);
				if (m) {
					numStr = m[1];
				} else {
					const m2 = /([\d.]+)/.exec(text);
					if (m2) { numStr = m2[1]; }
				}
			}

			const chapterNumber = parseFloat(numStr) || 0;
			const dateStr = this._match(inner, 'datetime="([^"]+)"', "i", "");

			chapters.push({
				id: chapterId,
				title: "Chapter " + (numStr || "?"),
				chapterNumber: chapterNumber,
				dateUploaded: dateStr || undefined,
			});
		}

		chapters.reverse();
		return chapters;
	},

	// --- Pages ---

	async getPages(chapterId) {
		const url = this.BASE_URL + "/chapters/" + chapterId +
			"/images?is_prev=False&current_page=1&reading_style=long_strip";

		const res = await cinder.fetch(url, {
			headers: {
				"User-Agent": "CinderApp/2.0 (iOS; Cinder)",
				"HX-Request": "true",
				"Accept": "text/html, */*",
			}
		});

		if (res.status !== 200) {
			throw new Error("Failed to fetch pages: " + res.status);
		}

		return this._parsePages(res.data);
	},

	_parsePages(html) {
		const pages = [];
		const seen = {};

		const patterns = [
			'src="(https://temp\\.compsci88\\.com/manga/[^"]+)"',
			'data-src="(https://temp\\.compsci88\\.com/manga/[^"]+)"',
			'src="(https://[^"]+/manga/[^"]+\\.(?:jpg|jpeg|png|webp)[^"]*)"',
		];

		for (const pattern of patterns) {
			const matches = this._matchAll(html, pattern, "gi");
			for (const m of matches) {
				const imgUrl = m[1];
				if (seen[imgUrl]) { continue; }
				seen[imgUrl] = true;
				pages.push({ url: imgUrl });
			}
			if (pages.length > 0) { break; }
		}

		return pages;
	},

	// --- Settings ---

	getSettings() {
		return [
			{
				id: "content_type",
				label: "Content Type",
				type: "select",
				defaultValue: "Any",
				options: [
					{ label: "All",     value: "Any"    },
					{ label: "Manga",   value: "Manga"  },
					{ label: "Manhwa",  value: "Manhwa" },
					{ label: "Manhua",  value: "Manhua" },
				],
			},
		];
	},
};