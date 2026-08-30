var LuminareTranslationsSource = {};

LuminareTranslationsSource.id = "luminaretranslations";
LuminareTranslationsSource.name = "Luminare Translations";
LuminareTranslationsSource.version = "0.1.1-cinder";
LuminareTranslationsSource.icon = "LT";
LuminareTranslationsSource.description = "Search public Luminare light novels and build available chapters into EPUB on device. No debrid required.";
LuminareTranslationsSource.contentType = "books";
LuminareTranslationsSource.contentTypes = ["webnovel", "ebook"];
LuminareTranslationsSource.contentSubtypes = ["lightNovel", "webFiction", "translatedNovel"];
LuminareTranslationsSource.capabilities = {
	search: true,
	discover: true,
	download: false,
	resolve: false,
	bookChapters: true,
	manga: false,
};

LuminareTranslationsSource.BASE_URL = "https://luminaretranslations.com";
LuminareTranslationsSource.API_URL = LuminareTranslationsSource.BASE_URL + "/wp-json/wp/v2";
LuminareTranslationsSource.NOVEL_TYPE_IDS = "57,30";
LuminareTranslationsSource.CACHE_TTL_MS = 5 * 60 * 1000;
LuminareTranslationsSource._seriesCache = {};
LuminareTranslationsSource._chapterCache = {};

LuminareTranslationsSource._headers = function(accept) {
	return {
		"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		"Accept": accept || "application/json",
		"Accept-Language": "en-US,en;q=0.9",
		"Referer": this.BASE_URL + "/",
	};
};

LuminareTranslationsSource._parseJson = function(data, url) {
	if (data && typeof data === "object") return data;
	var text = String(data || "").trim();
	if (!text || text.charAt(0) === "<") {
		throw new Error("Luminare returned an unusable response: " + url);
	}
	try {
		return JSON.parse(text);
	} catch (_) {
		throw new Error("Luminare returned invalid JSON: " + url);
	}
};

LuminareTranslationsSource._fetchJson = async function(url) {
	var response = await cinder.fetch(url, {
		headers: this._headers("application/json"),
		timeout: 30000,
	});
	if (!response || response.status < 200 || response.status >= 300 || response.data == null) {
		var status = response && response.status ? " (HTTP " + response.status + ")" : "";
		throw new Error("Luminare request failed" + status + ": " + url);
	}
	return this._parseJson(response.data, url);
};

