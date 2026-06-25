var ElScioneSource = {};

ElScioneSource.id = "elscione";
ElScioneSource.name = "ElScione Server";
ElScioneSource.version = "0.1.0-cinder";
ElScioneSource.icon = "ES";
ElScioneSource.description = "Search ElScione's h5ai ebook and manga server for EPUB, PDF, CBZ, and CBR files.";
ElScioneSource.contentType = "books";
ElScioneSource.contentTypes = ["ebook", "manga", "webnovel"];
ElScioneSource.contentSubtypes = ["lightNovel", "webFiction", "manga"];
ElScioneSource.capabilities = {
    search: true,
    discover: false,
    download: false,
    resolve: true,
    searchDownloads: true,
    manga: false,
};

ElScioneSource.BASE_URL = "https://server.elscione.com";
ElScioneSource.MAX_RESULTS = 50;
ElScioneSource.MAX_FOLDER_CANDIDATES = 14;
ElScioneSource.MAX_DIRECTORY_FETCHES = 22;
ElScioneSource.MAX_FOLDER_DEPTH = 3;
ElScioneSource.CACHE_TTL_MS = 2 * 60 * 1000;
ElScioneSource.SUPPORTED_EXTENSIONS = {
    epub: true,
    pdf: true,
    cbz: true,
    cbr: true,
};
ElScioneSource.STOP_WORDS = {
    a: true,
    an: true,
    and: true,
    at: true,
    book: true,
    for: true,
    in: true,
    novel: true,
    novels: true,
    of: true,
    omnibus: true,
    the: true,
    to: true,
    vol: true,
    volume: true,
};
ElScioneSource.ROOTS = [
    {
        id: "official-light-novels",
        title: "Officially Translated Light Novels",
        href: "/Officially%20Translated%20Light%20Novels/",
        contentType: "ebook",
    },
    {
        id: "lnwncentral",
        title: "LNWNCentral Dump",
        href: "/LNWNCentral%20Dump/",
        contentType: "webnovel",
    },
    {
        id: "manga",
        title: "Manga",
        href: "/Manga/",
        contentType: "manga",
    },
    {
        id: "books",
        title: "Books",
        href: "/Books/",
        contentType: "ebook",
    },
    {
        id: "tmw-ebooks",
        title: "TMW eBook Collection",
        href: "/TMW%20eBook%20Collection/",
        contentType: "ebook",
        fallback: true,
    },
    {
        id: "untranslated-light-novels",
        title: "Officially Untranslated Light Novels",
        href: "/%E3%83%A9%E3%82%A4%E3%83%88%E3%83%8E%E3%83%99%E3%83%AB%20-%20Officially%20Untranslated%20Light%20Novels/",
        contentType: "ebook",
        fallback: true,
    },
];
ElScioneSource._listingCache = {};

ElScioneSource._headers = function(referer) {
    return {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/json;charset=utf-8",
        "Origin": this.BASE_URL,
        "Referer": referer || this.BASE_URL + "/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
    };
};

ElScioneSource._downloadHeaders = function(referer) {
    return {
        "User-Agent": this._headers()["User-Agent"],
        "Accept": "application/epub+zip,application/pdf,application/octet-stream,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": referer || this.BASE_URL + "/",
    };
};

