// â”€â”€â”€ MangaDex Extension for Cinder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Searches and browses manga from MangaDex.org using their
// public API v5. MangaDex is a free, open, community-run
// manga platform.
//
// This file is a SAMPLE EXTENSION â€” it would normally be
// distributed via a repository URL, NOT bundled with the app.
// It's included here for testing/development purposes only.
//
// API Docs: https://api.mangadex.org/docs

__cinderExport = {
	id: "mangadex",
	name: "MangaDex",
	version: "1.0.9",
	icon: "ðŸ“–",
	description: "Search manga from MangaDex.org â€” free, community-run manga platform",
	contentType: "manga",
	contentTypes: ["manga"],
	contentSubtypes: ["manga"],

	capabilities: {
		search: true,
		discover: true,
		download: false,
		resolve: false,
		manga: true,
	},

	// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	_getCoverUrl(mangaId, coverId, fileName) {
		if (!fileName) return undefined;
		return `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.256.jpg`;
	},

	_getRelationship(relationships, type) {
		return relationships?.find((r) => r.type === type);
	},

	_getAuthorName(relationships) {
		const author = this._getRelationship(relationships, "author");
		return author?.attributes?.name || "Unknown";
	},

	_getCoverFileName(relationships) {
		const cover = this._getRelationship(relationships, "cover_art");
		return cover?.attributes?.fileName || null;
	},

	_isReadableChapter(attrs) {
		if (!attrs) return false;
		if (attrs.externalUrl) return false;
		return Number(attrs.pages || 0) > 0;
	},

	_getLanguageLabel(code) {
		const labels = {
			en: "English",
			"es-la": "Spanish",
			es: "Spanish",
			fr: "French",
			de: "German",
			it: "Italian",
			"pt-br": "Portuguese",
			pt: "Portuguese",
			ru: "Russian",
			vi: "Vietnamese",
			id: "Indonesian",
			tr: "Turkish",
			pl: "Polish",
			th: "Thai",
			ja: "Japanese",
			"ja-ro": "Japanese",
			ko: "Korean",
			"ko-ro": "Korean",
			zh: "Chinese",
			"zh-hk": "Chinese",
		};
		return labels[code] || String(code || "").toUpperCase() || "Unknown";
	},

	_getChapterPreferenceScore(attrs) {
		const lang = attrs?.translatedLanguage || "";
		if (lang === "en") return 0;
		return 10;
	},

	_compareReadableChapters(candidate, current) {
		const candidateScore = this._getChapterPreferenceScore(candidate.attributes);
		const currentScore = this._getChapterPreferenceScore(current.attributes);
		if (candidateScore !== currentScore) return candidateScore - currentScore;

		const candidatePages = Number(candidate.attributes?.pages || 0);
		const currentPages = Number(current.attributes?.pages || 0);
		if (candidatePages !== currentPages) return currentPages - candidatePages;

		const candidateDate = Date.parse(candidate.attributes?.publishAt || "") || 0;
		const currentDate = Date.parse(current.attributes?.publishAt || "") || 0;
		return currentDate - candidateDate;
	},

	_formatChapterTitle(attrs) {
		const chapter = attrs.chapter || "?";
		const lang = attrs.translatedLanguage || "";
		const title = attrs.title || `Chapter ${chapter}`;
		if (!lang || lang === "en") return title;
		return `${title} [${this._getLanguageLabel(lang)}]`;
	},

	// â”€â”€ Search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	async search(query, page = 0) {
		const limit = 20;
		const offset = (Math.max(1, page) - 1) * limit;

		const encodedIncludesCover = encodeURIComponent("includes[]") + "=cover_art";
		const encodedIncludesAuthor = encodeURIComponent("includes[]") + "=author";
		const encodedOrder = encodeURIComponent("order[relevance]") + "=desc";

		// Note: We deliberately exclude contentRating[] filters here (like safe/suggestive)
		// so that the extension returns all content. The Cinder app has its own global 
		// Explicit Content Filter that will intercept and hide mature entries based on the user's app settings.
		const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&${encodedIncludesCover}&${encodedIncludesAuthor}&${encodedOrder}`;

		const res = await cinder.fetch(url, {
			headers: { 
				"Accept": "application/json",
				"User-Agent": "CinderApp/1.0 (Mobile; Cinder)"
			},
		});

		if (res.status !== 200) {
			cinder.error("MangaDex search failed:", res.status);
			return [];
		}

		const data = JSON.parse(res.data);
		const results = [];

		for (const manga of data.data || []) {
			const attrs = manga.attributes;
			const title =
				attrs.title?.en ||
				attrs.title?.["ja-ro"] ||
				Object.values(attrs.title || {})[0] ||
				"Unknown Title";
			const description =
				attrs.description?.en ||
				Object.values(attrs.description || {})[0] ||
				"";

			const coverFileName = this._getCoverFileName(manga.relationships);
			const author = this._getAuthorName(manga.relationships);

			results.push({
				id: manga.id,
				title: title,
				author: author,
				cover: this._getCoverUrl(manga.id, null, coverFileName),
				url: manga.id,
				format: "manga",
				extra: {
					description: description,
					status: attrs.status,
					year: attrs.year,
					tags: (attrs.tags || [])
						.map((t) => t.attributes?.name?.en)
						.filter(Boolean),
				},
			});
		}

		return results;
	},

	// â”€â”€ Discover â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	async getDiscoverSections() {
		return [
			{ id: "popular", title: "Popular", icon: "ðŸ”¥" },
			{ id: "latest", title: "Latest Updates", icon: "ðŸ†•" },
			{ id: "top-rated", title: "Top Rated", icon: "â­" },
		];
	},

	async getDiscoverItems(sectionId, page = 0) {
		const limit = 20;
		const offset = page * limit;
		let url = "";

		if (sectionId === "popular") {
			url = `https://api.mangadex.org/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive&order[followedCount]=desc`;
		} else if (sectionId === "latest") {
			url = `https://api.mangadex.org/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive&order[latestUploadedChapter]=desc`;
		} else if (sectionId === "top-rated") {
			url = `https://api.mangadex.org/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive&order[rating]=desc`;
		}

		const res = await cinder.fetch(url, {
			headers: { 
				"Accept": "application/json",
				"User-Agent": "CinderApp/1.0 (Mobile; Cinder)"
			},
		});

		if (res.status !== 200) return [];

		const data = JSON.parse(res.data);
		const results = [];

		for (const manga of data.data || []) {
			const attrs = manga.attributes;
			const title =
				attrs.title?.en ||
				attrs.title?.["ja-ro"] ||
				Object.values(attrs.title || {})[0] ||
				"Unknown Title";

			const coverFileName = this._getCoverFileName(manga.relationships);
			const author = this._getAuthorName(manga.relationships);

			results.push({
				id: manga.id,
				title: title,
				author: author,
				cover: this._getCoverUrl(manga.id, null, coverFileName),
				url: manga.id,
				format: "manga",
			});
		}

		return results;
	},

	// â”€â”€ Manga Details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	async getMangaDetails(id) {
		const url = `https://api.mangadex.org/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`;

		const res = await cinder.fetch(url, {
			headers: { 
				"Accept": "application/json",
				"User-Agent": "CinderApp/1.0 (Mobile; Cinder)"
			},
		});

		if (res.status !== 200) throw new Error("Failed to fetch manga details");

		const manga = JSON.parse(res.data).data;
		const attrs = manga.attributes;

		const title =
			attrs.title?.en ||
			attrs.title?.["ja-ro"] ||
			Object.values(attrs.title || {})[0] ||
			"Unknown";

		const coverFileName = this._getCoverFileName(manga.relationships);
		const artist = this._getRelationship(manga.relationships, "artist");

		return {
			id: manga.id,
			title: title,
			author: this._getAuthorName(manga.relationships),
			artist: artist?.attributes?.name,
			cover: this._getCoverUrl(manga.id, null, coverFileName),
			description:
				attrs.description?.en ||
				Object.values(attrs.description || {})[0] ||
				"",
			status: attrs.status,
			genres: (attrs.tags || [])
				.map((t) => t.attributes?.name?.en)
				.filter(Boolean),
		};
	},

	// â”€â”€ Chapters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	async getChapters(mangaId) {
		const chaptersByNumber = {};
		let offset = 0;
		const limit = 100;
		let total = 1;

		while (offset < total) {
			const url = `https://api.mangadex.org/manga/${mangaId}/feed?limit=${limit}&offset=${offset}&order[chapter]=asc&includes[]=scanlation_group`;

			const res = await cinder.fetch(url, {
				headers: { 
					"Accept": "application/json",
					"User-Agent": "CinderApp/1.0 (Mobile; Cinder)"
				},
			});

			if (res.status !== 200) break;

			const data = JSON.parse(res.data);
			total = data.total || 0;

			for (const ch of data.data || []) {
				const attrs = ch.attributes;
				if (!this._isReadableChapter(attrs)) continue;
				const chapterKey = String(attrs.chapter || ch.id).trim();
				const existing = chaptersByNumber[chapterKey];
				if (!existing || this._compareReadableChapters(ch, existing) < 0) {
					chaptersByNumber[chapterKey] = ch;
				}
			}

			offset += limit;
		}

		return Object.values(chaptersByNumber)
			.map((ch) => {
				const attrs = ch.attributes;
				const group = this._getRelationship(ch.relationships, "scanlation_group");
				const languageLabel = this._getLanguageLabel(attrs.translatedLanguage);
				const scanlator = group?.attributes?.name || "";
				return {
					id: ch.id,
					title: this._formatChapterTitle(attrs),
					chapterNumber: Number.parseFloat(attrs.chapter) || 0,
					dateUploaded: attrs.publishAt,
					scanlator:
						attrs.translatedLanguage && attrs.translatedLanguage !== "en"
							? `${scanlator || "Unknown"} (${languageLabel})`
							: scanlator,
				};
			})
			.sort((a, b) => {
				if (a.chapterNumber !== b.chapterNumber) {
					return a.chapterNumber - b.chapterNumber;
				}
				return String(a.dateUploaded || "").localeCompare(String(b.dateUploaded || ""));
			});
	},

	// â”€â”€ Pages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	async getPages(chapterId) {
		const url = `https://api.mangadex.org/at-home/server/${chapterId}`;

		const res = await cinder.fetch(url, {
			headers: { 
				"Accept": "application/json",
				"User-Agent": "CinderApp/1.0 (Mobile; Cinder)"
			},
		});

		if (res.status !== 200) throw new Error("Failed to fetch pages");

		const data = JSON.parse(res.data);
		const baseUrl = data.baseUrl;
		const hash = data.chapter?.hash;
		const pageFiles = data.chapter?.data || [];

		return pageFiles.map((fileName) => ({
			url: `${baseUrl}/data/${hash}/${fileName}`,
		}));
	},

	// â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	getSettings() {
		return [
			{
				id: "content_rating",
				label: "Content Rating",
				type: "select",
				defaultValue: "safe",
				options: [
					{ label: "Safe Only", value: "safe" },
					{ label: "Safe + Suggestive", value: "suggestive" },
				],
			},
		];
	}
};

