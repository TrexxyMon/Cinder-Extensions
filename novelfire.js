var NovelFireSource = {};

NovelFireSource.id = "novelfire";
NovelFireSource.name = "Novel Fire";
NovelFireSource.version = "0.1.8-cinder";
NovelFireSource.icon = "NF";
NovelFireSource.description = "Search and build public chaptered web novels from Novel Fire into EPUB on device. No debrid required.";
NovelFireSource.contentType = "books";
NovelFireSource.contentTypes = ["webnovel", "ebook"];
NovelFireSource.contentSubtypes = ["webFiction", "lightNovel", "wuxia", "xianxia", "xuanhuan"];
NovelFireSource.capabilities = {
	search: true,
	discover: false,
	download: false,
	resolve: false,
	bookChapters: true,
	manga: false,
};

NovelFireSource.BASE_URL = "https://novelfire.net";
NovelFireSource.DEFAULT_MAX_BUILD_CHAPTERS = 800;
NovelFireSource.CHAPTER_REQUEST_DELAY_MS = 450;
NovelFireSource.CHAPTER_RATE_LIMIT_DELAY_MS = 900;
NovelFireSource.CHAPTER_RATE_LIMIT_COOLDOWN_MS = 9000;
NovelFireSource.CHAPTER_MAX_RATE_LIMIT_RETRIES = 2;
NovelFireSource._chapterFetchQueue = Promise.resolve();
NovelFireSource._lastChapterFetchAt = 0;
NovelFireSource._chapterAdaptiveDelayMs = 0;
NovelFireSource._chapterRateLimitCooldownUntil = 0;
NovelFireSource._chapterSuccessSinceLimit = 0;

NovelFireSource.getSettings = function() {
	return [
		{
			id: "max_build_chapters",
			label: "Max EPUB Chapters",
			type: "text",
			defaultValue: String(this.DEFAULT_MAX_BUILD_CHAPTERS),
			placeholder: String(this.DEFAULT_MAX_BUILD_CHAPTERS),
		},
	];
};

NovelFireSource._getMaxBuildChapters = async function() {
	var raw = "";
	try {
		if (typeof cinder !== "undefined" && cinder.store && cinder.store.get) {
			raw = await cinder.store.get("max_build_chapters");
		}
	} catch (_) {}
	var parsed = parseInt(String(raw || this.DEFAULT_MAX_BUILD_CHAPTERS).replace(/[^\d]/g, ""), 10);
	if (isNaN(parsed) || parsed <= 0) return this.DEFAULT_MAX_BUILD_CHAPTERS;
	return Math.max(25, Math.min(parsed, 2000));
};

NovelFireSource._headers = function(referer) {
	return {
		"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"Referer": referer || this.BASE_URL + "/",
	};
};

NovelFireSource._browserHeaders = function(referer, expectedKind) {
	var headers = this._headers(referer);
	headers["X-Cinder-Suppress-Interactive"] = "1";
	headers["X-Cinder-Visible-Layout"] = "1";
	headers["X-Cinder-Wake-Page"] = "1";
	headers["X-Cinder-Min-Wait-Ms"] = "4500";
	headers["X-Cinder-Max-Wait-Ms"] = "18000";
	if (expectedKind === "search") headers["X-Cinder-Wait-For-Selector"] = ".novel-item, a[href*='/book/']";
	if (expectedKind === "chapters") headers["X-Cinder-Wait-For-Selector"] = "a[href*='/chapter-'], a[href*='/book/']";
	if (expectedKind === "chapter") headers["X-Cinder-Wait-For-Selector"] = "#content, #chapter-container, #chapter-article";
	return headers;
};

NovelFireSource._looksBlockedHtml = function(html) {
	var text = String(html || "").toLowerCase();
	return text.indexOf("cf-chl") >= 0 ||
		text.indexOf("just a moment") >= 0 ||
		text.indexOf("checking your browser") >= 0 ||
		text.indexOf("verify you are human") >= 0 ||
		text.indexOf("security challenge") >= 0 ||
		text.indexOf("ddos-guard") >= 0 ||
		text.indexOf("captcha") >= 0;
};