ElScioneSource._decode = function(text) {
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
        .replace(/&nbsp;/g, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

ElScioneSource._safeDecodeUri = function(text) {
    var value = String(text || "");
    try {
        return decodeURIComponent(value);
    } catch (_) {
        return value;
    }
};

ElScioneSource._normalizeText = function(text) {
    return this._safeDecodeUri(this._decode(text))
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

ElScioneSource._tokens = function(query) {
    var words = this._normalizeText(query).split(/\s+/);
    var tokens = [];
    var seen = {};
    for (var i = 0; i < words.length; i++) {
        var word = words[i];
        if (!word || seen[word]) continue;
        if (word.length <= 1 && !/^\d+$/.test(word)) continue;
        if (this.STOP_WORDS[word] && words.length > 2) continue;
        seen[word] = true;
        tokens.push(word);
    }
    return tokens;
};

ElScioneSource._slug = function(text) {
    return this._normalizeText(text)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "elscione";
};

ElScioneSource._hash = function(text) {
    var hash = 5381;
    var value = String(text || "");
    for (var i = 0; i < value.length; i++) {
        hash = ((hash << 5) + hash) + value.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
};

ElScioneSource._basename = function(href) {
    var clean = String(href || "").split(/[?#]/)[0].replace(/\/+$/, "");
    var index = clean.lastIndexOf("/");
    return this._safeDecodeUri(index >= 0 ? clean.slice(index + 1) : clean);
};

ElScioneSource._dirname = function(href) {
    var clean = String(href || "").split(/[?#]/)[0];
    if (/\/$/.test(clean)) return clean;
    var index = clean.lastIndexOf("/");
    return index >= 0 ? clean.slice(0, index + 1) : "/";
};

ElScioneSource._extension = function(href) {
    var clean = this._basename(href).toLowerCase();
    var match = clean.match(/\.([a-z0-9]{2,5})$/);
    return match ? match[1] : "";
};

ElScioneSource._stripExtension = function(name) {
    return String(name || "").replace(/\.(epub|pdf|cbz|cbr)$/i, "").replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
};

ElScioneSource._isFolder = function(item) {
    return !!(item && item.href && /\/$/.test(String(item.href).split(/[?#]/)[0]));
};

ElScioneSource._isSupportedFile = function(item) {
    if (!item || !item.href || this._isFolder(item)) return false;
    return !!this.SUPPORTED_EXTENSIONS[this._extension(item.href)];
};

ElScioneSource._score = function(name, tokens) {
    if (!tokens || !tokens.length) return 0;
    var normalized = this._normalizeText(name);
    if (!normalized) return 0;
    var score = 0;
    for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        var index = normalized.indexOf(token);
        if (index < 0) return 0;
        score += index === 0 ? 12 : 8;
        if (new RegExp("(?:^| )" + token.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&") + "(?: |$)").test(normalized)) {
            score += 4;
        }
    }
    if (normalized === tokens.join(" ")) score += 40;
    if (normalized.indexOf(tokens.join(" ")) >= 0) score += 15;
    return score;
};

ElScioneSource._safePathForUrl = function(href) {
    var value = String(href || "");
    if (/%[0-9a-f]{2}/i.test(value)) {
        return value.replace(/ /g, "%20").replace(/#/g, "%23");
    }
    return encodeURI(value).replace(/#/g, "%23");
};

ElScioneSource._absoluteUrl = function(href) {
    var value = String(href || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.indexOf("//") === 0) return "https:" + value;
    if (value.charAt(0) !== "/") value = "/" + value;
    return this.BASE_URL + this._safePathForUrl(value);
};

ElScioneSource._formatSize = function(size) {
    var bytes = Number(size || 0);
    if (!isFinite(bytes) || bytes <= 0) return "";
    var units = ["B", "KB", "MB", "GB"];
    var unit = 0;
    while (bytes >= 1024 && unit < units.length - 1) {
        bytes = bytes / 1024;
        unit++;
    }
    return (unit === 0 ? String(Math.round(bytes)) : bytes.toFixed(bytes >= 10 ? 1 : 2)) + " " + units[unit];
};

ElScioneSource._extractPayloadItems = function(payload) {
    var data = payload;
    if (typeof data === "string") {
        var trimmed = data.trim();
        if (!trimmed || trimmed.charAt(0) === "<") return [];
        try {
            data = JSON.parse(trimmed);
        } catch (_) {
            return [];
        }
    }

    var visit = function(value, depth) {
        if (!value || depth > 5) return [];
        if (Array.isArray(value)) {
            var hasHref = false;
            for (var i = 0; i < value.length; i++) {
                if (value[i] && typeof value[i] === "object" && value[i].href) {
                    hasHref = true;
                    break;
                }
            }
            if (hasHref) return value;
            return [];
        }
        if (typeof value === "object") {
            if (Array.isArray(value.items)) {
                var direct = visit(value.items, depth + 1);
                if (direct.length) return direct;
            }
            for (var key in value) {
                if (!Object.prototype.hasOwnProperty.call(value, key) || key === "options" || key === "types" || key === "theme" || key === "langs") continue;
                var nested = visit(value[key], depth + 1);
                if (nested.length) return nested;
            }
        }
        return [];
    };

    return visit(data, 0).filter(function(item) {
        return item && item.href;
    });
};

ElScioneSource._normalizeHref = function(href) {
    var value = String(href || "").trim();
    if (!value) return "/";
    if (/^https?:\/\//i.test(value)) {
        value = value.replace(/^https?:\/\/[^/]+/i, "");
    }
    if (value.charAt(0) !== "/") value = "/" + value;
    return value;
};

ElScioneSource._samePath = function(a, b) {
    return this._safeDecodeUri(this._normalizeHref(a)).replace(/\/+$/, "") === this._safeDecodeUri(this._normalizeHref(b)).replace(/\/+$/, "");
};

ElScioneSource._immediateChildren = function(items, href) {
    var dirHref = this._normalizeHref(href);
    var decodedDir = this._safeDecodeUri(dirHref);
    if (decodedDir.charAt(decodedDir.length - 1) !== "/") decodedDir += "/";

    var children = [];
    var seen = {};
    for (var i = 0; i < items.length; i++) {
        var rawHref = this._normalizeHref(items[i].href);
        var decodedHref = this._safeDecodeUri(rawHref);
        if (!decodedHref || decodedHref === decodedDir.replace(/\/$/, "")) continue;
        if (decodedHref.indexOf(decodedDir) !== 0) continue;
        var rest = decodedHref.slice(decodedDir.length);
        if (!rest) continue;
        var comparable = rest.replace(/\/$/, "");
        if (comparable.indexOf("/") >= 0) continue;
        if (seen[rawHref]) continue;
        seen[rawHref] = true;
        children.push(items[i]);
    }
    return children;
};

ElScioneSource._requestListing = async function(href) {
    var normalized = this._normalizeHref(href);
    var now = Date.now ? Date.now() : new Date().getTime();
    var cached = this._listingCache[normalized];
    if (cached && now - cached.time < this.CACHE_TTL_MS) return cached.items;

    var response = await cinder.fetch(this.BASE_URL + "/", {
        method: "POST",
        headers: this._headers(this.BASE_URL + this._safePathForUrl(normalized)),
        body: {
            action: "get",
            items: {
                href: normalized,
                what: 1,
            },
        },
        timeout: 25000,
    });

    var status = response && response.status ? Number(response.status) : 0;
    var data = response ? response.data : null;
    var text = typeof data === "string" ? data : "";
    if (status < 200 || status >= 300) {
        throw new Error("ElScione listing failed (HTTP " + status + ")");
    }
    if (text && /cf-challenge|challenge-platform|just a moment|cloudflare/i.test(text)) {
        throw new Error("ElScione is presenting a browser challenge. Try again after opening the source in a browser session.");
    }

    var allItems = this._extractPayloadItems(data);
    var children = this._immediateChildren(allItems, normalized);
    this._listingCache[normalized] = { time: now, items: children };
    return children;
};

ElScioneSource._resultFromFile = function(item, root, matchedFolder) {
    var href = this._normalizeHref(item.href);
    var format = this._extension(href);
    var fileName = this._basename(href);
    var title = this._stripExtension(fileName) || fileName;
    var parentHref = this._dirname(href);
    var folderName = matchedFolder ? this._basename(matchedFolder.href) : "";
    var displayTitle = title;
    if (folderName && this._normalizeText(title).indexOf(this._normalizeText(folderName)) < 0) {
        displayTitle = folderName + " - " + title;
    }

    return {
        id: "elscione-" + this._hash(href),
        title: displayTitle,
        author: undefined,
        url: this._absoluteUrl(href),
        source: "ElScione Server",
        format: format,
        size: this._formatSize(item.size),
        extra: {
            href: href,
            parentHref: parentHref,
            rootId: root && root.id,
            rootTitle: root && root.title,
            contentType: root && root.contentType,
            fileName: fileName,
        },
    };
};

ElScioneSource._addResult = function(results, seen, item, root, matchedFolder) {
    if (!this._isSupportedFile(item)) return;
    var href = this._normalizeHref(item.href);
    if (seen[href]) return;
    seen[href] = true;
    results.push(this._resultFromFile(item, root, matchedFolder));
};

ElScioneSource._collectFromFolder = async function(folder, root, results, seen, budget, depth) {
    if (!folder || !folder.href || results.length >= this.MAX_RESULTS || budget.remaining <= 0) return;
    budget.remaining--;
    var children = await this._requestListing(folder.href);
    var subfolders = [];

    for (var i = 0; i < children.length && results.length < this.MAX_RESULTS; i++) {
        var child = children[i];
        if (this._isSupportedFile(child)) {
            this._addResult(results, seen, child, root, folder);
        } else if (this._isFolder(child)) {
            subfolders.push(child);
        }
    }

    if (depth >= this.MAX_FOLDER_DEPTH) return;
    subfolders.sort(function(a, b) {
        return String(a.href || "").localeCompare(String(b.href || ""));
    });
    for (var j = 0; j < subfolders.length && results.length < this.MAX_RESULTS && budget.remaining > 0; j++) {
        await this._collectFromFolder(subfolders[j], root, results, seen, budget, depth + 1);
    }
};

ElScioneSource._searchRoot = async function(root, tokens, results, seen, budget) {
    if (results.length >= this.MAX_RESULTS || budget.remaining <= 0) return;
    budget.remaining--;
    var children = await this._requestListing(root.href);
    var folders = [];

    for (var i = 0; i < children.length; i++) {
        var item = children[i];
        var name = this._basename(item.href);
        var score = this._score(name, tokens);
        if (!score) continue;
        if (this._isSupportedFile(item)) {
            this._addResult(results, seen, item, root, null);
        } else if (this._isFolder(item)) {
            folders.push({ item: item, score: score });
        }
    }

    folders.sort(function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.item.href || "").localeCompare(String(b.item.href || ""));
    });

    var limit = Math.min(folders.length, this.MAX_FOLDER_CANDIDATES);
    for (var j = 0; j < limit && results.length < this.MAX_RESULTS && budget.remaining > 0; j++) {
        await this._collectFromFolder(folders[j].item, root, results, seen, budget, 0);
    }
};

ElScioneSource.search = async function(query, page) {
    if (page && page > 0) return [];
    var text = String(query || "").trim();
    if (!text) return [];
    var tokens = this._tokens(text);
    if (!tokens.length) return [];

    var results = [];
    var seen = {};
    var budget = { remaining: this.MAX_DIRECTORY_FETCHES };
    var roots = this.ROOTS.filter(function(root) { return !root.fallback; });
    var fallbackRoots = this.ROOTS.filter(function(root) { return !!root.fallback; });

    for (var i = 0; i < roots.length && results.length < this.MAX_RESULTS && budget.remaining > 0; i++) {
        try {
            await this._searchRoot(roots[i], tokens, results, seen, budget);
        } catch (err) {
            if (typeof cinder !== "undefined" && cinder.warn) {
                cinder.warn("[ElScione] root search failed for " + roots[i].id + ": " + (err && err.message ? err.message : String(err)));
            }
        }
    }

    if (results.length < 8 && tokens.join(" ").length >= 4) {
        for (var j = 0; j < fallbackRoots.length && results.length < this.MAX_RESULTS && budget.remaining > 0; j++) {
            try {
                await this._searchRoot(fallbackRoots[j], tokens, results, seen, budget);
            } catch (err2) {
                if (typeof cinder !== "undefined" && cinder.warn) {
                    cinder.warn("[ElScione] fallback search failed for " + fallbackRoots[j].id + ": " + (err2 && err2.message ? err2.message : String(err2)));
                }
            }
        }
    }

    return results.slice(0, this.MAX_RESULTS);
};

ElScioneSource.searchDownloads = async function(bookOrQuery, page) {
    var query = "";
    if (typeof bookOrQuery === "string") {
        query = bookOrQuery;
    } else if (bookOrQuery) {
        query = [bookOrQuery.title, bookOrQuery.author].filter(Boolean).join(" ");
    }
    return this.search(query, page || 0);
};

ElScioneSource.resolve = async function(item) {
    if (!item) throw new Error("ElScione item is missing.");
    var href = item.extra && item.extra.href ? String(item.extra.href) : String(item.url || "");
    var url = /^https?:\/\//i.test(href) ? href : this._absoluteUrl(href);
    var format = this._extension(href || url);
    if (!this.SUPPORTED_EXTENSIONS[format]) {
        throw new Error("ElScione result is not a supported reader file.");
    }
    var parentHref = item.extra && item.extra.parentHref ? String(item.extra.parentHref) : this._dirname(href);
    var fileName = item.extra && item.extra.fileName ? String(item.extra.fileName) : this._basename(href || url);
    return {
        url: url,
        fileName: fileName || (this._slug(item.title || "elscione") + "." + format),
        headers: this._downloadHeaders(this._absoluteUrl(parentHref || "/")),
    };
};

__cinderExport = ElScioneSource;
