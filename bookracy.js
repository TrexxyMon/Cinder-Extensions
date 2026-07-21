// ─── Bookracy Extension v0.1.1 ──────────────────────────────
//
// Bookracy is a free, open-source library of millions of books,
// comics, manga, articles and publications. This extension
// provides search and download via the Bookracy REST API.
//
// API docs reverse-engineered from the official Bookracy web app
// (React SPA with Zustand + TanStack Query hitting api.bookracy.com).

var BookracySource = {};

BookracySource.id = "bookracy";
BookracySource.name = "Bookracy";
BookracySource.version = "0.1.1-cinder";
BookracySource.icon = "📖";
BookracySource.description = "Search and download ebooks from Bookracy — a free, open-source library of millions of books, comics, and manga.";
BookracySource.contentType = "books";
BookracySource.contentTypes = ["ebook", "comic", "manga"];
BookracySource.capabilities = {
	search: true,
	discover: true,
	download: false,
	resolve: true,
	searchDownloads: true,
	manga: false,
};

// ── Constants ──

BookracySource.API_BASE = "https://api.bookracy.com";
BookracySource.SUPPORTED_FORMATS = ["epub", "pdf", "cbz", "cbr"];

// ── Pre-built headers (avoids object allocation on every call) ──

BookracySource._REQ_HEADERS = {
	"User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
	"Accept": "application/json",
	"Referer": "https://bookracy.com/",
};

// ── Discover Sections ──

BookracySource.DISCOVER_SECTIONS = [
	{ id: "trending", title: "Trending", icon: "🔥" },
	{ id: "recent", title: "Recently Added", icon: "🆕" },
];

// ── Helpers ──

BookracySource._clean = function(value) {
	return cinder.normalizeText(String(value || ""))
		.replace(/\s+/g, " ")
		.trim();
};

