var LiteroticaSource = {};

LiteroticaSource.id = "literotica";
LiteroticaSource.name = "Literotica";
LiteroticaSource.version = "0.1.1-cinder";
LiteroticaSource.icon = "LT";
LiteroticaSource.description = "Search adult fiction from Literotica and build stories into EPUB on device. No debrid required.";
LiteroticaSource.contentType = "books";
LiteroticaSource.contentTypes = ["webnovel", "ebook"];
LiteroticaSource.contentSubtypes = ["webFiction", "adultFiction"];
LiteroticaSource.isAdult = true;
LiteroticaSource.capabilities = {
	search: true,
	discover: false,
	download: false,
	resolve: false,
	bookChapters: true,
	manga: false,
};

LiteroticaSource.BASE_URL = "https://www.literotica.com";
LiteroticaSource.SEARCH_URL = "https://search.literotica.com";
LiteroticaSource._activeBaseUrl = "";

LiteroticaSource.getSettings = function() {
	return [
		{
			id: "base_url",
			label: "Base URL",
			type: "text",
			defaultValue: "https://www.literotica.com",
			placeholder: "https://www.literotica.com",
		},
	];
};

LiteroticaSource._cleanUrlString = function(value) {
	return String(value || "").trim().replace(/[\s\u00a0\u200b-\u200d\ufeff]+/g, "");
};

LiteroticaSource._normalizeBaseUrl = function(value) {
	var base = this._cleanUrlString(value).replace(/%(?:20|09|0a|0d)/gi, "");
	if (!base) return this.BASE_URL;
	if (!/^https?:\/\//i.test(base)) base = "https://" + base;
	return base.replace(/\/+$/, "");
};

LiteroticaSource._getBaseUrl = async function() {
	var configured = "";
	try {
		if (typeof cinder !== "undefined" && cinder.store && cinder.store.get) {
			configured = await cinder.store.get("base_url");
		}
	} catch (_) {}
	this._activeBaseUrl = this._normalizeBaseUrl(configured || this.BASE_URL);
	return this._activeBaseUrl;
};

LiteroticaSource._baseUrl = function() {
	this._activeBaseUrl = this._normalizeBaseUrl(this._activeBaseUrl || this.BASE_URL);
	return this._activeBaseUrl;
};

LiteroticaSource._headers = function(referer) {
	return {
		"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"Referer": referer || this.BASE_URL + "/",
	};
};

LiteroticaSource._browserHeaders = function(referer, expectedKind) {
	var headers = this._headers(referer);
	headers["X-Cinder-Suppress-Interactive"] = "1";
	headers["X-Cinder-Visible-Layout"] = "1";
	headers["X-Cinder-Wake-Page"] = "1";
	headers["X-Cinder-Min-Wait-Ms"] = expectedKind === "chapter" ? "1200" : "1800";
	headers["X-Cinder-Max-Wait-Ms"] = "12000";
	if (expectedKind === "search") headers["X-Cinder-Wait-For-Selector"] = "[typeof='CreativeWork'], a[href*='/s/']";
	if (expectedKind === "chapter") headers["X-Cinder-Wait-For-Selector"] = "[itemprop='articleBody']";
	return headers;
};

LiteroticaSource._decode = function(text) {
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

LiteroticaSource._stripTags = function(html) {
	return this._decode(String(html || "")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]*>/g, " "));
};

LiteroticaSource._escapeHtml = function(value) {
	return String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
};

