var FreeMagazinesSource = {};

FreeMagazinesSource.id = "freemagazines";
FreeMagazinesSource.name = "FreeMagazines.top";
FreeMagazinesSource.version = "1.2.0-cinder";
FreeMagazinesSource.icon = "\uD83D\uDCF0";
FreeMagazinesSource.description = "Browse and search PDF magazines from FreeMagazines.top with on-device resolution.";
FreeMagazinesSource.contentType = "magazine";
FreeMagazinesSource.contentTypes = ["magazine"];
FreeMagazinesSource.capabilities = {
	search: true,
	discover: true,
	download: false,
	resolve: true,
	searchDownloads: true,
	manga: false,
};

FreeMagazinesSource.BASE_URL = "https://freemagazines.top";

FreeMagazinesSource.CATEGORIES = [
	{ id: "architecture-real-estate-building", title: "Architecture & Real Estate" },
	{ id: "audio-music", title: "Audio & Music" },
	{ id: "aviation-aeronautics-aerospace", title: "Aviation & Aerospace" },
	{ id: "boating-yachting", title: "Boating & Yachting" },
	{ id: "cars-automobiles", title: "Automotive" },
	{ id: "computers-hardwares-softwares", title: "Computers & Software" },
	{ id: "daily-weekly-newspapers", title: "Newspapers" },
	{ id: "digital-electronics", title: "Digital & Electronics" },
	{ id: "fashion-luxury-lifestyle-celebrities", title: "Fashion & Lifestyle" },
	{ id: "finances-businesses-economics", title: "Finance & Business" },
	{ id: "fitness-health-wellbeing", title: "Fitness & Health" },
	{ id: "food-cooking-baking-diet-recipes", title: "Food & Cooking" },
	{ id: "gaming-games", title: "Gaming" },
	{ id: "gardening", title: "Gardening" },
	{ id: "history", title: "History" },
	{ id: "hobby-and-leisure", title: "Hobbies & Leisure" },
	{ id: "internet-security-networks-programmation-ai", title: "Internet & Security" },
	{ id: "interiors-homes-decors-designs", title: "Home & Design" },
	{ id: "journalism-writing-culture", title: "Writing & Culture" },
	{ id: "knitting-sewing-crafting-quilting-beading", title: "Knitting & Crafts" },
	{ id: "miniature-modelling-magazines", title: "Miniature & Modelling" },
	{ id: "mobiles-apps-android-iphone-ios-smart-devices", title: "Mobile & Smart Devices" },
	{ id: "motorcycles-bikes", title: "Motorcycles & Bikes" },
	{ id: "movies-media-tv-shows-entertainment", title: "Movies & TV" },
	{ id: "pets-animals", title: "Pets & Animals" },
	{ id: "photography-photoshop-painting-arts-graphics", title: "Photography & Art" },
	{ id: "politics-current-affairs", title: "Politics & Current Affairs" },
	{ id: "ships-magazines", title: "Marine & Nautical" },
	{ id: "sports", title: "Sports" },
	{ id: "technology-engineering-sciences-artificial-intelligence", title: "Science & Technology" },
	{ id: "train-railway", title: "Train & Railway" },
	{ id: "travel-recreation-tourism-outdoors-adventures", title: "Travel & Outdoors" },
	{ id: "trucks-magazines", title: "Trucks & Commercial" },
	{ id: "womens-magazines", title: "Women's Interest" },
	{ id: "woodcraft-woodworking-woodcarving", title: "Woodworking" },
];

FreeMagazinesSource._headers = function() {
	return {
		"User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"Referer": this.BASE_URL + "/",
	};
};

FreeMagazinesSource._coverHeaders = function(pageUrl) {
	return {
		"User-Agent": this._headers()["User-Agent"],
		"Referer": pageUrl || this.BASE_URL + "/",
	};
};