NovelFireSource._hasExpectedHtml = function(html, expectedKind) {
	if (!expectedKind) return String(html || "").length > 100;
	if (expectedKind === "search") return this._parseSearchResults(html).length > 0 || /href=["'][^"']*\/book\/[^"']+/i.test(String(html || ""));
	if (expectedKind === "chapters") return this._parseChapterLinks(html, this.BASE_URL + "/book/placeholder").length > 0 || this._chapterCountFromHtml(html) > 0 || /href=["'][^"']*\/chapter-/i.test(String(html || ""));
	if (expectedKind === "chapter") return !!this._extractContentHtml(html);
	return String(html || "").length > 100;
};

NovelFireSource._sleep = function(ms) {
	if (typeof setTimeout !== "function") return Promise.resolve();
	return new Promise(function(resolve) {
		setTimeout(resolve, ms);
	});
};

NovelFireSource._isRateLimitError = function(error) {
	return /HTTP\s+429/i.test(String(error && error.message ? error.message : error || ""));
};

NovelFireSource._currentChapterDelay = function() {
	return Math.max(this.CHAPTER_REQUEST_DELAY_MS, this._chapterAdaptiveDelayMs || 0);
};

NovelFireSource._runChapterFetchQueued = function(task) {
	var self = this;
	var previous = this._chapterFetchQueue || Promise.resolve();
	var run = previous.catch(function() {}).then(async function() {
		for (var attempt = 0; attempt <= self.CHAPTER_MAX_RATE_LIMIT_RETRIES; attempt++) {
			var now = Date.now();
			var waitMs = Math.max(
				0,
				self._currentChapterDelay() - (now - (self._lastChapterFetchAt || 0)),
				(self._chapterRateLimitCooldownUntil || 0) - now,
			);
			if (waitMs > 0) await self._sleep(waitMs);
			self._lastChapterFetchAt = Date.now();
			try {
				var result = await task();
				self._chapterSuccessSinceLimit = (self._chapterSuccessSinceLimit || 0) + 1;
				if ((self._chapterAdaptiveDelayMs || 0) > self.CHAPTER_REQUEST_DELAY_MS && self._chapterSuccessSinceLimit >= 20) {
					self._chapterAdaptiveDelayMs = Math.max(self.CHAPTER_REQUEST_DELAY_MS, (self._chapterAdaptiveDelayMs || 0) - 75);
					if (self._chapterAdaptiveDelayMs <= self.CHAPTER_REQUEST_DELAY_MS) self._chapterAdaptiveDelayMs = 0;
					self._chapterSuccessSinceLimit = 0;
				}
				return result;
			} catch (error) {
				if (!self._isRateLimitError(error) || attempt >= self.CHAPTER_MAX_RATE_LIMIT_RETRIES) throw error;
				self._chapterSuccessSinceLimit = 0;
				self._chapterAdaptiveDelayMs = Math.max(self._chapterAdaptiveDelayMs || 0, self.CHAPTER_RATE_LIMIT_DELAY_MS);
				self._chapterRateLimitCooldownUntil = Date.now() + self.CHAPTER_RATE_LIMIT_COOLDOWN_MS * (attempt + 1);
			}
		}
	});
	this._chapterFetchQueue = run.then(function() {}, function() {});
	return run;
};

NovelFireSource._decode = function(text) {
	var value = String(text || "");
	if (typeof cinder !== "undefined" && cinder.normalizeText) {
		return cinder.normalizeText(value);
	}
	return value
		.replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(parseInt(code, 10)); })
		.replace(/&#x([0-9a-f]+);/gi, function(_, code) { return String.fromCharCode(parseInt(code, 16)); })
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&rsquo;/g, "'")
		.replace(/&lsquo;/g, "'")
		.replace(/&ldquo;/g, '"')
		.replace(/&rdquo;/g, '"')
		.replace(/&ndash;/g, "-")
		.replace(/&mdash;/g, "-")
		.replace(/&hellip;/g, "...")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim();
};

NovelFireSource._stripTags = function(html) {
	return this._decode(String(html || "")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]*>/g, " "));
};

NovelFireSource._cleanUrlString = function(value) {
	return String(value || "").trim().replace(/[\s\u00a0\u200b-\u200d\ufeff]+/g, "");
};

