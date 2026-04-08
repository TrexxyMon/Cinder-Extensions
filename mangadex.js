// ─── MangaDex Extension for Cinder ──────────────────────────
//
// Searches and browses manga from MangaDex.org using their
// public API v5. MangaDex is a free, open, community-run
// manga platform.
//
// This file is a SAMPLE EXTENSION — it would normally be
// distributed via a repository URL, NOT bundled with the app.
// It's included here for testing/development purposes only.
//
// API Docs: https://api.mangadex.org/docs

__cinderExport = {
	id: "mangadex",
	name: "MangaDex",
	version: "1.0.0",
	icon: "📖",
	description: "Search manga from MangaDex.org — free, community-run manga platform",
	contentType: "manga",

	capabilities: {
		search: true,
		discover: true,
		download: false,
		resolve: false,
		manga: true,
	},

	// ── Helpers ──────────────────────────────────────

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

	// ── Search ───────────────────────────────────────

	async search(query, page = 0) {
		const limit = 20;
		const offset = page * limit;

		const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive&order[relevance]=desc`;

		const res = await cinder.fetch(url, {
			headers: { "Accept": "application/json" },
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

	// ── Discover ─────────────────────────────────────

	async getDiscoverSections() {
		return [
			{ id: "popular", title: "Popular", icon: "🔥" },
			{ id: "latest", title: "Latest Updates", icon: "🆕" },
			{ id: "top-rated", title: "Top Rated", icon: "⭐" },
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
			headers: { "Accept": "application/json" },
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

	// ── Manga Details ────────────────────────────────

	async getMangaDetails(id) {
		const url = `https://api.mangadex.org/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`;

		const res = await cinder.fetch(url, {
			headers: { "Accept": "application/json" },
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

	// ── Chapters ──────────────────────────────────────

	async getChapters(mangaId) {
		const chapters = [];
		let offset = 0;
		const limit = 100;
		let total = 1;

		while (offset < total) {
			const url = `https://api.mangadex.org/manga/${mangaId}/feed?limit=${limit}&offset=${offset}&translatedLanguage[]=en&order[chapter]=asc&includes[]=scanlation_group`;

			const res = await cinder.fetch(url, {
				headers: { "Accept": "application/json" },
			});

			if (res.status !== 200) break;

			const data = JSON.parse(res.data);
			total = data.total || 0;

			for (const ch of data.data || []) {
				const attrs = ch.attributes;
				const group = this._getRelationship(ch.relationships, "scanlation_group");

				chapters.push({
					id: ch.id,
					title: attrs.title || `Chapter ${attrs.chapter || "?"}`,
					chapterNumber: Number.parseFloat(attrs.chapter) || 0,
					dateUploaded: attrs.publishAt,
					scanlator: group?.attributes?.name,
				});
			}

			offset += limit;
		}

		return chapters;
	},

	// ── Pages ─────────────────────────────────────────

	async getPages(chapterId) {
		const url = `https://api.mangadex.org/at-home/server/${chapterId}`;

		const res = await cinder.fetch(url, {
			headers: { "Accept": "application/json" },
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

	// ── Settings ──────────────────────────────────────

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