LiteroticaSource._absoluteUrl = function(url, baseUrl) {
	var value = this._cleanUrlString(this._decode(url || ""));
	var base = this._cleanUrlString(baseUrl || this._baseUrl() + "/");
	if (!value) return "";
	if (/^https?:\/\//i.test(value)) return value;
	if (value.indexOf("//") === 0) return "https:" + value;
	if (typeof cinder !== "undefined" && cinder.resolveUrl) {
		return cinder.resolveUrl(value, base);
	}
	var root = (String(base).match(/^https?:\/\/[^\/]+/i) || [this._baseUrl()])[0];
	if (value.charAt(0) === "/") return root + value;
	return root + "/" + value.replace(/^\/+/, "");
};

LiteroticaSource._slugFromUrl = function(url) {
	var match = String(url || "").match(/\/s\/([^/?#]+)/i);
	return match ? this._decode(match[1]) : "";
};

LiteroticaSource._storyUrlFromBookId = function(bookId) {
	var value = this._decode(bookId || "");
	if (/^https?:\/\//i.test(value)) return value;
	if (value.indexOf("literotica::") === 0) value = value.slice("literotica::".length);
	if (!value) throw new Error("Invalid Literotica story id.");
	if (value.indexOf("/s/") === 0) return this._baseUrl() + value;
	return this._baseUrl() + "/s/" + encodeURIComponent(value).replace(/%2F/gi, "/");
};

LiteroticaSource._bookIdFromUrl = function(url) {
	var slug = this._slugFromUrl(url);
	return slug ? "literotica::" + slug : "literotica::" + this._cleanUrlString(url);
};

LiteroticaSource._searchUrl = function(query, page) {
	var url = this.SEARCH_URL + "/?query=" + encodeURIComponent(query || "");
	if (page && page > 0) url += "&page=" + (page + 1);
	return url;
};

LiteroticaSource._looksBlockedHtml = function(html) {
	var text = String(html || "").toLowerCase();
	return text.indexOf("just a moment") >= 0 ||
		text.indexOf("checking your browser") >= 0 ||
		text.indexOf("verify you are human") >= 0 ||
		text.indexOf("security challenge") >= 0;
};

LiteroticaSource._sleep = function(ms) {
	if (typeof setTimeout !== "function") return Promise.resolve();
	return new Promise(function(resolve) {
		setTimeout(resolve, ms);
	});
};

LiteroticaSource._hasExpectedHtml = function(html, expectedKind) {
	var source = String(html || "");
	if (!expectedKind) return source.length > 500;
	if (expectedKind === "search") {
		return this._parseSearchResults(source).length > 0 || /href=["'][^"']*\/s\//i.test(source);
	}
	if (expectedKind === "chapter") {
		return /\bitemprop\s*=\s*["']articleBody["']/i.test(source);
	}
	return source.length > 500;
};

LiteroticaSource._isUsableResponse = function(response, html, expectedKind) {
	if (!response || response.status < 200 || response.status >= 300) return false;
	if (expectedKind) return this._hasExpectedHtml(html, expectedKind);
	return String(html || "").length > 500 && !this._looksBlockedHtml(html);
};

LiteroticaSource._fetchHtml = async function(url, expectedKind) {
	var response = null;
	var headers = this._headers(url);
	try {
		response = await cinder.fetch(url, {
			headers: headers,
			timeout: 25000,
		});
	} catch (_) {}
	var html = response && response.data ? String(response.data) : "";
	var usable = this._isUsableResponse(response, html, expectedKind);
	if (!usable) {
		try {
			await this._sleep(350);
			response = await cinder.fetch(url, {
				headers: headers,
				timeout: 25000,
			});
			html = response && response.data ? String(response.data) : "";
			usable = this._isUsableResponse(response, html, expectedKind);
		} catch (_) {}
	}
	if (!usable && typeof cinder !== "undefined" && cinder.fetchBrowser) {
		try {
			response = await cinder.fetchBrowser(url, {
				headers: this._browserHeaders(url, expectedKind),
				timeout: 30000,
			});
			html = response && response.data ? String(response.data) : "";
			usable = this._isUsableResponse(response, html, expectedKind);
		} catch (_) {}
	}
	if (!usable) {
		throw new Error("Literotica request failed: " + url);
	}
	return html;
};

LiteroticaSource._extractMeta = function(html, property) {
	var prop = String(property || "").replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
	var patterns = [
		new RegExp("<meta[^>]+property=[\"']" + prop + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i"),
		new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']" + prop + "[\"'][^>]*>", "i"),
		new RegExp("<meta[^>]+name=[\"']" + prop + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i"),
		new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+name=[\"']" + prop + "[\"'][^>]*>", "i"),
	];
	for (var i = 0; i < patterns.length; i++) {
		var match = String(html || "").match(patterns[i]);
		if (match && match[1]) return this._decode(match[1]);
	}
	return "";
};

LiteroticaSource._extractJsonLdObjects = function(html) {
	var objects = [];
	var regex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	var match;
	while ((match = regex.exec(String(html || ""))) !== null) {
		try {
			var parsed = JSON.parse(this._decode(match[1]));
			if (Array.isArray(parsed)) {
				for (var i = 0; i < parsed.length; i++) objects.push(parsed[i]);
			} else {
				objects.push(parsed);
			}
		} catch (_) {}
	}
	return objects;
};

LiteroticaSource._extractArticleJsonLd = function(html) {
	var objects = this._extractJsonLdObjects(html);
	for (var i = 0; i < objects.length; i++) {
		var type = objects[i] && objects[i]["@type"];
		var typeText = Array.isArray(type) ? type.join(" ") : String(type || "");
		if (/Article/i.test(typeText) && (objects[i].headline || objects[i].name)) return objects[i];
	}
	for (var j = 0; j < objects.length; j++) {
		var fallbackType = objects[j] && objects[j]["@type"];
		var fallbackTypeText = Array.isArray(fallbackType) ? fallbackType.join(" ") : String(fallbackType || "");
		if (/CreativeWork|WebPage/i.test(fallbackTypeText) && (objects[j].headline || objects[j].name)) return objects[j];
	}
	return null;
};

LiteroticaSource._getAuthorName = function(value) {
	if (!value) return "";
	if (typeof value === "string") return this._decode(value);
	if (Array.isArray(value)) return value.length ? this._getAuthorName(value[0]) : "";
	if (value.name) return this._decode(value.name);
	return "";
};

LiteroticaSource._parseSearchResultsWithDom = function(html) {
	if (typeof cinder === "undefined" || !cinder.parseHTML) return [];
	var doc = cinder.parseHTML(html);
	var cards = doc.querySelectorAll("[typeof='CreativeWork'], [property='itemListElement']");
	var results = [];
	var seen = {};
	for (var i = 0; i < cards.length; i++) {
		var card = cards[i];
		var link = card.querySelector("a[href*='/s/']");
		if (!link) continue;
		var url = this._absoluteUrl(link.attr("href") || "", this.BASE_URL);
		var slug = this._slugFromUrl(url);
		if (!slug || seen[slug]) continue;
		seen[slug] = true;
		var titleNode = link.querySelector("h1,h2,h3,h4") || link;
		var title = this._decode(titleNode.text ? titleNode.text() : "");
		var headline = card.querySelector("[property='headline']");
		var authorMeta = card.querySelector("[property='author'] meta[property='name'], meta[property='name']");
		var authorNode = card.querySelector("[property='author'] span[class*='_im'], a[href*='/authors/']");
		var dateMeta = card.querySelector("meta[property='datePublished']");
		var categoryNode = card.querySelector("a[href*='/c/'] span[class*='_im'], a[href*='/c/']");
		if (!title) continue;
		results.push({
			id: this._bookIdFromUrl(url),
			title: title,
			author: authorMeta ? this._decode(authorMeta.attr("content") || "") : (authorNode ? this._decode(authorNode.text()) : undefined),
			description: headline ? this._decode(headline.text()) : undefined,
			url: url,
			source: this.name,
			format: "epub",
			contentType: "webnovel",
			contentTypes: ["webnovel", "ebook"],
			contentSubtypes: ["adultFiction", "webFiction"],
			isAdult: true,
			publishedDate: dateMeta ? this._decode(dateMeta.attr("content") || "") : undefined,
			genres: categoryNode ? [this._decode(categoryNode.text()).replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}$/, "").trim()] : undefined,
			extra: {
				description: headline ? this._decode(headline.text()) : undefined,
				contentType: "webnovel",
				contentSubtypes: ["adultFiction", "webFiction"],
				isAdult: true,
			},
		});
	}
	return results;
};

LiteroticaSource._parseSearchResultsWithRegex = function(html) {
	var source = String(html || "");
	var results = [];
	var seen = {};
	var regex = /<a\b[^>]+href=["']([^"']*\/s\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
	var match;
	while ((match = regex.exec(source)) !== null) {
		var linkHtml = match[0];
		if (!/<h[1-6]\b/i.test(linkHtml) && !/\bai_ii\b/.test(linkHtml)) continue;
		var url = this._absoluteUrl(match[1], this.BASE_URL);
		var slug = this._slugFromUrl(url);
		if (!slug || seen[slug]) continue;
		seen[slug] = true;
		var before = source.slice(0, match.index);
		var itemMarker = before.lastIndexOf('property="itemListElement"');
		if (itemMarker < 0) itemMarker = before.lastIndexOf("property='itemListElement'");
		var cardStart = itemMarker >= 0 ? before.lastIndexOf("<div", itemMarker) : Math.max(0, match.index - 1000);
		if (cardStart < 0) cardStart = Math.max(0, match.index - 1000);
		var nextDouble = source.indexOf('property="itemListElement"', match.index + linkHtml.length);
		var nextSingle = source.indexOf("property='itemListElement'", match.index + linkHtml.length);
		var cardEnd = -1;
		if (nextDouble >= 0 && nextSingle >= 0) cardEnd = Math.min(nextDouble, nextSingle);
		else cardEnd = Math.max(nextDouble, nextSingle);
		if (cardEnd < 0) cardEnd = Math.min(source.length, match.index + 5000);
		var card = source.slice(cardStart, cardEnd);
		var titleMeta = card.match(/<meta\b[^>]+property=["']name["'][^>]+content=["']([^"']+)["'][^>]*>/i);
		var title = titleMeta ? this._decode(titleMeta[1]) : this._stripTags(match[2]);
		var headline = card.match(/<[^>]+\bproperty=["']headline["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
		var authorName = "";
		var authorMeta = card.match(/property=["']author[^>]*[\s\S]*?<meta\b[^>]+property=["']name["'][^>]+content=["']([^"']+)["'][^>]*>/i);
		if (authorMeta) authorName = this._decode(authorMeta[1]);
		var date = card.match(/<meta\b[^>]+property=["']datePublished["'][^>]+content=["']([^"']+)["'][^>]*>/i);
		var category = card.match(/<a\b[^>]+href=["'][^"']*\/c\/[^"']+["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*_im[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
		if (!title) continue;
		results.push({
			id: this._bookIdFromUrl(url),
			title: title,
			author: authorName || undefined,
			description: headline ? this._stripTags(headline[1]) : undefined,
			url: url,
			source: this.name,
			format: "epub",
			contentType: "webnovel",
			contentTypes: ["webnovel", "ebook"],
			contentSubtypes: ["adultFiction", "webFiction"],
			isAdult: true,
			publishedDate: date ? this._decode(date[1]) : undefined,
			genres: category ? [this._stripTags(category[1])] : undefined,
			extra: {
				description: headline ? this._stripTags(headline[1]) : undefined,
				contentType: "webnovel",
				contentSubtypes: ["adultFiction", "webFiction"],
				isAdult: true,
			},
		});
	}
	return results;
};

LiteroticaSource._parseSearchResults = function(html) {
	var domResults = this._parseSearchResultsWithDom(html);
	if (domResults.length) return domResults;
	return this._parseSearchResultsWithRegex(html);
};

LiteroticaSource._extractBalancedDiv = function(source, openIndex) {
	var openEnd = source.indexOf(">", openIndex);
	if (openEnd < 0) return "";
	var token = /<\/?div\b[^>]*>/gi;
	token.lastIndex = openEnd + 1;
	var depth = 1;
	var next;
	while ((next = token.exec(source)) !== null) {
		if (/^<\s*\/div/i.test(next[0])) {
			depth -= 1;
			if (depth === 0) return source.slice(openEnd + 1, next.index);
		} else {
			depth += 1;
		}
	}
	return source.slice(openEnd + 1);
};

LiteroticaSource._extractArticleBodyHtml = function(html) {
	var source = String(html || "");
	var marker = /\bitemprop\s*=\s*["']articleBody["']/i;
	var markerMatch = marker.exec(source);
	if (!markerMatch) return "";
	var openStart = source.lastIndexOf("<div", markerMatch.index);
	if (openStart < 0) openStart = source.lastIndexOf("<article", markerMatch.index);
	if (openStart < 0) return "";
	var body = this._extractBalancedDiv(source, openStart);
	body = body
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<button[\s\S]*?<\/button>/gi, "")
		.replace(/<a\b[^>]*data-action=["'][^"']*Report[^"']*["'][\s\S]*?<\/a>/gi, "")
		.replace(/\sdata-hk=["'][^"']*["']/gi, "")
		.replace(/\sclass=["'][^"']*["']/gi, "")
		.replace(/\sstyle=["'][^"']*["']/gi, "");
	return body.trim();
};

LiteroticaSource._extractPaginationPages = function(html, storyUrl) {
	var pages = [1];
	var slug = this._slugFromUrl(storyUrl);
	if (!slug) return pages;
	var regex = /href=["']([^"']*\/s\/[^"']+)["']/gi;
	var match;
	while ((match = regex.exec(String(html || ""))) !== null) {
		var href = this._decode(match[1]);
		if (href.indexOf(slug) < 0) continue;
		var pageMatch = href.match(/[?&]page=(\d+)/i) || href.match(/\/page\/(\d+)/i);
		if (!pageMatch) continue;
		var pageNum = parseInt(pageMatch[1], 10);
		if (isFinite(pageNum) && pageNum > 1 && pages.indexOf(pageNum) < 0) pages.push(pageNum);
	}
	pages.sort(function(a, b) { return a - b; });
	return pages;
};

LiteroticaSource._pageUrl = function(storyUrl, page) {
	if (!page || page <= 1) return storyUrl;
	var separator = storyUrl.indexOf("?") >= 0 ? "&" : "?";
	return storyUrl + separator + "page=" + page;
};

LiteroticaSource.search = async function(query, page) {
	await this._getBaseUrl();
	var cleanQuery = String(query || "").trim();
	if (!cleanQuery) return [];
	var html = await this._fetchHtml(this._searchUrl(cleanQuery, page || 0), "search");
	return this._parseSearchResults(html).slice(0, 25);
};

LiteroticaSource.getBookDetails = async function(bookId) {
	await this._getBaseUrl();
	var url = this._storyUrlFromBookId(bookId);
	var html = await this._fetchHtml(url, "chapter");
	var article = this._extractArticleJsonLd(html) || {};
	var title = this._decode(article.headline || article.name || this._extractMeta(html, "og:title")).replace(/\s+-\s+Literotica.*$/i, "");
	var description = this._decode(article.description || this._extractMeta(html, "description") || this._extractMeta(html, "og:description"));
	var author = this._getAuthorName(article.author);
	var cover = article.image && typeof article.image === "string" ? article.image : "";
	var genre = article.genre;
	var genres = Array.isArray(genre) ? genre.map(function(item) { return String(item || ""); }).filter(Boolean) : [];
	return {
		id: this._bookIdFromUrl(url),
		title: title || "Literotica Story",
		author: author || undefined,
		description: description || undefined,
		cover: cover || undefined,
		url: url,
		source: this.name,
		format: "epub",
		contentType: "webnovel",
		contentTypes: ["webnovel", "ebook"],
		contentSubtypes: ["adultFiction", "webFiction"],
		isAdult: true,
		publishedDate: article.datePublished || undefined,
		genres: genres.length ? genres : undefined,
	};
};

LiteroticaSource.getBookChapters = async function(bookId) {
	await this._getBaseUrl();
	var url = this._storyUrlFromBookId(bookId);
	var html = await this._fetchHtml(url, "chapter");
	var details = await this.getBookDetails(bookId);
	var pages = this._extractPaginationPages(html, url);
	var chapters = [];
	for (var i = 0; i < pages.length; i++) {
		var pageNum = pages[i];
		chapters.push({
			id: JSON.stringify({ url: this._pageUrl(url, pageNum), page: pageNum, title: details.title }),
			title: pages.length > 1 ? details.title + " - Page " + pageNum : details.title,
			chapterNumber: i + 1,
			url: this._pageUrl(url, pageNum),
		});
	}
	return chapters;
};

LiteroticaSource.getBookChapter = async function(chapterId) {
	var payload = {};
	try {
		payload = JSON.parse(String(chapterId || ""));
	} catch (_) {
		payload = { url: this._storyUrlFromBookId(chapterId), page: 1, title: "Story" };
	}
	var url = payload.url || this._storyUrlFromBookId(chapterId);
	var html = await this._fetchHtml(url, "chapter");
	var body = this._extractArticleBodyHtml(html);
	if (!body || this._stripTags(body).length < 20) {
		throw new Error("Could not extract Literotica story text.");
	}
	var title = this._decode(payload.title || "");
	if (!title) {
		var article = this._extractArticleJsonLd(html) || {};
		title = this._decode(article.headline || article.name || this._extractMeta(html, "og:title")).replace(/\s+-\s+Literotica.*$/i, "");
	}
	return {
		id: chapterId,
		title: title || "Story",
		html: "<section>" + body + "</section>",
	};
};

LiteroticaSource.testConnection = async function() {
	await this._getBaseUrl();
	var html = await this._fetchHtml(this.SEARCH_URL + "/", null);
	if (!/Sex Story Search|Search for Stories|Literotica/i.test(html)) {
		throw new Error("Literotica did not return a usable search page.");
	}
	return true;
};

__cinderExport = LiteroticaSource;
