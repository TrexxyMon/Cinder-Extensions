// Webtoons Extension for Cinder
// Public WEBTOON search, discovery, episode list, and reader pages.

__cinderExport = {
	id: "webtoons",
	name: "WEBTOON",
	version: "0.1.0-cinder",
	icon: "W",
	description: "Read public, web-visible WEBTOON Originals and Canvas episodes.",
	contentType: "manga",
	contentTypes: ["manga", "comic"],
	contentSubtypes: ["webtoon", "manhwa", "comicStrip"],

	capabilities: {
		search: true,
		discover: true,
		download: false,
		resolve: false,
		manga: true,
	},

	BASE_URL: "https://www.webtoons.com",

	_headers(referer) {
		const headers = {
			"User-Agent":
				"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
			"Accept":
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
		};
		if (referer) headers.Referer = referer;
		return headers;
	},

	_abs(url) {
		if (!url) return "";
		if (/^https?:\/\//i.test(url)) return url;
		if (url.indexOf("//") === 0) return "https:" + url;
		if (url[0] === "/") return this.BASE_URL + url;
		return this.BASE_URL + "/" + url;
	},

	_decode(value) {
		return String(value || "")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#039;/g, "'")
			.replace(/&#x27;/g, "'")
			.replace(/&apos;/g, "'")
			.replace(/&nbsp;/g, " ")
			.replace(/&#(\d+);/g, function (_, code) {
				return String.fromCharCode(parseInt(code, 10));
			})
			.replace(/&#x([0-9a-f]+);/gi, function (_, code) {
				return String.fromCharCode(parseInt(code, 16));
			});
	},

	_stripTags(value) {
		return this._decode(String(value || "").replace(/<[^>]+>/g, " "))
			.replace(/\s+/g, " ")
			.trim();
	},

	_match(html, pattern, flags, fallback) {
		const re = new RegExp(pattern, flags || "i");
		const m = re.exec(html || "");
		return m ? m[1].trim() : fallback || "";
	},

	_matchAll(html, pattern, flags) {
		const out = [];
		const re = new RegExp(pattern, flags || "gi");
		let m;
		while ((m = re.exec(html || "")) !== null) out.push(m);
		return out;
	},

	_titleNoFromUrl(url) {
		const m = /[?&]title_no=(\d+)/i.exec(url || "");
		return m ? m[1] : "";
	},

	_episodeNoFromUrl(url) {
		const m = /[?&]episode_no=(\d+)/i.exec(url || "");
		return m ? m[1] : "";
	},

	_normalizeListUrl(idOrUrl) {
		const value = String(idOrUrl || "");
		if (/^https?:\/\//i.test(value)) return value.replace(/&amp;/g, "&");
		if (/^\d+$/.test(value)) return this.BASE_URL + "/en/search?keyword=" + encodeURIComponent(value);
		return this._abs(value).replace(/&amp;/g, "&");
	},

	_statusFromHtml(html) {
		const dayInfo = this._stripTags(
			this._match(html, '<p[^>]+class="day_info"[^>]*>([\\s\\S]*?)<\\/p>', "i", ""),
		).toLowerCase();
		if (dayInfo.indexOf("completed") >= 0) return "completed";
		if (dayInfo.indexOf("hiatus") >= 0) return "hiatus";
		return "ongoing";
	},

	_parseCards(html) {
		const results = [];
		const seen = {};
		const cardRegex =
			/<a\s+href="([^"]*\/list\?title_no=(\d+)[^"]*)"[^>]*class="[^"]*(?:_card_item|_originals_title_a)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
		let match;

		while ((match = cardRegex.exec(html || "")) !== null) {
			const url = this._decode(match[1]).replace(/&amp;/g, "&");
			const titleNo = match[2];
			const block = match[3] || "";
			if (!titleNo || seen[titleNo]) continue;
			seen[titleNo] = true;

			const title = this._stripTags(
				this._match(block, '<strong[^>]+class="title"[^>]*>([\\s\\S]*?)<\\/strong>', "i", ""),
			);
			if (!title) continue;

			const author = this._stripTags(
				this._match(block, '<div[^>]+class="author"[^>]*>([\\s\\S]*?)<\\/div>', "i", ""),
			);
			const genre = this._stripTags(
				this._match(block, '<div[^>]+class="genre"[^>]*>([\\s\\S]*?)<\\/div>', "i", ""),
			);
			const views = this._stripTags(
				this._match(block, '<div[^>]+class="view_count[^"]*"[^>]*>([\\s\\S]*?)<\\/div>', "i", ""),
			);
			const cover = this._decode(
				this._match(block, '<img[^>]+src="([^"]+)"', "i", ""),
			);

			results.push({
				id: this._abs(url),
				title,
				author: author || undefined,
				cover: cover ? this._abs(cover) : undefined,
				coverHeaders: { Referer: this.BASE_URL + "/en/" },
				url: this._abs(url),
				format: "manga",
				source: "WEBTOON",
				extra: {
					titleNo,
					genre: genre || undefined,
					views: views || undefined,
				},
			});
		}

		return results;
	},

	async search(query, page) {
		const normalizedPage = Math.max(1, page || 1);
		const url =
			this.BASE_URL +
			"/en/search?keyword=" +
			encodeURIComponent(query) +
			(normalizedPage > 1 ? "&page=" + normalizedPage : "");

		const res = await cinder.fetch(url, { headers: this._headers(this.BASE_URL + "/en/") });
		if (res.status !== 200 || !res.data) return [];
		return this._parseCards(res.data);
	},

	async getDiscoverSections() {
		return [
			{ id: "monday", title: "Monday Originals", icon: "M" },
			{ id: "tuesday", title: "Tuesday Originals", icon: "T" },
			{ id: "wednesday", title: "Wednesday Originals", icon: "W" },
			{ id: "thursday", title: "Thursday Originals", icon: "T" },
			{ id: "friday", title: "Friday Originals", icon: "F" },
			{ id: "saturday", title: "Saturday Originals", icon: "S" },
			{ id: "sunday", title: "Sunday Originals", icon: "S" },
			{ id: "completed", title: "Completed Originals", icon: "C" },
		];
	},

	async getDiscoverItems(sectionId, page) {
		const currentPage = Math.max(0, page || 0);
		const key = String(sectionId || "monday").toLowerCase();
		const path = key === "completed" ? "complete" : key;
		const url = this.BASE_URL + "/en/originals/" + path + "?sortOrder=MANA";
		const res = await cinder.fetch(url, { headers: this._headers(this.BASE_URL + "/en/") });
		if (res.status !== 200 || !res.data) return [];
		const all = this._parseCards(res.data);
		return all.slice(currentPage * 30, currentPage * 30 + 30);
	},

	async getMangaDetails(id) {
		const url = this._normalizeListUrl(id);
		const res = await cinder.fetch(url, { headers: this._headers(this.BASE_URL + "/en/") });
		if (res.status !== 200 || !res.data) {
			throw new Error("Failed to fetch WEBTOON details: " + res.status);
		}

		const html = res.data;
		const title =
			this._stripTags(this._match(html, '<h1[^>]+class="subj"[^>]*>([\\s\\S]*?)<\\/h1>', "i", "")) ||
			this._decode(this._match(html, '<meta property="og:title" content="([^"]+)"', "i", "WEBTOON"));
		const author =
			this._stripTags(this._match(html, '<div[^>]+class="author_area"[^>]*>([\\s\\S]*?)<button', "i", "")) ||
			this._decode(this._match(html, '<meta property="com-linewebtoon:webtoon:author" content="([^"]+)"', "i", ""));
		const cover =
			this._decode(this._match(html, '<meta property="og:image" content="([^"]+)"', "i", "")) ||
			this._decode(this._match(html, '<span[^>]+class="thmb"[^>]*>\\s*<img[^>]+src="([^"]+)"', "i", ""));
		const description =
			this._stripTags(this._match(html, '<p[^>]+class="summary"[^>]*>([\\s\\S]*?)<\\/p>', "i", "")) ||
			this._decode(this._match(html, '<meta property="og:description" content="([^"]*)"', "i", ""));
		const genre =
			this._stripTags(this._match(html, '<h2[^>]+class="genre[^"]*"[^>]*>([\\s\\S]*?)<\\/h2>', "i", "")) ||
			this._stripTags(this._match(html, '<meta name="keywords" content="[^"]*,\\s*([^",]+),\\s*WEBTOON"', "i", ""));

		return {
			id: url,
			title,
			author: author || undefined,
			cover: cover ? this._abs(cover) : undefined,
			coverHeaders: { Referer: url },
			description: description || undefined,
			status: this._statusFromHtml(html),
			genres: genre ? [genre] : [],
		};
	},

	async getChapters(id) {
		const url = this._normalizeListUrl(id);
		const res = await cinder.fetch(url, { headers: this._headers(this.BASE_URL + "/en/") });
		if (res.status !== 200 || !res.data) {
			throw new Error("Failed to fetch WEBTOON episodes: " + res.status);
		}

		const chapters = [];
		const seen = {};
		const episodeRegex =
			/<li[^>]+class="[^"]*_episodeItem[^"]*"[^>]*data-episode-no="(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;
		let match;

		while ((match = episodeRegex.exec(res.data)) !== null) {
			const episodeNo = match[1];
			const block = match[2] || "";
			const href = this._decode(this._match(block, '<a[^>]+href="([^"]+)"', "i", ""));
			if (!href || seen[episodeNo]) continue;
			seen[episodeNo] = true;

			const title =
				this._stripTags(this._match(block, '<span[^>]+class="subj"[^>]*>([\\s\\S]*?)<\\/span>', "i", "")) ||
				"Episode " + episodeNo;
			const dateText = this._stripTags(
				this._match(block, '<span[^>]+class="date"[^>]*>([\\s\\S]*?)<\\/span>', "i", ""),
			);
			const episodeNumber = parseFloat(episodeNo) || chapters.length + 1;

			chapters.push({
				id: this._abs(href).replace(/&amp;/g, "&"),
				title,
				chapterNumber: episodeNumber,
				dateUploaded: dateText || undefined,
				url: this._abs(href).replace(/&amp;/g, "&"),
			});
		}

		chapters.sort(function (a, b) {
			return (a.chapterNumber || 0) - (b.chapterNumber || 0);
		});
		return chapters;
	},

	async getPages(chapterId) {
		const url = this._abs(String(chapterId || "")).replace(/&amp;/g, "&");
		const res = await cinder.fetch(url, { headers: this._headers(url) });
		if (res.status !== 200 || !res.data) {
			throw new Error("Failed to fetch WEBTOON episode pages: " + res.status);
		}

		const pages = [];
		const seen = {};
		const imageHeaders = {
			"User-Agent": this._headers(url)["User-Agent"],
			"Referer": url,
			"Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
		};
		const imgRegex = /<img[^>]+class="[^"]*_images[^"]*"[^>]+data-url="([^"]+)"/gi;
		let match;

		while ((match = imgRegex.exec(res.data)) !== null) {
			const imgUrl = this._decode(match[1]).replace(/&amp;/g, "&");
			if (!imgUrl || seen[imgUrl]) continue;
			seen[imgUrl] = true;
			pages.push({ url: this._abs(imgUrl), headers: imageHeaders });
		}

		if (pages.length === 0) {
			const fallbackRegex = /data-url="(https?:\/\/webtoon-phinf\.pstatic\.net\/[^"]+)"/gi;
			while ((match = fallbackRegex.exec(res.data)) !== null) {
				const imgUrl = this._decode(match[1]).replace(/&amp;/g, "&");
				if (!imgUrl || seen[imgUrl] || /thumb_/i.test(imgUrl)) continue;
				seen[imgUrl] = true;
				pages.push({ url: this._abs(imgUrl), headers: imageHeaders });
			}
		}

		return pages;
	},
};