NovelFireSource._elementByIdHtml = function(html, id) {
	var source = String(html || "");
	var escapedId = String(id || "").replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
	var idPattern = new RegExp("\\bid\\s*=\\s*(?:[\"']" + escapedId + "[\"']|" + escapedId + "(?=\\s|>|/))", "i");
	var openTag = /<div\b[^>]*>/gi;
	var open;
	while ((open = openTag.exec(source)) !== null) {
		if (!idPattern.test(open[0])) continue;
		var openEnd = open.index + open[0].length;
		var token = /<\/?div\b[^>]*>/gi;
		token.lastIndex = openEnd;
		var depth = 1;
		var next;
		while ((next = token.exec(source)) !== null) {
			if (/^<\s*\/div/i.test(next[0])) {
				depth -= 1;
				if (depth === 0) return source.slice(openEnd, next.index);
			} else {
				depth += 1;
			}
		}
		return source.slice(openEnd);
	}
	return "";
};

NovelFireSource._absoluteUrl = function(url, baseUrl) {
	var value = this._cleanUrlString(this._decode(url || ""));
	var base = this._cleanUrlString(baseUrl || this.BASE_URL + "/");
	if (!value) return "";
	if (/^https?:\/\//i.test(value)) return value;
	if (value.indexOf("//") === 0) return "https:" + value;
	if (typeof cinder !== "undefined" && cinder.resolveUrl) {
		return cinder.resolveUrl(value, base);
	}
	if (value.charAt(0) === "/") return this.BASE_URL + value;
	return this.BASE_URL + "/" + value.replace(/^\/+/, "");
};

NovelFireSource._fetchHtmlNow = async function(url, referer, expectedKind) {
	url = this._cleanUrlString(url);
	referer = this._cleanUrlString(referer);
	var response = null;
	var lastStatus = 0;
	for (var attempt = 1; attempt <= 3; attempt++) {
		try {
			response = await cinder.fetch(url, {
				headers: this._headers(referer),
				timeout: 10000,
			});
			lastStatus = response && response.status ? Number(response.status) : 0;
			var directHtml = response && response.data != null ? String(response.data || "") : "";
			if (response && response.status >= 200 && response.status < 300 && directHtml && this._hasExpectedHtml(directHtml, expectedKind)) {
				return directHtml;
			}
		} catch (_) {}

		if (expectedKind === "chapter" && lastStatus === 429) {
			break;
		}

		if (cinder.fetchBrowser) {
			response = await cinder.fetchBrowser(url, {
				headers: this._browserHeaders(referer, expectedKind),
				timeout: 24000,
			});
			lastStatus = response && response.status ? Number(response.status) : lastStatus;
			var browserHtml = response && response.data != null ? String(response.data || "") : "";
			if (response && response.status >= 200 && response.status < 300 && browserHtml && this._hasExpectedHtml(browserHtml, expectedKind)) {
				return browserHtml;
			}
		}

		if (attempt < 3 && (!lastStatus || lastStatus === 429 || lastStatus >= 500)) {
			await this._sleep(lastStatus === 429 ? 2500 * attempt : 900 * attempt);
			continue;
		}
		break;
	}
	throw new Error("Novel Fire request failed" + (lastStatus ? " (HTTP " + lastStatus + ")" : "") + ": " + url);
};

NovelFireSource._fetchHtml = async function(url, referer, expectedKind) {
	if (expectedKind === "chapter") {
		var self = this;
		return this._runChapterFetchQueued(function() {
			return self._fetchHtmlNow(url, referer, expectedKind);
		});
	}
	return this._fetchHtmlNow(url, referer, expectedKind);
};

NovelFireSource._searchUrl = function(query, page) {
	var url = this.BASE_URL + "/search?keyword=" + encodeURIComponent(query || "");
	if (page && page > 0) url += "&page=" + encodeURIComponent(page + 1);
	return url;
};

NovelFireSource._bookPath = function(value) {
	var raw = String(value || "").trim();
	if (!raw) return "";
	var match = raw.match(/https?:\/\/[^\/]+(\/book\/[^?#]+)/i);
	if (match) return match[1].replace(/\/+$/, "");
	match = raw.match(/(\/book\/[^?#]+)/i);
	if (match) return match[1].replace(/\/+$/, "");
	if (/^book\//i.test(raw)) return "/" + raw.replace(/\/+$/, "");
	if (/^[a-z0-9][a-z0-9-]+$/i.test(raw)) return "/book/" + raw;
	return "";
};

NovelFireSource._bookUrl = function(bookId) {
	var path = this._bookPath(bookId);
	if (!path) throw new Error("Invalid Novel Fire book ID: " + bookId);
	path = path.replace(/\/(?:chapters?|chapter-\d+.*)$/i, "");
	return this.BASE_URL + path;
};

NovelFireSource._chapterUrl = function(chapterId) {
	var raw = this._cleanUrlString(chapterId);
	if (/^https?:\/\//i.test(raw)) return raw;
	if (raw.charAt(0) === "/") return this.BASE_URL + raw;
	return this.BASE_URL + "/" + raw.replace(/^\/+/, "");
};

NovelFireSource._slugFromPath = function(path) {
	var parts = String(path || "").split("/").filter(Boolean);
	return parts.length ? parts[parts.length - 1] : "";
};

NovelFireSource._extractMeta = function(html, name) {
	var key = String(name || "").replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
	var patterns = [
		new RegExp("<meta[^>]+property=[\"']" + key + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i"),
		new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']" + key + "[\"'][^>]*>", "i"),
		new RegExp("<meta[^>]+name=[\"']" + key + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i"),
		new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+name=[\"']" + key + "[\"'][^>]*>", "i"),
	];
	for (var i = 0; i < patterns.length; i++) {
		var match = String(html || "").match(patterns[i]);
		if (match && match[1]) return this._decode(match[1]);
	}
	return "";
};

NovelFireSource._extractItempropMeta = function(html, name) {
	var key = String(name || "").replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
	var patterns = [
		new RegExp("<meta[^>]+itemprop=[\"']" + key + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i"),
		new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+itemprop=[\"']" + key + "[\"'][^>]*>", "i"),
	];
	for (var i = 0; i < patterns.length; i++) {
		var match = String(html || "").match(patterns[i]);
		if (match && match[1]) return this._decode(match[1]);
	}
	return "";
};

NovelFireSource._cleanDescriptionText = function(html) {
	var text = String(html || "")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(?:p|div|section|article)>/gi, "\n")
		.replace(/<[^>]*>/g, " ");
	return this._decode(text)
		.replace(/\bShow More\b/gi, "")
		.replace(/\bCollapse\b/gi, "")
		.split(/\n+/)
		.map(function(line) {
			return line.replace(/\s+/g, " ").trim();
		})
		.filter(Boolean)
		.join("\n\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
};

NovelFireSource._extractBookDescription = function(html) {
	var text = String(html || "");
	var summaryMatch = text.match(/<div\b[^>]*class=["'][^"']*\bsummary\b[^"']*["'][^>]*>[\s\S]*?<div\b[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
	var summary = summaryMatch && summaryMatch[1] ? this._cleanDescriptionText(summaryMatch[1]) : "";
	if (summary && summary.length > 60) return summary;
	return this._cleanDescriptionText(
		this._extractItempropMeta(text, "description") ||
		this._extractMeta(text, "og:description") ||
		this._extractMeta(text, "description"),
	);
};

NovelFireSource._extractBookAuthor = function(html) {
	var match = String(html || "").match(/itemprop=["']author["'][^>]*>([\s\S]*?)<\/span>/i)
		|| String(html || "").match(/class=["'][^"']*\bauthor\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i);
	return match && match[1] ? this._stripTags(match[1]) : "";
};

NovelFireSource._extractGenres = function(html) {
	var genres = [];
	var section = (String(html || "").match(/<div\b[^>]*class=["'][^"']*\bcategories\b[^"']*["'][^>]*>[\s\S]*?<h4>Genres<\/h4>([\s\S]*?)<\/div>/i) || [])[1] || "";
	var regex = /<a\b[^>]*class=["'][^"']*\bproperty-item\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
	var match;
	while ((match = regex.exec(section)) !== null) {
		var genre = this._stripTags(match[1]);
		if (genre && genres.indexOf(genre) === -1) genres.push(genre);
	}
	return genres;
};

NovelFireSource.getBookDetails = async function(bookId) {
	var bookUrl = this._bookUrl(bookId);
	var html = await this._fetchHtml(bookUrl, this.BASE_URL + "/", "details");
	return {
		id: this._bookPath(bookUrl) || bookId,
		title: this._extractMeta(html, "og:title").replace(/\s+-\s+Novel Fire\s*$/i, "").trim() || this._decode(this._slugFromPath(bookUrl).replace(/-/g, " ")),
		author: this._extractBookAuthor(html),
		cover: this._extractMeta(html, "og:image") || this._extractItempropMeta(html, "image"),
		description: this._extractBookDescription(html),
		genres: this._extractGenres(html),
	};
};

NovelFireSource._parseSearchResults = function(html) {
	var body = String(html || "").split(/<section\b[^>]*class=["'][^"']*popular-novels/i)[0];
	var results = [];
	var seen = {};
	var itemRe = /<li\b[^>]*class=["'][^"']*novel-item[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
	var item;
	while ((item = itemRe.exec(body)) !== null) {
		var htmlItem = item[1] || "";
		var link = htmlItem.match(/<a\b([^>]*)href=["']([^"']*\/book\/[^"']+)["']([^>]*)>([\s\S]*?)<\/a>/i);
		if (!link) continue;
		var bookPath = this._bookPath(link[2]);
		if (!bookPath || seen[bookPath]) continue;
		var attrs = String((link[1] || "") + " " + (link[3] || ""));
		var titleAttr = (attrs.match(/\btitle=["']([^"']+)["']/i) || [])[1] || "";
		var titleMatch = htmlItem.match(/class=["'][^"']*novel-title[^"']*["'][^>]*>([\s\S]*?)<\/(?:h3|h4|div|span)>/i);
		var title = this._stripTags(titleAttr || (titleMatch && titleMatch[1]) || link[4]) || this._decode(this._slugFromPath(bookPath).replace(/-/g, " "));
		if (!title) continue;
		var imageMatch = htmlItem.match(/<img\b[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/i);
		var countMatch = htmlItem.match(/([\d,]+)\s+chapters?/i);
		seen[bookPath] = true;
		results.push({
			id: bookPath,
			title: title,
			author: "",
			cover: imageMatch && imageMatch[1] ? this._absoluteUrl(imageMatch[1], this.BASE_URL + "/") : "",
			url: this.BASE_URL + bookPath,
			format: "epub",
			size: countMatch ? countMatch[1].replace(/,/g, "") + " chapters" : "",
			source: "Novel Fire",
			extra: {
				bookPath: bookPath,
			},
		});
	}
	return results;
};

NovelFireSource.search = async function(query, page) {
	if (!query || !String(query).trim()) return [];
	var html = await this._fetchHtml(this._searchUrl(String(query).trim(), page || 0), this.BASE_URL + "/", "search");
	return this._parseSearchResults(html).slice(0, 40);
};

NovelFireSource._chapterNumber = function(url, title, fallback) {
	var value = String(url || "") + " " + String(title || "");
	var match = value.match(/chapter[-\s_]*(\d+(?:\.\d+)?)/i)
		|| value.match(/\bch(?:apter)?\.?\s*(\d+(?:\.\d+)?)/i);
	var number = match ? parseFloat(match[1]) : NaN;
	return isNaN(number) ? fallback : number;
};

NovelFireSource._chapterSortValue = function(chapter) {
	var value = Number(chapter && chapter.chapterNumber);
	if (!isNaN(value) && value > 0) return value;
	value = Number(chapter && chapter.index);
	if (!isNaN(value) && value > 0) return value;
	return 0;
};

NovelFireSource._chapterCountFromHtml = function(html) {
	var text = String(html || "");
	var patterns = [
		/A\s+total\s+of\s+([\d,]+)\s+chapters/i,
		/([\d,]+)\s*<\/strong>\s*<small>\s*Chapters\s*<\/small>/i,
		/chapterNumber\s*&&\s*chapterNumber\s*<=\s*([\d,]+)/i,
		/([\d,]+)\s+chapters?\s+have\s+been/i,
	];
	for (var i = 0; i < patterns.length; i++) {
		var match = text.match(patterns[i]);
		if (match && match[1]) {
			var count = parseInt(String(match[1]).replace(/,/g, ""), 10);
			if (!isNaN(count) && count > 0) return Math.min(count, 10000);
		}
	}
	return 0;
};

NovelFireSource._parseChapterLinks = function(html, bookUrl) {
	var chapters = [];
	var seen = {};
	var bookPath = this._bookPath(bookUrl);
	var slug = this._slugFromPath(bookPath);
	var anchorRe = /<a\b([^>]*)href=["']([^"']*\/book\/[^"']*\/chapter-[^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
	var match;
	while ((match = anchorRe.exec(String(html || ""))) !== null) {
		var href = match[2] || "";
		if (slug && href.indexOf(slug) === -1) continue;
		var chapterUrl = this._absoluteUrl(href, bookUrl);
		if (!chapterUrl || seen[chapterUrl]) continue;
		var attrs = String((match[1] || "") + " " + (match[3] || ""));
		var titleAttr = (attrs.match(/\btitle=["']([^"']+)["']/i) || [])[1] || "";
		var titleMatch = String(match[0]).match(/class=["'][^"']*chapter-title[^"']*["'][^>]*>([\s\S]*?)<\/(?:strong|span|div)>/i);
		var title = this._stripTags(titleAttr || (titleMatch && titleMatch[1]) || match[4]) || "Chapter " + (chapters.length + 1);
		if (/^(?:previous|next|read now)$/i.test(title)) continue;
		var chapterNumber = this._chapterNumber(chapterUrl, title, chapters.length + 1);
		var dateMatch = String(match[0]).match(/datetime=["']([^"']+)["']/i);
		seen[chapterUrl] = true;
		chapters.push({
			id: chapterUrl,
			title: title,
			index: chapterNumber,
			chapterNumber: chapterNumber,
			url: chapterUrl,
			datePublished: dateMatch && dateMatch[1] ? dateMatch[1] : undefined,
		});
	}
	var self = this;
	chapters.sort(function(a, b) {
		return self._chapterSortValue(a) - self._chapterSortValue(b);
	});
	for (var i = 0; i < chapters.length; i++) {
		chapters[i].index = i + 1;
	}
	return chapters;
};

NovelFireSource._lastChapterListPage = function(html) {
	var maxPage = 1;
	var regex = /[?&]page=(\d+)/gi;
	var match;
	while ((match = regex.exec(String(html || ""))) !== null) {
		var page = parseInt(match[1], 10);
		if (!isNaN(page) && page > maxPage) maxPage = page;
	}
	return Math.min(maxPage, 100);
};

NovelFireSource._mergeChapters = function(target, additions) {
	var seen = {};
	for (var i = 0; i < target.length; i++) {
		seen[target[i].url || target[i].id] = true;
	}
	for (var j = 0; j < additions.length; j++) {
		var key = additions[j].url || additions[j].id;
		if (!key || seen[key]) continue;
		seen[key] = true;
		target.push(additions[j]);
	}
	target.sort(function(a, b) {
		return NovelFireSource._chapterSortValue(a) - NovelFireSource._chapterSortValue(b);
	});
	for (var n = 0; n < target.length; n++) {
		target[n].index = n + 1;
	}
	return target;
};

NovelFireSource.getBookChapters = async function(bookId) {
	var bookUrl = this._bookUrl(bookId);
	var chaptersUrl = bookUrl.replace(/\/+$/, "") + "/chapters";
	var maxBuildChapters = await this._getMaxBuildChapters();
	var html = await this._fetchHtml(chaptersUrl, bookUrl, "chapters");
	var chapters = this._parseChapterLinks(html, bookUrl);
	var totalCount = this._chapterCountFromHtml(html);
	if (totalCount > maxBuildChapters) {
		throw new Error("Novel Fire lists " + totalCount + " chapters for this novel. Cinder's current EPUB builder is limited to " + maxBuildChapters + " chapters to avoid timeouts. Lower-volume novels should build normally; raise Max EPUB Chapters in extension settings only if you want to try a larger build.");
	}
	var lastPage = this._lastChapterListPage(html);
	for (var page = 2; page <= lastPage; page++) {
		var pageUrl = chaptersUrl + "?page=" + page;
		this._mergeChapters(chapters, this._parseChapterLinks(await this._fetchHtml(pageUrl, bookUrl, "chapters"), bookUrl));
		if (chapters.length > maxBuildChapters) {
			throw new Error("Novel Fire returned more than " + maxBuildChapters + " chapters for this novel. Raise Max EPUB Chapters in extension settings only if you want to try a larger build.");
		}
	}
	if (!chapters.length) {
		chapters = this._parseChapterLinks(await this._fetchHtml(bookUrl, this.BASE_URL + "/", "chapters"), bookUrl);
	}
	if (!chapters.length) {
		throw new Error("Novel Fire did not expose any chapter links for this novel.");
	}
	if (chapters.length > maxBuildChapters) {
		throw new Error("Novel Fire returned more than " + maxBuildChapters + " chapters for this novel. Raise Max EPUB Chapters in extension settings only if you want to try a larger build.");
	}
	return chapters;
};

NovelFireSource._extractContentHtml = function(html) {
	var text = String(html || "");
	var content = this._elementByIdHtml(text, "content");
	if (content && this._stripTags(content).length > 200) return content;
	var patterns = [
		/<div\b[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div\b[^>]*class=["'][^"']*(?:box-notification|nf-ads|chapternav|report-container)[^"']*["']|<\/div>\s*<div\b[^>]*class=["'][^"']*box-notification)/i,
		/<div\b[^>]*id=["']chapter-container["'][^>]*>[\s\S]*?<div\b[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/div>/i,
		/<article\b[^>]*id=["']chapter-article["'][^>]*>([\s\S]*?)<\/article>/i,
	];
	for (var i = 0; i < patterns.length; i++) {
		var match = text.match(patterns[i]);
		if (match && this._stripTags(match[1]).length > 200) return match[1];
	}
	return "";
};

NovelFireSource._titleFromChapterPage = function(html, fallbackUrl) {
	var match = String(html || "").match(/class=["'][^"']*chapter-title[^"']*["'][^>]*>([\s\S]*?)<\/(?:h1|h2|span|div)>/i)
		|| String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
	if (match) return this._stripTags(match[1]);
	var title = this._extractMeta(html, "og:title") || this._extractMeta(html, "twitter:title");
	if (title) return title.replace(/\s+-\s+Novel Fire\s*$/i, "").trim();
	return this._decode(this._slugFromPath(fallbackUrl || "Chapter").replace(/-/g, " "));
};

NovelFireSource._sanitizeChapterHtml = function(html, pageUrl) {
	var cleaned = String(html || "");
	cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
	cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");
	cleaned = cleaned.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
	cleaned = cleaned.replace(/<ins[\s\S]*?<\/ins>/gi, "");
	cleaned = cleaned.replace(/<div\b[^>]*class=["'][^"']*(?:nf-ads|box-notification|chapternav|report-container|text-center|box-notice|adcash)[^"']*["'][\s\S]*?<\/div>/gi, "");
	cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
	cleaned = cleaned.replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "");
	cleaned = cleaned.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
	cleaned = cleaned.replace(/javascript:/gi, "");
	return cleaned.replace(/(href|src)=(['"])([^'"]+)\2/gi, function(_, attr, quote, value) {
		if (!value || value.indexOf("data:") === 0 || value.indexOf("#") === 0) return attr + "=" + quote + value + quote;
		return attr + "=" + quote + NovelFireSource._absoluteUrl(value, pageUrl) + quote;
	});
};

NovelFireSource.getBookChapter = async function(chapterId) {
	var chapterUrl = this._chapterUrl(chapterId);
	var html = await this._fetchHtml(chapterUrl, this.BASE_URL + "/", "chapter");
	var content = this._extractContentHtml(html);
	if (!content) {
		throw new Error("Could not locate Novel Fire chapter content.");
	}
	return {
		id: chapterUrl,
		title: this._titleFromChapterPage(html, chapterUrl),
		url: chapterUrl,
		html: this._sanitizeChapterHtml(content, chapterUrl),
	};
};

__cinderExport = NovelFireSource;
