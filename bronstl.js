var BronsTLSource = {};

BronsTLSource.id = "bronstl";
BronsTLSource.name = "BronsTL";
BronsTLSource.version = "0.1.1-cinder";
BronsTLSource.icon = "BT";
BronsTLSource.description = "Search public BronsTL light novels and build available chapters into EPUB on device. No debrid required.";
BronsTLSource.contentType = "books";
BronsTLSource.contentTypes = ["webnovel", "ebook"];
BronsTLSource.contentSubtypes = ["lightNovel", "translatedNovel"];
BronsTLSource.capabilities = {
	search: true,
	discover: true,
	download: false,
	resolve: false,
	bookChapters: true,
	manga: false,
};

BronsTLSource.BASE_URL = "https://bronstl.com";
BronsTLSource.API_URL = BronsTLSource.BASE_URL + "/api";
BronsTLSource.CACHE_TTL_MS = 5 * 60 * 1000;
BronsTLSource.MAX_API_PAGES = 30;
BronsTLSource._booksCache = null;
BronsTLSource._bookCache = {};
BronsTLSource._chapterCache = {};

BronsTLSource._headers = function() {
	return {
		"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		"Accept": "application/json",
		"Accept-Language": "en-US,en;q=0.9",
		"Referer": this.BASE_URL + "/",
	};
};

BronsTLSource._parseJson = function(data, url) {
	if (data && typeof data === "object") return data;
	var text = String(data || "").trim();
	if (!text || text.charAt(0) === "<") throw new Error("BronsTL returned an unusable response: " + url);
	try {
		return JSON.parse(text);
	} catch (_) {
		throw new Error("BronsTL returned invalid JSON: " + url);
	}
};

BronsTLSource._fetchJson = async function(url) {
	var response = await cinder.fetch(url, {
		headers: this._headers(),
		timeout: 30000,
	});
	if (!response || response.status < 200 || response.status >= 300 || response.data == null) {
		var status = response && response.status ? " (HTTP " + response.status + ")" : "";
		throw new Error("BronsTL request failed" + status + ": " + url);
	}
	return this._parseJson(response.data, url);
};

BronsTLSource._text = function(value) {
	var text = String(value || "")
		.replace(/&#x([0-9a-f]+);/gi, function(_, code) { return String.fromCharCode(parseInt(code, 16)); })
		.replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(parseInt(code, 10)); })
		.replace(/&quot;/gi, '"')
		.replace(/&apos;|&#039;/gi, "'")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (typeof cinder !== "undefined" && cinder.normalizeText) return cinder.normalizeText(text);
	return text;
};

