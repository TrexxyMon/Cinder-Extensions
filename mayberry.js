var MayberrySource = {};

MayberrySource.id = "mayberry";
MayberrySource.name = "Mayberry";
MayberrySource.version = "0.1.2-cinder";
MayberrySource.icon = "MB";
MayberrySource.description = "Search and download EPUB books from the federated Mayberry library network.";
MayberrySource.contentType = "books";
MayberrySource.contentTypes = ["ebook"];
MayberrySource.language = "Multilingual";
MayberrySource.excludeFromDefaultMetadataProviders = true;
MayberrySource.capabilities = {
	search: true,
	discover: true,
	download: true,
	resolve: false,
	searchDownloads: true,
	manga: false,
};

MayberrySource.BASE_URL = "https://mayberry.pub";
MayberrySource._feedCache = {};
MayberrySource._feedCacheOrder = [];
MayberrySource._pendingFeeds = {};
MayberrySource._detailsById = {};
MayberrySource._detailsOrder = [];
MayberrySource._sections = {
	releases: "/opds/releases",
	new: "/opds/new",
	popular: "/opds/popular",
};

MayberrySource._absoluteUrl = function(value, baseUrl) {
	var url = String(value || "").trim();
	if (!url) return "";
	if (/^https?:\/\//i.test(url)) return url;
	if (url.indexOf("//") === 0) return "https:" + url;
	try {
		return new URL(url, baseUrl || this.BASE_URL).href;
	} catch (error) {
		if (url.charAt(0) === "/") return this.BASE_URL + url;
		return (baseUrl || this.BASE_URL).replace(/\/+$/, "") + "/" + url.replace(/^\/+/, "");
	}
};

MayberrySource._cleanText = function(value) {
	var text = String(value || "").replace(/\s+/g, " ").trim();
	if (text && typeof cinder !== "undefined" && typeof cinder.normalizeText === "function") {
		return cinder.normalizeText(text);
	}
	return text
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#(?:39|x27);/gi, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">");
};

MayberrySource._text = function(element) {
	if (!element || typeof element.text !== "function") return "";
	return this._cleanText(element.text());
};

MayberrySource._headers = function() {
	return {
		Accept: "application/opds+json, application/atom+xml;profile=opds-catalog;q=0.9, application/json;q=0.8, application/xml;q=0.7, */*;q=0.1",
	};
};

MayberrySource._parseFeedPayload = function(data, url) {
	var value = String(data || "").trim();
	if (value.charAt(0) === "{") {
		var json = JSON.parse(value);
		if (json && typeof json === "object" && json.metadata) {
			return { json: json, url: url };
		}
	}
	return { doc: cinder.parseXML(value), url: url };
};

MayberrySource._rememberFeed = function(url, data) {
	if (!Object.prototype.hasOwnProperty.call(this._feedCache, url)) {
		this._feedCacheOrder.push(url);
	}
	this._feedCache[url] = { data: data, savedAt: Date.now() };
	while (this._feedCacheOrder.length > 48) {
		delete this._feedCache[this._feedCacheOrder.shift()];
	}
};

MayberrySource._fetchFeed = async function(pathOrUrl, maxAgeMs) {
	var url = this._absoluteUrl(pathOrUrl || "/opds", this.BASE_URL);
	var now = Date.now();
	var cached = this._feedCache[url];
	if (cached && now - cached.savedAt <= Math.max(0, Number(maxAgeMs) || 0)) {
		return this._parseFeedPayload(cached.data, url);
	}

	if (!this._pendingFeeds[url]) {
		var self = this;
		this._pendingFeeds[url] = (async function() {
			var lastError = null;
			for (var attempt = 0; attempt < 2; attempt++) {
				try {
					var response = await cinder.fetch(url, {
						headers: self._headers(),
						timeout: 15000,
					});
					var status = Number(response && response.status) || 0;
					var data = String((response && response.data) || "");
					var isOpdsJson =
						/^\s*\{/.test(data) &&
						/"metadata"\s*:/i.test(data) &&
						/(?:"publications"|"navigation"|"groups"|"links")\s*:/i.test(data);
					if (status === 200 && (isOpdsJson || /<(?:[A-Za-z0-9_-]+:)?feed(?:\s|>)/i.test(data))) {
						return data;
					}
					if (status === 200 && /<html|<!doctype/i.test(data)) {
						throw new Error("Mayberry returned a web page instead of its OPDS catalog.");
					}
					if (status === 404) throw new Error("The requested Mayberry catalog page is unavailable.");
					if (status >= 500 || status === 0) {
						lastError = new Error("Mayberry is temporarily unavailable" + (status ? " (HTTP " + status + ")" : "") + ".");
						continue;
					}
					throw new Error("Mayberry returned HTTP " + status + ".");
				} catch (error) {
					lastError = error;
					if (attempt === 0) continue;
				}
			}
			throw lastError || new Error("Could not reach Mayberry.");
		})();
	}

	try {
		var data = await this._pendingFeeds[url];
		this._rememberFeed(url, data);
		return this._parseFeedPayload(data, url);
	} finally {
		delete this._pendingFeeds[url];
	}
};

MayberrySource._jsonText = function(value) {
	if (value == null) return "";
	if (typeof value === "string" || typeof value === "number") return this._cleanText(value);
	if (Array.isArray(value)) {
		var parts = [];
		for (var i = 0; i < value.length; i++) {
			var part = this._jsonText(value[i]);
			if (part) parts.push(part);
		}
		return parts.join(", ");
	}
	if (typeof value === "object") {
		return this._jsonText(value.name || value.value || value.title || "");
	}
	return "";
};

MayberrySource._jsonList = function(value) {
	var source = Array.isArray(value) ? value : value == null ? [] : [value];
	var results = [];
	var seen = {};
	for (var i = 0; i < source.length; i++) {
		var item = this._jsonText(source[i]).replace(/^"+|"+$/g, "").trim();
		var key = item.toLowerCase();
		if (item && !seen[key]) {
			seen[key] = true;
			results.push(item);
		}
	}
	return results;
};

MayberrySource._languageLabel = function(value) {
	var codes = this._jsonList(value);
	var labels = {
		en: "English",
		es: "Spanish",
		fr: "French",
		de: "German",
		it: "Italian",
		pt: "Portuguese",
		ja: "Japanese",
		ko: "Korean",
		zh: "Chinese",
		ru: "Russian",
		ar: "Arabic",
		nl: "Dutch",
		pl: "Polish",
		tr: "Turkish",
	};
	return codes.map(function(code) {
		var normalized = code.toLowerCase().split(/[-_]/)[0];
		return labels[normalized] || code;
	}).join(", ");
};

MayberrySource._displayIdentifier = function(identifier) {
	var value = this._jsonText(identifier);
	if (!value) return "";
	var isbn = value.match(/^urn:isbn:(.+)$/i);
	if (isbn) return "ISBN " + isbn[1];
	var mayberryId = value.match(/^urn:mayberry:(?:book:)?(.+)$/i);
	if (mayberryId) return "Mayberry ID " + mayberryId[1];
	return value;
};

MayberrySource._identifierValue = function(identifier) {
	var value = this._jsonText(identifier);
	return value.replace(/^urn:(?:isbn|mayberry:(?:book:)?)[:]?/i, "");
};

MayberrySource._formatFromLink = function(link) {
	var type = String((link && link.type) || "").toLowerCase();
	var href = String((link && link.href) || "").toLowerCase();
	if (type.indexOf("epub") >= 0 || /\.epub(?:$|[?#])/.test(href)) return "epub";
	if (type.indexOf("pdf") >= 0 || /\.pdf(?:$|[?#])/.test(href)) return "pdf";
	if (type.indexOf("audio") >= 0 || /\.m4b(?:$|[?#])/.test(href)) return "m4b";
	return "epub";
};

MayberrySource._sizeFromLink = function(link) {
	if (!link || typeof link !== "object") return undefined;
	var properties = link.properties && typeof link.properties === "object" ? link.properties : {};
	var candidates = [link.length, link.size, properties.numberOfBytes, properties.size, properties.fileSize];
	for (var i = 0; i < candidates.length; i++) {
		var value = Number(candidates[i]);
		if (isFinite(value) && value > 0) return String(Math.round(value));
	}
	return undefined;
};

MayberrySource._rememberDetails = function(result) {
	if (!result || !result.id) return;
	var key = String(result.id);
	if (!Object.prototype.hasOwnProperty.call(this._detailsById, key)) {
		this._detailsOrder.push(key);
	}
	this._detailsById[key] = {
		id: key,
		title: result.title,
		author: result.author,
		cover: result.cover,
		coverHighResolution: result.coverHighResolution || result.cover,
		description: result.description,
		genres: result.genres || (result.extra && result.extra.genres) || [],
		language: result.language || (result.extra && result.extra.language),
		isbn: result.isbn || (result.extra && result.extra.isbn),
	};
	while (this._detailsOrder.length > 200) {
		delete this._detailsById[this._detailsOrder.shift()];
	}
};

MayberrySource._parseJsonPublication = function(publication, feedUrl) {
	var metadata = publication && publication.metadata && typeof publication.metadata === "object" ? publication.metadata : {};
	var title = this._jsonText(metadata.title);
	if (!title) return null;
	var links = Array.isArray(publication.links) ? publication.links : [];
	var acquisition = null;
	for (var i = 0; i < links.length; i++) {
		var rel = this._jsonText(links[i] && links[i].rel).toLowerCase();
		var type = this._jsonText(links[i] && links[i].type).toLowerCase();
		if (rel.indexOf("acquisition") >= 0 || type.indexOf("epub") >= 0 || type.indexOf("audio") >= 0) {
			acquisition = links[i];
			break;
		}
	}
	if (!acquisition || !acquisition.href) return null;

	var images = Array.isArray(publication.images) ? publication.images : [];
	var cover = images.length ? this._absoluteUrl(images[0].href, feedUrl) : "";
	var identifier = this._jsonText(metadata.identifier);
	var identifierValue = this._identifierValue(identifier);
	var displayIdentifier = this._displayIdentifier(identifier);
	var genres = this._jsonList(metadata.subject).slice(0, 12);
	var language = this._languageLabel(metadata.language);
	var modified = this._jsonText(metadata.modified);
	var description = this._jsonText(metadata.description);
	var downloadUrl = this._absoluteUrl(acquisition.href, feedUrl);
	var format = this._formatFromLink(acquisition);
	var isIsbn = /^urn:isbn:/i.test(identifier);
	var result = {
		id: identifier || downloadUrl,
		title: title,
		author: this._jsonText(metadata.author) || "Unknown",
		cover: cover || undefined,
		coverHighResolution: cover || undefined,
		url: downloadUrl,
		format: format,
		size: this._sizeFromLink(acquisition),
		source: "Mayberry",
		description: description || undefined,
		language: language || undefined,
		genres: genres,
		isbn: isIsbn ? identifierValue : undefined,
		modifiedAt: modified || undefined,
		extra: {
			description: description || undefined,
			summary: description || undefined,
			categories: genres,
			genres: genres,
			language: language || undefined,
			identifier: identifierValue || undefined,
			displayIdentifier: displayIdentifier || undefined,
			isbn: isIsbn ? identifierValue : undefined,
			modified: modified || undefined,
			modifiedLabel: modified ? "Catalog updated " + modified.slice(0, 10) : undefined,
			mediaType: this._jsonText(metadata["@type"]) || undefined,
			downloadUrl: downloadUrl,
		},
	};
	this._rememberDetails(result);
	return result;
};

MayberrySource._entryAuthor = function(entry) {
	var names = entry.querySelectorAll("author name");
	var authors = [];
	var seen = {};
	for (var i = 0; i < names.length; i++) {
		var author = this._text(names[i]);
		var key = author.toLowerCase();
		if (author && !seen[key]) {
			seen[key] = true;
			authors.push(author);
		}
	}
	return authors.length ? authors.join(", ") : "Unknown";
};

MayberrySource._entryCategories = function(entry) {
	var categories = entry.querySelectorAll("category");
	var values = [];
	var seen = {};
	for (var i = 0; i < categories.length; i++) {
		var value = this._cleanText(categories[i].attr("label") || categories[i].attr("term") || "");
		value = value.replace(/^"+|"+$/g, "").trim();
		var key = value.toLowerCase();
		if (value && !seen[key]) {
			seen[key] = true;
			values.push(value);
		}
	}
	return values.slice(0, 12);
};

MayberrySource._parseEntry = function(entry, feedUrl) {
	var title = this._text(entry.querySelector("title"));
	if (!title) return null;

	var id = this._text(entry.querySelector("id"));
	var summary = this._text(entry.querySelector("summary"));
	if (!summary) summary = this._text(entry.querySelector("content"));
	var modified = this._text(entry.querySelector("updated"));
	var links = entry.querySelectorAll("link");
	var cover = "";
	var thumbnail = "";
	var downloadUrl = "";

	for (var i = 0; i < links.length; i++) {
		var rel = String(links[i].attr("rel") || "").toLowerCase();
		var type = String(links[i].attr("type") || "").toLowerCase();
		var href = String(links[i].attr("href") || "").trim();
		if (!href) continue;

		if (rel.indexOf("thumbnail") >= 0) {
			if (!thumbnail) thumbnail = href;
		} else if (rel.indexOf("image") >= 0 || type.indexOf("image/") === 0) {
			if (!cover) cover = href;
		}

		var isAcquisition = rel.indexOf("acquisition") >= 0;
		var isEpub = type.indexOf("application/epub+zip") >= 0 || /\.epub(?:$|[?#])/i.test(href);
		if (!downloadUrl && (isAcquisition || isEpub) && type.indexOf("atom") < 0 && type.indexOf("xml") < 0) {
			downloadUrl = href;
		}
	}

	if (!downloadUrl) return null;
	var absoluteDownloadUrl = this._absoluteUrl(downloadUrl, feedUrl);
	var categories = this._entryCategories(entry);
	var author = this._entryAuthor(entry);
	var identifierValue = this._identifierValue(id);
	var isIsbn = /^urn:isbn:/i.test(id);
	var result = {
		id: id || absoluteDownloadUrl,
		title: title,
		author: author,
		cover: this._absoluteUrl(cover || thumbnail, feedUrl) || undefined,
		coverHighResolution: this._absoluteUrl(cover || thumbnail, feedUrl) || undefined,
		url: absoluteDownloadUrl,
		format: "epub",
		source: "Mayberry",
		description: summary || undefined,
		genres: categories,
		isbn: isIsbn ? identifierValue : undefined,
		modifiedAt: modified || undefined,
		extra: {
			description: summary || undefined,
			summary: summary || undefined,
			categories: categories,
			genres: categories,
			identifier: identifierValue || undefined,
			displayIdentifier: this._displayIdentifier(id) || undefined,
			isbn: isIsbn ? identifierValue : undefined,
			modified: modified || undefined,
			modifiedLabel: modified ? "Catalog updated " + modified.slice(0, 10) : undefined,
			downloadUrl: absoluteDownloadUrl,
		},
	};
	this._rememberDetails(result);
	return result;
};

MayberrySource._parseBooks = function(feed) {
	if (feed.json && Array.isArray(feed.json.publications)) {
		var jsonResults = [];
		var jsonSeen = {};
		for (var publicationIndex = 0; publicationIndex < feed.json.publications.length; publicationIndex++) {
			var jsonResult = this._parseJsonPublication(feed.json.publications[publicationIndex], feed.url);
			if (!jsonResult) continue;
			var jsonKey = String(jsonResult.id || jsonResult.url || (jsonResult.title + "|" + jsonResult.author)).toLowerCase();
			if (jsonSeen[jsonKey]) continue;
			jsonSeen[jsonKey] = true;
			jsonResults.push(jsonResult);
		}
		return jsonResults;
	}
	var entries = feed.doc.querySelectorAll("entry");
	var results = [];
	var seen = {};
	for (var i = 0; i < entries.length; i++) {
		var result = this._parseEntry(entries[i], feed.url);
		if (!result) continue;
		var key = String(result.id || result.url || (result.title + "|" + result.author)).toLowerCase();
		if (seen[key]) continue;
		seen[key] = true;
		results.push(result);
	}
	return results;
};

MayberrySource._pagedUrl = function(path, page, query) {
	var pageNumber = Math.max(0, Number(page) || 0);
	var url = path;
	if (query !== undefined) url += "?q=" + encodeURIComponent(String(query || ""));
	if (pageNumber > 0) url += (url.indexOf("?") >= 0 ? "&" : "?") + "page=" + pageNumber;
	return url;
};

MayberrySource.search = async function(query, page) {
	var term = String(query || "").trim();
	if (!term) return [];
	var path = this._pagedUrl("/opds/search", page, term);
	var feed = await this._fetchFeed(path, 60000);
	return this._parseBooks(feed);
};

MayberrySource.getDiscoverSections = async function() {
	return [
		{ id: "releases", title: "New Releases", icon: "sparkles" },
		{ id: "new", title: "New Arrivals", icon: "time" },
		{ id: "popular", title: "Top Reads", icon: "trending-up" },
	];
};

MayberrySource.getDiscoverItems = async function(sectionId, page) {
	var path = this._sections[String(sectionId || "")];
	if (!path) return [];
	var feed = await this._fetchFeed(this._pagedUrl(path, page), 90000);
	return this._parseBooks(feed);
};

MayberrySource.testConnection = async function() {
	var feed = await this._fetchFeed("/opds", 300000);
	var title = feed.json
		? this._jsonText(feed.json.metadata && feed.json.metadata.title)
		: this._text(feed.doc.querySelector("feed > title")) || this._text(feed.doc.querySelector("title"));
	if (!title || title.toLowerCase().indexOf("mayberry") < 0) {
		throw new Error("The server did not return the Mayberry OPDS catalog.");
	}
	return true;
};

MayberrySource.getBookDetails = async function(bookId) {
	var key = String(bookId || "");
	if (this._detailsById[key]) return this._detailsById[key];
	var searchTerm = this._identifierValue(key);
	if (searchTerm) {
		var results = await this.search(searchTerm, 0);
		for (var i = 0; i < results.length; i++) {
			if (String(results[i].id) === key || String(results[i].isbn || "") === searchTerm) {
				return this._detailsById[String(results[i].id)];
			}
		}
	}
	throw new Error("Mayberry no longer lists metadata for this title.");
};

MayberrySource.getSettings = function() {
	return [];
};

__cinderExport = MayberrySource;