FreeMagazinesSource._absoluteUrl = function(value, baseUrl) {
	var raw = this._normalizeUrl(value);
	if (!raw || /^data:/i.test(raw)) return "";
	if (/^\/\//.test(raw)) return "https:" + raw;
	if (/^https?:\/\//i.test(raw)) return raw;
	try {
		return cinder.resolveUrl(raw, baseUrl || this.BASE_URL + "/");
	} catch (err) {
		return "";
	}
};

FreeMagazinesSource._imageUrlFromNode = function(image, baseUrl) {
	if (!image) return "";
	var raw = image.attr("data-src")
		|| image.attr("data-lazy-src")
		|| image.attr("src")
		|| "";
	if (!raw || /^data:/i.test(raw)) {
		var srcset = image.attr("data-srcset") || image.attr("srcset") || "";
		var choices = String(srcset).split(",");
		for (var i = choices.length - 1; i >= 0; i--) {
			var candidate = String(choices[i] || "").trim().split(/\s+/)[0];
			if (candidate && !/^data:/i.test(candidate)) {
				raw = candidate;
				break;
			}
		}
	}
	return this._absoluteUrl(raw, baseUrl);
};

FreeMagazinesSource._decode = function(text) {
	if (!text) return "";
	return String(text)
		.replace(/&#039;/g, "'")
		.replace(/&#8211;/g, "\u2013")
		.replace(/&#8212;/g, "\u2014")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&rsquo;/g, "\u2019")
		.replace(/&hellip;/g, "\u2026")
		.replace(/&nbsp;/g, " ")
		.replace(/<[^>]*>/g, "")
		.replace(/\s+/g, " ")
		.trim();
};

FreeMagazinesSource._slugToFileName = function(title) {
	var safe = String(title || "magazine")
		.replace(/[\\/:*?"<>|]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return (safe || "magazine") + ".pdf";
};

FreeMagazinesSource._normalizeUrl = function(url) {
	return String(url || "")
		.replace(/\\u0026/g, "&")
		.replace(/\\\//g, "/")
		.replace(/&amp;/g, "&")
		.replace(/[),.;]+$/g, "")
		.trim();
};

FreeMagazinesSource._parseListings = function(html) {
	var self = this;
	var results = [];
	var seen = {};
	var sourceHtml = String(html || "");
	var doc = cinder.parseHTML(sourceHtml);

	var addResult = function(link, card) {
		if (!link) return;
		var href = self._absoluteUrl(link.attr("href") || "", self.BASE_URL + "/");
		if (!href || href.indexOf(self.BASE_URL) !== 0) return;
		if (href.indexOf("/category/") >= 0 || href.indexOf("/page/") >= 0 || href.indexOf("/wp-") >= 0) return;
		if (seen[href]) return;

		var title = self._decode(link.text());
		if (!title) return;

		var cover = "";
		var description = "";
		if (card) {
			var image = card.querySelector(".post-image img, img.wp-post-image, img");
			cover = self._imageUrlFromNode(image, href);
			var summary = card.querySelector(".entry-summary, .post-excerpt, .excerpt");
			description = summary ? self._decode(summary.text()) : "";
		}
		if (!cover) {
			var rawHref = link.attr("href") || href;
			var pos = sourceHtml.indexOf(rawHref);
			if (pos >= 0) {
				var chunk = sourceHtml.substring(Math.max(0, pos - 2200), pos + 1000);
				var imgMatch = chunk.match(/(?:https?:)?\/\/freemagazines\.top\/wp-content\/uploads\/[^"'<>\s]+\.(?:webp|jpg|jpeg|png|gif)/i);
				if (imgMatch) cover = self._absoluteUrl(imgMatch[0], href);
			}
		}

		seen[href] = true;
		var coverHeaders = cover ? self._coverHeaders(href) : undefined;

		results.push({
			id: href,
			title: title,
			cover: cover,
			coverHeaders: coverHeaders,
			url: href,
			format: "pdf",
			source: self.name,
			extra: {
				articleUrl: href,
				coverHeaders: coverHeaders,
				description: description || undefined,
			},
		});
	};

	doc.querySelectorAll("article").forEach(function(card) {
		addResult(card.querySelector("h2.entry-title a, h2 a"), card);
	});

	// Preserve compatibility with older/minimal listing layouts that omit article cards.
	doc.querySelectorAll("h2 a").forEach(function(link) {
		addResult(link, null);
	});

	return results;
};

FreeMagazinesSource._metaValue = function(doc, name) {
	if (!doc || !name) return "";
	var node = doc.querySelector("meta[property='" + name + "']")
		|| doc.querySelector("meta[name='" + name + "']");
	return node ? this._decode(node.attr("content") || "") : "";
};

FreeMagazinesSource._articleMetadata = function(html, pageUrl) {
	var doc = cinder.parseHTML(html || "");
	var titleNode = doc.querySelector("h1.entry-title, article h1, h1");
	var title = titleNode ? this._decode(titleNode.text()) : this._metaValue(doc, "og:title");
	title = String(title || "")
		.replace(/\s*[|\-]\s*Free\s*Magazines(?:\.top)?\s*$/i, "")
		.trim();

	var cover = this._absoluteUrl(this._metaValue(doc, "og:image"), pageUrl);
	if (!cover) {
		cover = this._imageUrlFromNode(
			doc.querySelector("article .post-image img, article img.wp-post-image, .entry-content img"),
			pageUrl,
		);
	}

	var description = this._metaValue(doc, "og:description")
		|| this._metaValue(doc, "description");
	if (!description) {
		var summary = doc.querySelector("article .entry-summary, article .entry-content p, .entry-content p");
		description = summary ? this._decode(summary.text()) : "";
	}

	var genres = [];
	var seenGenres = {};
	doc.querySelectorAll("article a[rel='category tag'], article .cat-links a, article .entry-meta a[href*='/category/'], article .entry-footer a[href*='/category/']").forEach(function(link) {
		var genre = String(link.text ? link.text() : "").replace(/\s+/g, " ").trim();
		var key = genre.toLowerCase();
		if (genre && !seenGenres[key]) {
			seenGenres[key] = true;
			genres.push(genre);
		}
	});

	return {
		title: title,
		cover: cover,
		description: description,
		genres: genres,
	};
};

FreeMagazinesSource.getBookDetails = async function(bookId) {
	var pageUrl = this._absoluteUrl(bookId, this.BASE_URL + "/");
	if (!pageUrl) throw new Error("No magazine article URL.");
	var response = await cinder.fetch(pageUrl, {
		headers: this._headers(),
		timeout: 20000,
	});
	if (!response || response.status !== 200) {
		throw new Error("Magazine details request failed (HTTP " + (response ? response.status : 0) + ").");
	}
	var metadata = this._articleMetadata(response.data || "", pageUrl);
	return {
		id: pageUrl,
		title: metadata.title,
		cover: metadata.cover,
		coverHeaders: metadata.cover ? this._coverHeaders(pageUrl) : undefined,
		description: metadata.description,
		genres: metadata.genres,
	};
};

FreeMagazinesSource._normalizeLimeWireUrl = function(value, baseUrl) {
	var raw = String(value || "").trim();
	if (!raw) return "";
	raw = this._decode(raw)
		.replace(/\\\//g, "/")
		.replace(/&amp;/gi, "&")
		.replace(/^\/\//, "https://");
	if (/^https?%3a%2f%2f/i.test(raw)) {
		try { raw = decodeURIComponent(raw); } catch (err) {}
	}
	if (baseUrl && raw.indexOf("download_gateway=") >= 0) {
		try { raw = cinder.resolveUrl(raw, baseUrl); } catch (err2) {}
	}
	var gatewayMatch = raw.match(/[?&]download_gateway=([^&#]+)/i);
	if (gatewayMatch) {
		var encoded = gatewayMatch[1] || "";
		try { encoded = decodeURIComponent(encoded); } catch (err3) {}
		var decoded = this._decodeBase64Url(encoded);
		if (decoded) return this._normalizeLimeWireUrl(decoded, baseUrl);
	}
	var match = raw.match(/https?:\/\/(?:www\.)?limewire\.com\/d\/[A-Za-z0-9_-]+(?:#[A-Za-z0-9_-]+)?/i);
	if (!match) return "";
	return this._normalizeUrl(match[0].replace(/:\/\/www\.limewire\.com\//i, "://limewire.com/"));
};

FreeMagazinesSource._extractLimeWireUrl = function(html, baseUrl) {
	var doc = cinder.parseHTML(html || "");
	var links = doc.querySelectorAll("a[href]");
	for (var i = 0; i < links.length; i++) {
		var href = links[i].attr("href") || "";
		var found = this._normalizeLimeWireUrl(href, baseUrl);
		if (found) return found;
	}
	var text = String(html || "");
	var variants = [
		text,
		this._decode(text).replace(/\\\//g, "/"),
	];
	try { variants.push(decodeURIComponent(text)); } catch (err) {}
	for (var j = 0; j < variants.length; j++) {
		var direct = this._normalizeLimeWireUrl(variants[j], baseUrl);
		if (direct) return direct;
	}
	return "";
};

FreeMagazinesSource._extractMaskedDownloadKey = function(html) {
	var source = String(html || "");
	var doc = cinder.parseHTML(source);
	var trigger = doc.querySelector("#lw-vk-js-trigger[data-key], .lw-vk-download-btn[data-key], [data-key^='dl_key_']");
	var key = trigger ? String(trigger.attr("data-key") || "").trim() : "";
	if (!key) {
		var match = source.match(/data-key=["']([A-Za-z0-9_-]{8,256})["']/i);
		key = match ? match[1] : "";
	}
	return /^[A-Za-z0-9_-]{8,256}$/.test(key) ? key : "";
};

FreeMagazinesSource._resolveMaskedDownloadUrl = async function(pageUrl, html) {
	var key = this._extractMaskedDownloadKey(html);
	if (!key) return "";
	var response = await cinder.fetch(this.BASE_URL + "/wp-admin/admin-ajax.php", {
		method: "POST",
		headers: {
			"User-Agent": this._headers()["User-Agent"],
			"Accept": "application/json, text/javascript, */*; q=0.01",
			"Accept-Language": "en-US,en;q=0.9",
			"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
			"Origin": this.BASE_URL,
			"Referer": pageUrl,
			"X-Requested-With": "XMLHttpRequest",
		},
		body: "action=get_masked_download&download_key=" + encodeURIComponent(key),
		timeout: 20000,
	});
	if (!response || response.status !== 200) {
		cinder.warn("[FreeMagazines] Masked download request failed with status " + (response ? response.status : 0));
		return "";
	}
	try {
		var payload = JSON.parse(response.data || "{}");
		var value = payload && payload.success && payload.data
			? (typeof payload.data === "string" ? payload.data : payload.data.url)
			: "";
		return this._absoluteUrl(value, pageUrl);
	} catch (err) {
		cinder.warn("[FreeMagazines] Masked download response was not valid JSON.");
		return "";
	}
};

FreeMagazinesSource._isDirectFileUrl = function(url) {
	return /\.(?:pdf|epub|cbz|cbr)(?:[?#]|$)/i.test(String(url || ""));
};

FreeMagazinesSource._getHeader = function(headers, name) {
	var target = String(name || "").toLowerCase();
	headers = headers || {};
	for (var key in headers) {
		if (Object.prototype.hasOwnProperty.call(headers, key) && String(key).toLowerCase() === target) {
			return headers[key];
		}
	}
	return "";
};

FreeMagazinesSource._decodeBase64Url = function(value) {
	var input = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
	while (input.length % 4) input += "=";
	var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
	var output = "";
	var buffer = 0;
	var bits = 0;
	for (var i = 0; i < input.length; i++) {
		var c = chars.indexOf(input.charAt(i));
		if (c < 0) continue;
		if (c === 64) break;
		buffer = (buffer << 6) | c;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			output += String.fromCharCode((buffer >> bits) & 0xff);
		}
	}
	return output;
};

FreeMagazinesSource._extractJwtCsrfToken = function(token) {
	try {
		var parts = String(token || "").split(".");
		if (parts.length < 2) return "";
		var payload = JSON.parse(this._decodeBase64Url(parts[1]));
		return payload && payload.csrfToken ? String(payload.csrfToken) : "";
	} catch (err) {
		return "";
	}
};

FreeMagazinesSource._cookieCandidatesFromSetCookie = function(headers) {
	var raw = this._getHeader(headers, "set-cookie");
	if (!raw) return [];
	var parts = Array.isArray(raw) ? raw : [String(raw)];
	var baseCookies = {};
	var tokens = [];
	var seenTokens = {};
	var wanted = /(?:^|,\s*)((?:production_access_token|__csrf_[A-Za-z0-9_]+|__cacheId|lmwr_client_id_apilimewirecom)=([^;,\s]*))/g;
	for (var i = 0; i < parts.length; i++) {
		var text = String(parts[i] || "");
		var match;
		while ((match = wanted.exec(text))) {
			var pair = match[1];
			var eq = pair.indexOf("=");
			if (eq <= 0) continue;
			var name = pair.substring(0, eq);
			var value = pair.substring(eq + 1);
			if (!value) continue;
			if (name === "production_access_token") {
				if (!seenTokens[value]) {
					seenTokens[value] = true;
					tokens.push(value);
				}
			} else {
				baseCookies[name] = value;
			}
		}
	}
	var baseHeader = Object.keys(baseCookies).map(function(name) {
		return name + "=" + baseCookies[name];
	});
	var candidates = [];
	for (var j = 0; j < tokens.length; j++) {
		var csrfToken = this._extractJwtCsrfToken(tokens[j]);
		if (!csrfToken) continue;
		candidates.push({
			csrfToken: csrfToken,
			cookieHeader: baseHeader.concat(["production_access_token=" + tokens[j]]).join("; "),
		});
	}
	return candidates;
};

FreeMagazinesSource._cookieHeaderFromSetCookie = function(headers) {
	var candidates = this._cookieCandidatesFromSetCookie(headers);
	if (candidates.length) return candidates[candidates.length - 1].cookieHeader;
	var raw = this._getHeader(headers, "set-cookie");
	if (!raw) return "";
	var parts = Array.isArray(raw) ? raw : [String(raw)];
	var cookies = {};
	var wanted = /(?:^|,\s*)((?:production_access_token|__csrf_[A-Za-z0-9_]+|__cacheId|lmwr_client_id_apilimewirecom)=([^;,\s]*))/g;
	for (var i = 0; i < parts.length; i++) {
		var text = String(parts[i] || "");
		var match;
		while ((match = wanted.exec(text))) {
			var pair = match[1];
			var eq = pair.indexOf("=");
			if (eq <= 0) continue;
			var name = pair.substring(0, eq);
			var value = pair.substring(eq + 1);
			if (value) cookies[name] = value;
		}
	}
	return Object.keys(cookies)
		.map(function(name) { return name + "=" + cookies[name]; })
		.join("; ");
};

FreeMagazinesSource._decodeRouteHtml = function(html) {
	return String(html || "")
		.replace(/\\"/g, '"')
		.replace(/\\u0026/g, "&")
		.replace(/\\\//g, "/");
};

FreeMagazinesSource._sleep = function(ms) {
	return new Promise(function(resolve) {
		setTimeout(resolve, ms);
	});
};

FreeMagazinesSource._isLimeWireUnavailable = function(html) {
	var decoded = this._decodeRouteHtml(html);
	return decoded.indexOf("Content not found | LimeWire") >= 0
		|| decoded.indexOf('"ok",false') >= 0 && decoded.indexOf('"sharingBucketContentData"') >= 0;
};

FreeMagazinesSource._extractRouteToken = function(decoded, key) {
	var re = new RegExp('"' + key + '","([^"]+)"', "g");
	var match;
	var token = "";
	while ((match = re.exec(decoded))) {
		var value = match[1] || "";
		if (/^[A-Za-z0-9_\-+/]{30,}={0,2}$/.test(value)) {
			token = value;
		}
	}
	return token;
};

FreeMagazinesSource._extractLimeWireDownloadRequest = function(html) {
	var decoded = this._decodeRouteHtml(html);
	var uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
	var pair = decoded.match(new RegExp('"(' + uuid + ')","originalSharingBucketId","(' + uuid + ')"'));
	var selfCsrf = this._extractRouteToken(decoded, "selfCsrf") || this._extractRouteToken(decoded, "csrfToken");
	var fileName = decoded.match(/"name","([^"]+\.(?:pdf|epub|cbz|cbr))"/i);
	if (!pair || !selfCsrf) return null;
	return {
		contentItemId: pair[1],
		bucketId: pair[2],
		csrfToken: selfCsrf,
		fileName: fileName ? this._decode(fileName[1]) : "",
	};
};

FreeMagazinesSource._resolveLimeWireApi = async function(limeUrl, request, cookieHeader) {
	if (!request || !request.bucketId || !request.contentItemId || !request.csrfToken) return "";
	var apiUrl = "https://api.limewire.com/sharing/download/" + request.bucketId;
	var body = JSON.stringify({
		contentItems: [{ id: request.contentItemId }],
	});
	var headers = {
		"User-Agent": this._headers()["User-Agent"],
		"Accept": "application/json, text/plain, */*",
		"Content-Type": "application/json",
		"Origin": "https://limewire.com",
		"Referer": String(limeUrl || "").replace(/#.*$/, ""),
		"x-csrf-token": request.csrfToken,
	};
	if (cookieHeader) headers.Cookie = cookieHeader;

	var self = this;
	var fetchDownload = async function() {
		return cinder.fetch(apiUrl, {
			method: "POST",
			headers: headers,
			body: body,
			timeout: 20000,
		});
	};

	var response = await fetchDownload();
	var responseText = response && response.data ? String(response.data) : "";
	if (response && response.status === 403 && /csrf_invalid|created within this request/i.test(responseText)) {
		cinder.log("[FreeMagazines] LimeWire token is fresh; retrying after a short settle.");
		await self._sleep(2600);
		response = await fetchDownload();
	}
	if (!response || response.status !== 200) {
		cinder.warn("[FreeMagazines] LimeWire API resolve failed with status " + (response ? response.status : 0));
		return "";
	}
	return this._pickDownloadUrl(response.data || "");
};

FreeMagazinesSource._findUrls = function(value, out) {
	if (value === null || value === undefined) return;
	if (typeof value === "string") {
		var re = /https?:\/\/[^"'\s\\<>]+/g;
		var m;
		while ((m = re.exec(value))) out.push(this._normalizeUrl(m[0]));
		return;
	}
	if (Array.isArray(value)) {
		for (var i = 0; i < value.length; i++) this._findUrls(value[i], out);
		return;
	}
	if (typeof value === "object") {
		for (var key in value) {
			if (Object.prototype.hasOwnProperty.call(value, key)) {
				this._findUrls(value[key], out);
			}
		}
	}
};

FreeMagazinesSource._pickDownloadUrl = function(capturedData) {
	var payload = capturedData;
	try {
		payload = JSON.parse(capturedData);
	} catch (err) {}

	var body = payload && payload.body ? payload.body : payload;
	try {
		body = typeof body === "string" ? JSON.parse(body) : body;
	} catch (err2) {}

	var urls = [];
	this._findUrls(body, urls);
	if (payload && payload.url) this._findUrls(payload.url, urls);

	var filtered = urls.filter(function(url) {
		var lower = String(url || "").toLowerCase();
		if (!lower) return false;
		if (lower.indexOf("api.limewire.com/sharing/download/") >= 0) return false;
		if (lower.indexOf("limewire.com/d/") >= 0) return false;
		if (lower.indexOf("strg.com/limewire/") >= 0) return false;
		if (lower.indexOf("limewire.com/") >= 0 && lower.indexOf(".pdf") < 0) return false;
		return true;
	});

	var pdf = filtered.find(function(url) {
		return String(url).toLowerCase().indexOf(".pdf") >= 0;
	});
	return pdf || filtered[0] || "";
};

FreeMagazinesSource.search = async function(query, page) {
	try {
		var url = this.BASE_URL + "/?s=" + encodeURIComponent(query || "");
		var response = await cinder.fetch(url, {
			headers: this._headers(),
			timeout: 20000,
		});
		if (!response || response.status !== 200) return [];
		return this._parseListings(response.data || "");
	} catch (err) {
		cinder.warn("[FreeMagazines] search failed: " + (err && err.message ? err.message : String(err)));
		return [];
	}
};

FreeMagazinesSource.getDiscoverSections = async function() {
	return this.CATEGORIES.map(function(category) {
		return { id: category.id, title: category.title, icon: "\uD83D\uDCF0" };
	});
};

FreeMagazinesSource.getDiscoverItems = async function(sectionId, page) {
	var p = (page || 0) + 1;
	try {
		var url = p === 1
			? this.BASE_URL + "/category/" + sectionId + "/"
			: this.BASE_URL + "/category/" + sectionId + "/page/" + p + "/";
		var response = await cinder.fetch(url, {
			headers: this._headers(),
			timeout: 20000,
		});
		if (!response || response.status !== 200) return [];
		return this._parseListings(response.data || "");
	} catch (err) {
		cinder.warn("[FreeMagazines] discover failed: " + (err && err.message ? err.message : String(err)));
		return [];
	}
};

FreeMagazinesSource.resolve = async function(item) {
	var pageUrl = (item && item.extra && item.extra.articleUrl) || (item && item.url) || "";
	if (!pageUrl) throw new Error("No article URL.");

	cinder.log("[FreeMagazines] Resolving article: " + pageUrl);
	var article = await cinder.fetch(pageUrl, {
		headers: this._headers(),
		timeout: 20000,
	});

	var html = article && article.data ? article.data : "";
	var downloadUrl = this._extractLimeWireUrl(html, pageUrl);
	if (!downloadUrl) {
		downloadUrl = await this._resolveMaskedDownloadUrl(pageUrl, html);
	}

	if (!downloadUrl) {
		cinder.log("[FreeMagazines] Download data not in static HTML; trying browser-rendered article page.");
		var browserArticle = await cinder.fetchBrowser(pageUrl, {
			headers: Object.assign({}, this._headers(), {
				"X-Cinder-Suppress-Interactive": "1",
				"X-Cinder-Min-Wait-Ms": "3000",
				"X-Cinder-Max-Wait-Ms": "10000",
				"X-Cinder-Wake-Page": "1",
			}),
		});
		html = browserArticle && browserArticle.data ? browserArticle.data : "";
		downloadUrl = this._extractLimeWireUrl(html, pageUrl);
		if (!downloadUrl) {
			downloadUrl = await this._resolveMaskedDownloadUrl(pageUrl, html);
		}
	}

	if (!downloadUrl) throw new Error("No download link found on the magazine page.");

	var fileName = this._slugToFileName(item && item.title);
	var limeUrl = this._normalizeLimeWireUrl(downloadUrl, pageUrl);
	if (!limeUrl && this._isDirectFileUrl(downloadUrl)) {
		return {
			url: downloadUrl,
			fileName: fileName,
			headers: this._coverHeaders(pageUrl),
		};
	}
	if (!limeUrl) {
		return {
			url: downloadUrl,
			fileName: fileName,
			headers: Object.assign({}, this._coverHeaders(pageUrl), {
				"X-Cinder-Expect-Interstitial": "1",
			}),
			downloadRequest: {
				method: "GET",
				useBrowser: true,
				browserClickDownload: true,
				browserCaptureBlob: true,
				browserMaxWaitMs: 90000,
			},
		};
	}

	cinder.log("[FreeMagazines] Resolving LimeWire route data: " + limeUrl);
	var limePage = await cinder.fetch(limeUrl, {
		headers: {
			"User-Agent": this._headers()["User-Agent"],
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
			"Referer": this.BASE_URL + "/",
		},
		timeout: 20000,
	});
	var limeHtml = limePage && limePage.data ? limePage.data : "";
	if (this._isLimeWireUnavailable(limeHtml)) {
		throw new Error("The magazine host link is no longer available.");
	}

	cinder.log("[FreeMagazines] Using browser click capture for LimeWire download: " + limeUrl);
	return {
		url: limeUrl,
		fileName: fileName,
		headers: {
			"Referer": this.BASE_URL + "/",
			"User-Agent": this._headers()["User-Agent"],
			"X-Cinder-Expect-Interstitial": "1",
		},
		downloadRequest: {
			method: "GET",
			useBrowser: true,
			browserClickDownload: true,
			browserCaptureBlob: true,
			browserIgnoreNativeDownloadUrl: true,
			browserMaxWaitMs: 90000,
		},
	};
};

__cinderExport = FreeMagazinesSource;