LuminareTranslationsSource._fetchHtml = async function(url) {
	var response = await cinder.fetch(url, {
		headers: this._headers("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
		timeout: 30000,
	});
	if (!response || response.status < 200 || response.status >= 300 || !response.data) {
		var status = response && response.status ? " (HTTP " + response.status + ")" : "";
		throw new Error("Luminare page request failed" + status + ": " + url);
	}
	return String(response.data);
};

LuminareTranslationsSource._decodeEntities = function(value) {
	return String(value || "")
		.replace(/&#x([0-9a-f]+);/gi, function(_, code) { return String.fromCharCode(parseInt(code, 16)); })
		.replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(parseInt(code, 10)); })
		.replace(/&quot;/gi, '"')
		.replace(/&apos;|&#039;/gi, "'")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&");
};

LuminareTranslationsSource._text = function(value) {
	var text = String(value || "")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ");
	text = this._decodeEntities(text).replace(/\s+/g, " ").trim();
	if (typeof cinder !== "undefined" && cinder.normalizeText) return cinder.normalizeText(text);
	return text;
};

LuminareTranslationsSource._absoluteUrl = function(url, baseUrl) {
	var value = this._decodeEntities(url || "").trim();
	if (!value) return "";
	if (/^https?:\/\//i.test(value)) return value;
	if (value.indexOf("//") === 0) return "https:" + value;
	if (typeof cinder !== "undefined" && cinder.resolveUrl) {
		return cinder.resolveUrl(value, baseUrl || this.BASE_URL + "/");
	}
	if (value.charAt(0) === "/") return this.BASE_URL + value;
	return (baseUrl || this.BASE_URL + "/").replace(/\/[^/]*$/, "/") + value;
};

LuminareTranslationsSource._mediaCover = function(media) {
	if (!media) return "";
	var sizes = media.media_details && media.media_details.sizes;
	return (sizes && sizes.large && sizes.large.source_url) ||
		(sizes && sizes.medium_large && sizes.medium_large.source_url) ||
		media.source_url || "";
};

LuminareTranslationsSource._fetchMediaMap = async function(ids) {
	var unique = [];
	var seen = {};
	for (var i = 0; i < ids.length; i++) {
		var id = Number(ids[i]);
		if (!id || seen[id]) continue;
		seen[id] = true;
		unique.push(id);
	}
	if (!unique.length) return {};
	var url = this.API_URL + "/media?include=" + unique.join(",") + "&per_page=" + unique.length + "&_fields=id,source_url,media_details";
	var items = await this._fetchJson(url);
	var map = {};
	for (var j = 0; j < items.length; j++) map[String(items[j].id)] = this._mediaCover(items[j]);
	return map;
};

LuminareTranslationsSource._fetchGenreNames = async function(ids) {
	var unique = [];
	var seen = {};
	for (var i = 0; i < ids.length; i++) {
		var id = Number(ids[i]);
		if (!id || seen[id]) continue;
		seen[id] = true;
		unique.push(id);
	}
	if (!unique.length) return [];
	var url = this.API_URL + "/genre?include=" + unique.join(",") + "&per_page=" + unique.length + "&_fields=id,name";
	var terms = await this._fetchJson(url);
	var names = [];
	for (var j = 0; j < terms.length; j++) {
		var name = this._text(terms[j].name);
		if (name) names.push(name);
	}
	return names;
};

LuminareTranslationsSource._mapSeries = function(item, cover) {
	var meta = item && item.meta ? item.meta : {};
	var description = this._text((item.excerpt && item.excerpt.rendered) || "");
	return {
		id: String(item.slug || item.id),
		title: this._text(item && item.title && item.title.rendered) || "Untitled Luminare novel",
		author: this._text(meta.author || ""),
		cover: cover || "",
		url: item.link || this.BASE_URL + "/series/" + item.slug + "/",
		format: "epub",
		source: "Luminare Translations",
		description: description || undefined,
		extra: {
			seriesId: item.id,
			description: description || undefined,
			featuredMediaId: item.featured_media || undefined,
		},
	};
};

LuminareTranslationsSource._fetchSeriesPage = async function(query, page, orderBy, order) {
	var pageNumber = Math.max(1, Number(page || 0) + 1);
	var params = [
		"per_page=20",
		"page=" + pageNumber,
		"series_type=" + this.NOVEL_TYPE_IDS,
		"_fields=id,slug,link,title,excerpt,featured_media,meta,genre,series_type,modified",
	];
	if (query) params.push("search=" + encodeURIComponent(query));
	if (orderBy) {
		params.push("orderby=" + encodeURIComponent(orderBy));
		params.push("order=" + (order || "desc"));
	}
	var items;
	try {
		items = await this._fetchJson(this.API_URL + "/series?" + params.join("&"));
	} catch (err) {
		if (pageNumber > 1 && /HTTP 400/.test(String(err && err.message))) return [];
		throw err;
	}
	if (!Array.isArray(items) || !items.length) return [];
	var mediaIds = [];
	for (var i = 0; i < items.length; i++) mediaIds.push(items[i].featured_media);
	var mediaMap = {};
	try { mediaMap = await this._fetchMediaMap(mediaIds); } catch (_) {}
	var results = [];
	for (var j = 0; j < items.length; j++) {
		results.push(this._mapSeries(items[j], mediaMap[String(items[j].featured_media)] || ""));
	}
	return results;
};

LuminareTranslationsSource.search = async function(query, page) {
	var text = String(query || "").trim();
	if (!text) return [];
	return this._fetchSeriesPage(text, page || 0, "relevance", "desc");
};

LuminareTranslationsSource.getBookDetails = async function(bookId) {
	var slug = String(bookId || "").trim();
	if (!slug) throw new Error("Invalid Luminare series ID.");
	var now = Date.now ? Date.now() : new Date().getTime();
	var cache = this._seriesCache[slug];
	if (cache && now - cache.time < this.CACHE_TTL_MS) return cache.details;
	var url = this.API_URL + "/series?slug=" + encodeURIComponent(slug) + "&_fields=id,slug,link,title,content,excerpt,featured_media,meta,genre,series_type";
	var items = await this._fetchJson(url);
	if (!Array.isArray(items) || !items.length) throw new Error("Luminare series was not found.");
	var item = items[0];
	var results = await Promise.all([
		this._fetchMediaMap([item.featured_media]).catch(function() { return {}; }),
		this._fetchGenreNames(item.genre || []).catch(function() { return []; }),
	]);
	var details = {
		id: slug,
		title: this._text(item.title && item.title.rendered),
		author: this._text(item.meta && item.meta.author),
		cover: results[0][String(item.featured_media)] || "",
		description: this._text((item.content && item.content.rendered) || (item.excerpt && item.excerpt.rendered) || ""),
		genres: results[1],
	};
	this._seriesCache[slug] = { time: now, details: details };
	return details;
};

LuminareTranslationsSource._extractJsonArray = function(html, marker) {
	var source = String(html || "");
	var markerIndex = source.indexOf(marker);
	if (markerIndex < 0) return [];
	var arrayStart = source.indexOf("[", markerIndex + marker.length);
	if (arrayStart < 0) return [];
	var decoded = this._decodeEntities(source.slice(arrayStart));
	var depth = 0;
	var inString = false;
	var escaped = false;
	for (var i = 0; i < decoded.length; i++) {
		var ch = decoded.charAt(i);
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === "[") depth++;
		else if (ch === "]") {
			depth--;
			if (depth === 0) {
				try { return JSON.parse(decoded.slice(0, i + 1)); } catch (_) { return []; }
			}
		}
	}
	return [];
};

LuminareTranslationsSource._chapterSortValue = function(chapter, fallback) {
	var group = Number(chapter.group_sort_index);
	if (!isFinite(group)) {
		var groupMatch = String(chapter.group || "").match(/(\d+(?:\.\d+)?)/);
		group = groupMatch ? Number(groupMatch[1]) : 0;
	}
	var number = Number(chapter.number);
	if (!isFinite(number)) number = Number(fallback || 0);
	return group * 100000 + number * 100;
};

LuminareTranslationsSource._chapterTitle = function(chapter, fallback) {
	var groupName = this._text(chapter.group_name || "");
	var title = this._text(chapter.title || "") || "Chapter " + fallback;
	var subtitle = this._text(chapter.subtitle || "");
	if (subtitle && title.toLowerCase().indexOf(subtitle.toLowerCase()) < 0) title += ": " + subtitle;
	if (groupName && title.toLowerCase().indexOf(groupName.toLowerCase()) < 0) title = groupName + " - " + title;
	return title;
};

LuminareTranslationsSource.getBookChapters = async function(bookId) {
	var slug = String(bookId || "").trim();
	if (!slug) throw new Error("Invalid Luminare series ID.");
	var seriesUrl = this.BASE_URL + "/series/" + encodeURIComponent(slug) + "/";
	var html = await this._fetchHtml(seriesUrl);
	var raw = this._extractJsonArray(html, "chapters:");
	if (!raw.length) throw new Error("Luminare did not expose a usable chapter index for this novel.");
	var chapters = [];
	for (var i = 0; i < raw.length; i++) {
		var item = raw[i] || {};
		if (item.is_locked === true || String(item.chapter_type || "text").toLowerCase() === "manga") continue;
		var id = item.id ? String(item.id) : String(item.url || "");
		if (!id) continue;
		this._chapterCache[id] = item;
		chapters.push({
			id: id,
			title: this._chapterTitle(item, i + 1),
			url: item.url || undefined,
			datePublished: item.published_at || undefined,
			_sort: this._chapterSortValue(item, i + 1),
		});
	}
	chapters.sort(function(a, b) {
		if (a._sort !== b._sort) return a._sort - b._sort;
		return String(a.datePublished || "").localeCompare(String(b.datePublished || ""));
	});
	for (var j = 0; j < chapters.length; j++) {
		chapters[j].index = j + 1;
		delete chapters[j]._sort;
	}
	if (!chapters.length) throw new Error("Luminare has no public text chapters available for this novel.");
	return chapters;
};

LuminareTranslationsSource._normalizeImageTag = function(tag, pageUrl) {
	var value = String(tag || "");
	var source = (value.match(/\s(?:data-src|data-lazy-src|data-original)=["']([^"']+)["']/i) || [])[1];
	var current = (value.match(/\ssrc=["']([^"']+)["']/i) || [])[1];
	if (source && (!current || /^data:image\/svg/i.test(current))) {
		if (/\ssrc=["']/i.test(value)) value = value.replace(/\ssrc=(["'])[^"']*\1/i, " src=\"" + this._absoluteUrl(source, pageUrl) + "\"");
		else value = value.replace(/<img\b/i, "<img src=\"" + this._absoluteUrl(source, pageUrl) + "\"");
	}
	return value;
};

LuminareTranslationsSource._sanitizeHtml = function(html, pageUrl) {
	var self = this;
	var cleaned = String(html || "")
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
		.replace(/<form[\s\S]*?<\/form>/gi, "")
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

LuminareTranslationsSource._chapterFromHtml = async function(url, fallbackTitle) {
	var html = await this._fetchHtml(url);
	var doc = cinder.parseHTML(html);
	var content = doc.querySelector("article.prose") || doc.querySelector("article") || doc.querySelector(".entry-content");
	if (!content || this._text(content.text()).length < 40) throw new Error("Could not locate Luminare chapter content.");
	var titleElement = doc.querySelector("h1") || doc.querySelector("title");
	return {
		id: url,
		title: this._text(titleElement ? titleElement.text() : "") || fallbackTitle || "Chapter",
		url: url,
		html: this._sanitizeHtml(content.html(), url),
	};
};

LuminareTranslationsSource.getBookChapter = async function(chapterId) {
	var id = String(chapterId || "").trim();
	if (!id) throw new Error("Invalid Luminare chapter ID.");
	var cached = this._chapterCache[id] || {};
	if (/^https?:\/\//i.test(id)) return this._chapterFromHtml(id, this._chapterTitle(cached, 1));
	var url = this.API_URL + "/chapter/" + encodeURIComponent(id) + "?_fields=id,link,title,content,meta,date";
	var chapter = await this._fetchJson(url);
	if (!chapter || !chapter.content || !chapter.content.rendered) {
		if (cached.url) return this._chapterFromHtml(cached.url, this._chapterTitle(cached, 1));
		throw new Error("Luminare chapter content is unavailable.");
	}
	var meta = chapter.meta || cached || {};
	return {
		id: id,
		title: this._chapterTitle({
			group_name: cached.group_name,
			title: meta.chapter_title || (chapter.title && chapter.title.rendered),
			subtitle: meta.chapter_subtitle,
		}, 1),
		url: chapter.link || cached.url,
		html: this._sanitizeHtml(chapter.content.rendered, chapter.link || cached.url || this.BASE_URL + "/"),
		datePublished: chapter.date || cached.published_at,
	};
};

LuminareTranslationsSource.getDiscoverSections = async function() {
	return [
		{ id: "latest", title: "Latest Novels", icon: "LT" },
		{ id: "all", title: "All Novels", icon: "LT" },
	];
};

LuminareTranslationsSource.getDiscoverItems = async function(sectionId, page) {
	if (sectionId === "all") return this._fetchSeriesPage("", page || 0, "title", "asc");
	return this._fetchSeriesPage("", page || 0, "modified", "desc");
};

__cinderExport = LuminareTranslationsSource;