BookracySource._slug = function(text) {
	return String(text || "")
		.toLowerCase()
		.replace(/['\u2019]/g, "")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80) || "bookracy";
};

BookracySource._fileName = function(item, format) {
	var base = this._slug(item.title || "download");
	var ext = String(format || (item && item.format) || "epub").toLowerCase();
	ext = ext.replace(/^\./, "");
	if (this.SUPPORTED_FORMATS.indexOf(ext) === -1) ext = "epub";
	return base + "." + ext;
};

BookracySource._isSupportedFormat = function(format) {
	var fmt = String(format || "").toLowerCase().replace(/^\./, "");
	return this.SUPPORTED_FORMATS.indexOf(fmt) !== -1 ? fmt : "";
};

BookracySource._apiFetch = async function(path, queryParams) {
	var url = this.API_BASE + "/api" + path;
	if (queryParams) {
		var parts = [];
		for (var key in queryParams) {
			if (queryParams.hasOwnProperty(key) && queryParams[key] != null) {
				parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(queryParams[key]));
			}
		}
		if (parts.length > 0) url += "?" + parts.join("&");
	}

	var resp = await cinder.fetch(url, {
		headers: this._REQ_HEADERS,
		timeout: 10000,
	});

	if (!resp || resp.status < 200 || resp.status >= 300) {
		throw new Error("Bookracy API returned status " + (resp ? resp.status : "unknown"));
	}

	try {
		return JSON.parse(resp.data || "{}");
	} catch (err) {
		throw new Error("Bookracy API returned invalid JSON");
	}
};

BookracySource._resultFromItem = function(item) {
	var format = this._isSupportedFormat(item.book_filetype || "");
	if (!format) return null;

	var title = this._clean(item.title || "");
	if (!title || title.length < 2) return null;

	var author = this._clean(item.author || "");

	// The API always provides a direct download link
	var downloadUrl = item.link || "";

	// Build cover URL from md5 if not provided
	var coverUrl = item.book_image || "";
	if (!coverUrl && item.md5) {
		coverUrl = this.API_BASE + "/cover/" + item.md5 + "/thumbnail.jpg";
	}

	// Stable ID from md5 + format
	var id = (item.md5 || this._slug(title)) + "#" + format;

	return {
		id: id,
		title: title,
		author: author || undefined,
		cover: coverUrl || undefined,
		coverHeaders: coverUrl ? { Referer: "https://bookracy.com/" } : undefined,
		url: downloadUrl,
		format: format,
		size: this._clean(item.book_size || ""),
		source: "Bookracy",
		extra: {
			md5: item.md5 || undefined,
			downloadUrl: downloadUrl || undefined,
			description: this._clean(item.description || ""),
			publisher: this._clean(item.publisher || ""),
			year: this._clean(item.year || ""),
			language: this._clean(item.book_lang || "").replace(/\s*\[.*\]\s*/, ""),
			series: this._clean(item.series || ""),
			isbn: this._clean(item.isbn || ""),
		},
	};
};

// ── Search ──

BookracySource.search = async function(query, page) {
	if (!query || !String(query).trim()) return [];

	try {
		var data = await this._apiFetch("/books", {
			query: String(query).trim(),
			lang: "all",
			limit: 8,
		});

		var items = data.results || [];
		var results = [];
		var seen = {};

		for (var i = 0; i < items.length; i++) {
			var result = this._resultFromItem(items[i]);
			if (result && !seen[result.id]) {
				seen[result.id] = true;
				results.push(result);
			}
		}

		return results;
	} catch (err) {
		cinder.warn("[Bookracy] Search failed: " + (err && err.message ? err.message : String(err)));
		return [];
	}
};

// ── Discover ──

BookracySource.getDiscoverSections = async function() {
	return this.DISCOVER_SECTIONS;
};

BookracySource.getDiscoverItems = async function(sectionId, page) {
	try {
		var path = sectionId === "recent" ? "/recent" : "/trending";
		var data = await this._apiFetch(path, {});

		var key = sectionId === "recent" ? "recent" : "trending";
		var items = data[key] || [];

		var results = [];
		var seen = {};

		for (var i = 0; i < items.length; i++) {
			var result = this._resultFromItem(items[i]);
			if (result && !seen[result.id]) {
				seen[result.id] = true;
				results.push(result);
			}
		}

		var pageNum = page || 0;
		var perPage = 50;
		var start = pageNum * perPage;

		return results.slice(start, start + perPage);
	} catch (err) {
		cinder.warn("[Bookracy] Discover failed: " + (err && err.message ? err.message : String(err)));
		return [];
	}
};

// ── Resolve ──

BookracySource.resolve = async function(item) {
	var downloadUrl = (item.extra && item.extra.downloadUrl) || item.url || "";
	var md5 = (item.extra && item.extra.md5) || "";
	var format = this._isSupportedFormat(item.format || "");

	if (!format) {
		var urlMatch = String(downloadUrl || "").toLowerCase().match(/\.(epub|pdf|cbz|cbr)(?:[?#]|$)/);
		format = urlMatch ? urlMatch[1] : "epub";
	}

	if (!downloadUrl && md5) {
		var encodedTitle = encodeURIComponent(this._clean(item.title || "download"));
		downloadUrl = this.API_BASE + "/download/" + md5 + "/" + encodedTitle + "." + format;
	}

	if (!downloadUrl) {
		throw new Error("No download URL available for this Bookracy result.");
	}

	return {
		url: downloadUrl,
		fileName: this._fileName(item, format),
		headers: {
			"Referer": "https://bookracy.com/",
		},
	};
};

// ── Settings ──

BookracySource.getSettings = function() {
	return [
		{
			id: "preferred_format",
			label: "Preferred Format",
			type: "select",
			defaultValue: "",
			options: [
				{ label: "Any", value: "" },
				{ label: "EPUB", value: "epub" },
				{ label: "PDF", value: "pdf" },
				{ label: "CBZ", value: "cbz" },
				{ label: "CBR", value: "cbr" },
			],
		},
	];
};

__cinderExport = BookracySource;