BronsTLSource._absoluteUrl = function(url, baseUrl) {
	var value = String(url || "").trim();
	if (!value) return "";
	if (/^https?:\/\//i.test(value)) return value;
	if (value.indexOf("//") === 0) return "https:" + value;
	if (typeof cinder !== "undefined" && cinder.resolveUrl) {
		return cinder.resolveUrl(value, baseUrl || this.BASE_URL + "/");
	}
	if (value.charAt(0) === "/") return this.BASE_URL + value;
	return (baseUrl || this.BASE_URL + "/").replace(/\/[^/]*$/, "/") + value;
};

BronsTLSource._withPage = function(url, page) {
	return url + (url.indexOf("?") >= 0 ? "&" : "?") + "page=" + page;
};

BronsTLSource._fetchAllPages = async function(url) {
	var first = await this._fetchJson(url);
	if (Array.isArray(first)) return first;
	var all = Array.isArray(first.data) ? first.data.slice() : [];
	var lastPage = Math.min(Number(first.last_page || 1), this.MAX_API_PAGES);
	for (var page = 2; page <= lastPage; page++) {
		var next = await this._fetchJson(this._withPage(url, page));
		if (next && Array.isArray(next.data)) all = all.concat(next.data);
	}
	return all;
};

BronsTLSource._normalizeSearch = function(value) {
	return this._text(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
};

BronsTLSource._tokens = function(query) {
	var values = this._normalizeSearch(query).split(" ");
	var tokens = [];
	var seen = {};
	for (var i = 0; i < values.length; i++) {
		var value = values[i];
		if (!value || seen[value]) continue;
		seen[value] = true;
		tokens.push(value);
	}
	return tokens;
};

BronsTLSource._score = function(book, tokens) {
	if (!tokens.length) return 1;
	var title = this._normalizeSearch(book.title);
	var haystack = this._normalizeSearch([book.title, book.author, book.illustrator, book.description].filter(Boolean).join(" "));
	var score = 0;
	for (var i = 0; i < tokens.length; i++) {
		var index = haystack.indexOf(tokens[i]);
		if (index < 0) return 0;
		score += title.indexOf(tokens[i]) >= 0 ? 12 : 4;
	}
	if (title.indexOf(tokens.join(" ")) >= 0) score += 30;
	return score;
};

BronsTLSource._bookUrl = function(slug) {
	return this.BASE_URL + "/books/" + encodeURIComponent(slug);
};

BronsTLSource._mapBook = function(book) {
	var chapterCount = Number(book.chapters_count || book.total_chapters || 0);
	var description = this._text(book.description);
	return {
		id: String(book.slug || book.id),
		title: this._text(book.title) || "Untitled BronsTL novel",
		author: this._text(book.author),
		cover: this._absoluteUrl(book.cover_image, this.BASE_URL + "/"),
		url: this._bookUrl(book.slug || book.id),
		format: "epub",
		size: chapterCount ? chapterCount + " chapters" : "",
		source: "BronsTL",
		description: description || undefined,
		extra: {
			description: description || undefined,
			illustrator: this._text(book.illustrator),
			status: book.status && book.status.name,
			epubFile: book.epub_file || undefined,
			pdfFile: book.pdf_file || undefined,
		},
	};
};

BronsTLSource._loadBooks = async function() {
	var now = Date.now ? Date.now() : new Date().getTime();
	if (this._booksCache && now - this._booksCache.time < this.CACHE_TTL_MS) return this._booksCache.items;
	var items = await this._fetchAllPages(this.API_URL + "/books");
	for (var i = 0; i < items.length; i++) {
		if (items[i] && items[i].slug) this._bookCache[String(items[i].slug)] = items[i];
	}
	this._booksCache = { time: now, items: items };
	return items;
};

BronsTLSource.search = async function(query, page) {
	if (page && page > 0) return [];
	var text = String(query || "").trim();
	if (!text) return [];
	var tokens = this._tokens(text);
	var books = await this._loadBooks();
	var scored = [];
	for (var i = 0; i < books.length; i++) {
		var score = this._score(books[i], tokens);
		if (score > 0) scored.push({ book: books[i], score: score });
	}
	scored.sort(function(a, b) {
		if (b.score !== a.score) return b.score - a.score;
		return String(b.book.updated_at || "").localeCompare(String(a.book.updated_at || ""));
	});
	var results = [];
	for (var j = 0; j < scored.length; j++) results.push(this._mapBook(scored[j].book));
	return results;
};

BronsTLSource._loadBook = async function(bookId) {
	var slug = String(bookId || "").trim();
	if (!slug) throw new Error("Invalid BronsTL book ID.");
	if (this._bookCache[slug]) return this._bookCache[slug];
	var book = await this._fetchJson(this.API_URL + "/books/" + encodeURIComponent(slug));
	if (!book || !book.slug) throw new Error("BronsTL book was not found.");
	this._bookCache[slug] = book;
	return book;
};

BronsTLSource.getBookDetails = async function(bookId) {
	var book = await this._loadBook(bookId);
	var tags = [];
	if (Array.isArray(book.tags)) {
		for (var i = 0; i < book.tags.length; i++) {
			var name = this._text(book.tags[i] && (book.tags[i].name || book.tags[i].display_name));
			if (name) tags.push(name);
		}
	}
	return {
		id: String(book.slug),
		title: this._text(book.title),
		author: this._text(book.author),
		cover: this._absoluteUrl(book.cover_image, this.BASE_URL + "/"),
		description: this._text(book.description),
		genres: tags,
	};
};

BronsTLSource._chapterId = function(bookSlug, chapterSlug) {
	return String(bookSlug) + "::" + String(chapterSlug);
};

BronsTLSource._parseChapterId = function(chapterId) {
	var parts = String(chapterId || "").split("::");
	if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("Invalid BronsTL chapter ID.");
	return { bookSlug: parts[0], chapterSlug: parts[1] };
};

BronsTLSource.getBookChapters = async function(bookId) {
	var book = await this._loadBook(bookId);
	var slug = String(book.slug);
	var items = await this._fetchAllPages(this.API_URL + "/books/" + encodeURIComponent(slug) + "/chapters");
	var available = [];
	for (var i = 0; i < items.length; i++) {
		var item = items[i] || {};
		var chapterSlug = String(item.chapter_slug || "").trim();
		if (!chapterSlug) continue;
		var id = this._chapterId(slug, chapterSlug);
		this._chapterCache[id] = item;
		available.push({ item: item, id: id });
	}
	available.sort(function(a, b) {
		var aWeight = Number(a.item.chapter_weight || 0);
		var bWeight = Number(b.item.chapter_weight || 0);
		if (aWeight !== bWeight) return aWeight - bWeight;
		return Number(a.item.id || 0) - Number(b.item.id || 0);
	});
	var chapters = [];
	for (var j = 0; j < available.length; j++) {
		var entry = available[j];
		chapters.push({
			id: entry.id,
			title: this._text(entry.item.chapter_title) || "Chapter " + (j + 1),
			index: j + 1,
			url: this._bookUrl(slug) + "/chapters/" + encodeURIComponent(entry.item.chapter_slug),
			datePublished: entry.item.created_at || undefined,
		});
	}
	if (!chapters.length) throw new Error("BronsTL has no chapters available for this novel.");
	return chapters;
};

BronsTLSource._normalizeImageTag = function(tag, pageUrl) {
	var value = String(tag || "");
	var source = (value.match(/\s(?:data-src|data-lazy-src|data-original)=["']([^"']+)["']/i) || [])[1];
	var current = (value.match(/\ssrc=["']([^"']+)["']/i) || [])[1];
	if (source && (!current || /^data:image\/svg/i.test(current))) {
		if (/\ssrc=["']/i.test(value)) value = value.replace(/\ssrc=(["'])[^"']*\1/i, " src=\"" + this._absoluteUrl(source, pageUrl) + "\"");
		else value = value.replace(/<img\b/i, "<img src=\"" + this._absoluteUrl(source, pageUrl) + "\"");
	}
	return value;
};

BronsTLSource._sanitizeHtml = function(html, pageUrl) {
	var self = this;
	var cleaned = String(html || "")
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
		.replace(/<!--([\s\S]*?)-->/g, "")
		.replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "")
		.replace(/javascript:/gi, "");
	cleaned = cleaned.replace(/<img\b[^>]*>/gi, function(tag) { return self._normalizeImageTag(tag, pageUrl); });
	cleaned = cleaned.replace(/(href|src)=(["'])([^"']+)\2/gi, function(_, attr, quote, value) {
		if (!value || value.indexOf("data:") === 0 || value.indexOf("#") === 0) return attr + "=" + quote + value + quote;
		return attr + "=" + quote + self._absoluteUrl(value, pageUrl) + quote;
	});
	cleaned = cleaned.replace(/srcset=(["'])([^"']+)\1/gi, function(_, quote, value) {
		var entries = value.split(",");
		for (var i = 0; i < entries.length; i++) {
			var parts = entries[i].trim().split(/\s+/);
			if (parts[0]) parts[0] = self._absoluteUrl(parts[0], pageUrl);
			entries[i] = parts.join(" ");
		}
		return "srcset=" + quote + entries.join(", ") + quote;
	});
	return cleaned;
};

BronsTLSource._imageFallbackHtml = function(images) {
	if (!Array.isArray(images)) return "";
	var html = "";
	var sorted = images.slice().sort(function(a, b) { return Number(a.order || a.id || 0) - Number(b.order || b.id || 0); });
	for (var i = 0; i < sorted.length; i++) {
		var url = this._absoluteUrl(sorted[i].url || sorted[i].image_path, this.BASE_URL + "/");
		if (url) html += "<p><img src=\"" + url.replace(/"/g, "&quot;") + "\" alt=\"Chapter image\"></p>";
	}
	return html;
};

BronsTLSource.getBookChapter = async function(chapterId) {
	var id = String(chapterId || "");
	var parsed = this._parseChapterId(id);
	var chapter = this._chapterCache[id];
	if (!chapter || (!chapter.body && !chapter.images)) {
		chapter = await this._fetchJson(this.API_URL + "/books/" + encodeURIComponent(parsed.bookSlug) + "/chapters/" + encodeURIComponent(parsed.chapterSlug));
		this._chapterCache[id] = chapter;
	}
	var body = String(chapter.body || "");
	if (!this._text(body) && Array.isArray(chapter.images)) body = this._imageFallbackHtml(chapter.images);
	if (!body) throw new Error("BronsTL chapter content is unavailable.");
	var pageUrl = this._bookUrl(parsed.bookSlug) + "/chapters/" + encodeURIComponent(parsed.chapterSlug);
	return {
		id: id,
		title: this._text(chapter.chapter_title) || "Chapter",
		url: pageUrl,
		html: this._sanitizeHtml(body, pageUrl),
		datePublished: chapter.created_at || undefined,
	};
};

BronsTLSource.getDiscoverSections = async function() {
	return [
		{ id: "latest", title: "Latest Releases", icon: "BT" },
		{ id: "completed", title: "Completed", icon: "BT" },
		{ id: "all", title: "All Novels", icon: "BT" },
	];
};

BronsTLSource.getDiscoverItems = async function(sectionId, page) {
	var books = (await this._loadBooks()).slice();
	if (sectionId === "completed") {
		books = books.filter(function(book) { return String(book.status && book.status.name || "").toLowerCase() === "finished"; });
	}
	if (sectionId === "all") {
		books.sort(function(a, b) { return String(a.title || "").localeCompare(String(b.title || "")); });
	} else {
		books.sort(function(a, b) { return String(b.updated_at || "").localeCompare(String(a.updated_at || "")); });
	}
	var start = Math.max(0, Number(page || 0)) * 20;
	var results = [];
	for (var i = start; i < Math.min(start + 20, books.length); i++) results.push(this._mapBook(books[i]));
	return results;
};

__cinderExport = BronsTLSource;
