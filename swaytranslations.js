var SwayTranslationsSource = {};

SwayTranslationsSource.id = "swaytranslations";
SwayTranslationsSource.name = "Sway Translations";
SwayTranslationsSource.version = "0.1.0-cinder";
SwayTranslationsSource.icon = "ST";
SwayTranslationsSource.description = "Search Sway Translations WordPress pages for EPUB/PDF downloads.";
SwayTranslationsSource.contentType = "books";
SwayTranslationsSource.contentTypes = ["ebook", "webnovel"];
SwayTranslationsSource.contentSubtypes = ["lightNovel", "webFiction"];
SwayTranslationsSource.capabilities = {
    search: true,
    discover: true,
    download: false,
    resolve: true,
    searchDownloads: true,
    manga: false,
};

SwayTranslationsSource.BASE_URL = "https://swaytranslations.wordpress.com";
SwayTranslationsSource.CACHE_TTL_MS = 10 * 60 * 1000;
SwayTranslationsSource.MAX_RESULTS = 80;
SwayTranslationsSource.MAX_PAGE_FETCHES = 28;
SwayTranslationsSource.STATIC_PAGES = [
    { path: "/perfect-crime-club/", title: "Perfect Crime Club", author: "Migiwa Korumono" },
    { path: "/discowednesdayyy/", title: "Disco Wednesdayyy", author: "Maijo Otaro" },
    { path: "/tsukumojuuku/", title: "Tsukumojuuku", author: "Maijo Otaro" },
    { path: "/love-love-love-you-i-love-you/", title: "Love Love Love You I Love You", author: "Maijo Otaro" },
    { path: "/speedboy/", title: "SPEEDBOY!", author: "Maijo Otaro" },
    { path: "/kagami-saga/", title: "Kagami Saga", author: "Satou Yuuya" },
    { path: "/zaregoto-series/", title: "Zaregoto Series", author: "Nisio Isin" },
    { path: "/sekai-series/", title: "Sekai Series", author: "Nisio Isin" },
    { path: "/short-stories/", title: "Nisio Short Stories Collection Book", author: "Nisio Isin" },
    { path: "/miscellaneous/", title: "Miscellaneous", author: "" },
];
SwayTranslationsSource.STOP_WORDS = {
    a: true,
    an: true,
    and: true,
    book: true,
    club: true,
    for: true,
    in: true,
    novel: true,
    novels: true,
    of: true,
    series: true,
    the: true,
    to: true,
    volume: true,
    vol: true,
};
SwayTranslationsSource._indexCache = null;

SwayTranslationsSource._headers = function(referer) {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": referer || this.BASE_URL + "/",
    };
};

SwayTranslationsSource._downloadHeaders = function(referer) {
    return {
        "User-Agent": this._headers()["User-Agent"],
        "Accept": "application/epub+zip,application/pdf,application/octet-stream,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": referer || this.BASE_URL + "/",
    };
};

SwayTranslationsSource._decode = function(text) {
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
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

SwayTranslationsSource._stripTags = function(html) {
    return this._decode(String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "));
};

SwayTranslationsSource._normalizeText = function(text) {
    return this._decode(text)
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

SwayTranslationsSource._tokens = function(query) {
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

SwayTranslationsSource._slug = function(text) {
    return this._normalizeText(text)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 90) || "swaytranslations";
};

SwayTranslationsSource._hash = function(text) {
    var value = String(text || "");
    var hash = 5381;
    for (var i = 0; i < value.length; i++) {
        hash = ((hash << 5) + hash) + value.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
};

SwayTranslationsSource._absoluteUrl = function(url) {
    var value = this._decode(url || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.indexOf("//") === 0) return "https:" + value;
    if (value.charAt(0) === "/") return this.BASE_URL + value;
    return this.BASE_URL + "/" + value.replace(/^\/+/, "");
};

SwayTranslationsSource._fetchHtml = async function(url, referer) {
    var response = await cinder.fetch(url, {
        headers: this._headers(referer || this.BASE_URL + "/"),
        timeout: 25000,
    });
    if (!response || response.status < 200 || response.status >= 300 || response.data == null) {
        throw new Error("Sway Translations request failed: " + url);
    }
    return String(response.data || "");
};

SwayTranslationsSource._extractEntryTitle = function(html) {
    var match = String(html || "").match(/<h1\b[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)
        || String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    var title = match && match[1] ? this._stripTags(match[1]) : "";
    return title.replace(/\s+[-|]\s+Sway Translations\s*$/i, "").trim();
};

SwayTranslationsSource._extractEntryContent = function(html) {
    var match = String(html || "").match(/<div\b[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<!--\s*\.entry-content\s*-->/i);
    return match && match[1] ? match[1] : String(html || "");
};

SwayTranslationsSource._extractImageBefore = function(fragment) {
    var images = [];
    var regex = /<img\b[^>]*(?:data-orig-file|src)=["']([^"']+)["'][^>]*>/gi;
    var match;
    while ((match = regex.exec(String(fragment || ""))) !== null) {
        var url = this._absoluteUrl(match[1]);
        if (url && url.indexOf("gravatar.com") === -1 && url.indexOf("wpcom-smileys") === -1) images.push(url);
    }
    return images.length ? images[images.length - 1] : "";
};

SwayTranslationsSource._extractAnchors = function(html) {
    var anchors = [];
    var regex = /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
    var match;
    while ((match = regex.exec(String(html || ""))) !== null) {
        anchors.push({
            index: match.index,
            href: this._absoluteUrl(match[2]),
            text: this._stripTags(match[4]),
            attrs: String((match[1] || "") + " " + (match[3] || "")),
            html: match[0],
        });
    }
    return anchors;
};

SwayTranslationsSource._canonicalPageUrl = function(url) {
    var absolute = this._absoluteUrl(url).split("#")[0].split("?")[0];
    if (absolute.charAt(absolute.length - 1) !== "/") absolute += "/";
    return absolute;
};

SwayTranslationsSource._isSameSitePage = function(url) {
    var absolute = this._canonicalPageUrl(url);
    if (absolute.indexOf(this.BASE_URL + "/") !== 0) return false;
    var path = absolute.slice(this.BASE_URL.length);
    if (!path || path === "/") return false;
    if (/^\/(?:category|tag|author|wp-content|comments|feed|page)\//i.test(path)) return false;
    if (/^\/\d{4}\//.test(path)) return false;
    if (/\.(?:jpg|jpeg|png|gif|webp|css|js|xml)$/i.test(path)) return false;
    if (/\/(?:about|information|nisio-tl-info)\/$/i.test(path)) return false;
    return true;
};

SwayTranslationsSource._staticMetaForUrl = function(url) {
    var canonical = this._canonicalPageUrl(url);
    for (var i = 0; i < this.STATIC_PAGES.length; i++) {
        var itemUrl = this.BASE_URL + this.STATIC_PAGES[i].path.replace(/^\/+/, "");
        if (this._canonicalPageUrl(itemUrl) === canonical) return this.STATIC_PAGES[i];
    }
    return null;
};

SwayTranslationsSource._discoverPages = async function() {
    var links = {};
    for (var i = 0; i < this.STATIC_PAGES.length; i++) {
        var staticPage = this.STATIC_PAGES[i];
        links[this._canonicalPageUrl(staticPage.path)] = {
            url: this._canonicalPageUrl(staticPage.path),
            title: staticPage.title,
            author: staticPage.author || "",
            static: true,
        };
    }

    try {
        var home = await this._fetchHtml(this.BASE_URL + "/", this.BASE_URL + "/");
        var anchors = this._extractAnchors(home);
        for (var j = 0; j < anchors.length; j++) {
            var anchor = anchors[j];
            if (!this._isSameSitePage(anchor.href)) continue;
            var url = this._canonicalPageUrl(anchor.href);
            var title = anchor.text || "";
            if (!title || /^(?:home|continue reading|comments|like|twitter|discord)$/i.test(title)) continue;
            if (!links[url]) {
                links[url] = { url: url, title: title, author: "", static: false };
            }
        }
    } catch (err) {
        if (typeof cinder !== "undefined" && cinder.warn) {
            cinder.warn("[SwayTranslations] Home page discovery failed: " + (err && err.message ? err.message : String(err)));
        }
    }

    var pages = [];
    for (var key in links) {
        if (Object.prototype.hasOwnProperty.call(links, key)) pages.push(links[key]);
    }
    pages.sort(function(a, b) {
        if (a.static !== b.static) return a.static ? -1 : 1;
        return a.url.localeCompare(b.url);
    });
    return pages.slice(0, this.MAX_PAGE_FETCHES);
};

SwayTranslationsSource._formatFromLabel = function(label, href) {
    var value = String((label || "") + " " + (href || "")).toLowerCase();
    if (/\bepub\b|\.epub(?:[?#]|$)/.test(value)) return "epub";
    if (/\bpdf\b|\.pdf(?:[?#]|$)/.test(value)) return "pdf";
    return "";
};

SwayTranslationsSource._driveId = function(url) {
    var value = String(url || "");
    var match = value.match(/\/file\/d\/([^/?#]+)/i) || value.match(/[?&]id=([^&#]+)/i);
    return match && match[1] ? decodeURIComponent(match[1]) : "";
};

SwayTranslationsSource._driveDownloadUrl = function(fileId) {
    return "https://drive.usercontent.google.com/uc?id=" + encodeURIComponent(fileId) + "&export=download";
};

SwayTranslationsSource._isDownloadLink = function(anchor) {
    if (!anchor || !anchor.href) return false;
    var label = anchor.text || "";
    var format = this._formatFromLabel(label, anchor.href);
    if (!format) return false;
    if (/drive\.google\.com\/file\/d\//i.test(anchor.href)) return true;
    if (/drive\.usercontent\.google\.com\//i.test(anchor.href)) return true;
    if (/\.(?:epub|pdf)(?:[?#]|$)/i.test(anchor.href)) return true;
    return false;
};

SwayTranslationsSource._contextTitle = function(beforeHtml) {
    var before = String(beforeHtml || "");
    var candidates = [];
    var regexes = [
        /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi,
        /<p\b[^>]*>([\s\S]*?)<\/p>/gi,
    ];
    for (var r = 0; r < regexes.length; r++) {
        var match;
        while ((match = regexes[r].exec(before)) !== null) {
            var text = this._stripTags(match[1]);
            if (!text) continue;
            candidates.push(text);
        }
    }
    for (var i = candidates.length - 1; i >= 0; i--) {
        var candidate = candidates[i]
            .replace(/\s*Download\s*$/i, "")
            .replace(/\s+/g, " ")
            .trim();
        if (!candidate) continue;
        if (candidate.length > 180) continue;
        if (/trigger warning|reader discretion|translation notes|official|amazon|bookwalker|barnes|kobo/i.test(candidate)) continue;
        if (/^(?:pdf|epub|download|dark mode)$/i.test(candidate)) continue;
        return candidate;
    }
    return "";
};

SwayTranslationsSource._combineTitle = function(pageTitle, contextTitle, label) {
    var base = this._decode(pageTitle || "Sway Translations");
    var context = this._decode(contextTitle || "");
    if (context && this._normalizeText(base) !== this._normalizeText(context)) {
        if (this._normalizeText(context).indexOf(this._normalizeText(base)) === 0) {
            base = context;
        } else {
            base = base + " - " + context;
        }
    }
    var cleanLabel = this._decode(label || "").replace(/\s+/g, " ").trim();
    if (cleanLabel) base += " [" + cleanLabel + "]";
    return base.replace(/\s+/g, " ").trim();
};

SwayTranslationsSource._fileName = function(title, format) {
    var ext = /^(epub|pdf)$/i.test(format || "") ? String(format).toLowerCase() : "epub";
    return this._slug(title).replace(/-(?:pdf|epub|dark-mode)$/i, "") + "." + ext;
};

SwayTranslationsSource._score = function(item, tokens) {
    if (!tokens.length) return 1;
    var haystack = this._normalizeText([
        item.title,
        item.author,
        item.pageTitle,
        item.contextTitle,
        item.format,
        item.label,
    ].filter(Boolean).join(" "));
    var score = 0;
    for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        var index = haystack.indexOf(token);
        if (index < 0) return 0;
        score += index === 0 ? 12 : 8;
    }
    if (haystack.indexOf(tokens.join(" ")) >= 0) score += 20;
    if (this._normalizeText(item.pageTitle).indexOf(tokens.join(" ")) >= 0) score += 10;
    if (String(item.format || "").toLowerCase() === "epub") score += 2;
    return score;
};

SwayTranslationsSource._parsePageDownloads = function(html, page) {
    var pageTitle = this._extractEntryTitle(html) || page.title || "Sway Translations";
    var staticMeta = this._staticMetaForUrl(page.url);
    if (staticMeta && staticMeta.title) pageTitle = staticMeta.title;
    var author = (staticMeta && staticMeta.author) || page.author || "";
    var content = this._extractEntryContent(html);
    var anchors = this._extractAnchors(content);
    var results = [];
    var seen = {};
    var pageCover = this._extractImageBefore(content) || undefined;

    for (var i = 0; i < anchors.length; i++) {
        var anchor = anchors[i];
        if (!this._isDownloadLink(anchor)) continue;
        var format = this._formatFromLabel(anchor.text, anchor.href);
        if (!format) continue;
        var fileId = this._driveId(anchor.href);
        if (/drive\.google\.com/i.test(anchor.href) && !fileId) continue;
        var before = content.slice(Math.max(0, anchor.index - 2600), anchor.index);
        var contextTitle = this._contextTitle(before);
        var cover = this._extractImageBefore(before) || pageCover;
        var title = this._combineTitle(pageTitle, contextTitle, anchor.text);
        var key = (fileId || anchor.href) + "#" + format + "#" + this._slug(title);
        if (seen[key]) continue;
        seen[key] = true;
        results.push({
            id: "sway-" + this._hash(key),
            title: title,
            author: author || undefined,
            cover: cover || undefined,
            url: anchor.href,
            source: "Sway Translations",
            format: format,
            size: "",
            extra: {
                pageUrl: page.url,
                pageTitle: pageTitle,
                contextTitle: contextTitle,
                label: anchor.text,
                driveFileId: fileId || undefined,
                directUrl: fileId ? this._driveDownloadUrl(fileId) : anchor.href,
                fileName: this._fileName(title, format),
            },
        });
    }
    return results;
};

SwayTranslationsSource._fetchPageDownloads = async function(page) {
    try {
        var html = await this._fetchHtml(page.url, this.BASE_URL + "/");
        return this._parsePageDownloads(html, page);
    } catch (err) {
        if (typeof cinder !== "undefined" && cinder.warn) {
            cinder.warn("[SwayTranslations] Page parse failed for " + page.url + ": " + (err && err.message ? err.message : String(err)));
        }
        return [];
    }
};

SwayTranslationsSource._loadIndex = async function() {
    var now = Date.now ? Date.now() : new Date().getTime();
    if (this._indexCache && now - this._indexCache.time < this.CACHE_TTL_MS) {
        return this._indexCache.items;
    }

    var pages = await this._discoverPages();
    var all = [];
    var seen = {};
    var cursor = 0;
    var self = this;
    var workerCount = Math.min(4, pages.length || 1);

    async function worker() {
        while (cursor < pages.length) {
            var page = pages[cursor++];
            var items = await self._fetchPageDownloads(page);
            for (var i = 0; i < items.length; i++) {
                var key = items[i].id || items[i].url || items[i].title;
                if (seen[key]) continue;
                seen[key] = true;
                all.push(items[i]);
            }
        }
    }

    var workers = [];
    for (var i = 0; i < workerCount; i++) workers.push(worker());
    await Promise.all(workers);

    all.sort(function(a, b) {
        var aPage = String((a.extra && a.extra.pageTitle) || a.title || "");
        var bPage = String((b.extra && b.extra.pageTitle) || b.title || "");
        var pageCompare = aPage.localeCompare(bPage);
        if (pageCompare !== 0) return pageCompare;
        var aFormat = a.format === "epub" ? 0 : 1;
        var bFormat = b.format === "epub" ? 0 : 1;
        if (aFormat !== bFormat) return aFormat - bFormat;
        return String(a.title || "").localeCompare(String(b.title || ""));
    });

    this._indexCache = { time: now, items: all };
    return all;
};

SwayTranslationsSource.search = async function(query, page) {
    if (page && page > 0) return [];
    var text = String(query || "").trim();
    var items = await this._loadIndex();
    if (!text) return items.slice(0, this.MAX_RESULTS);
    var tokens = this._tokens(text);
    if (!tokens.length) return [];
    var scored = [];
    for (var i = 0; i < items.length; i++) {
        var score = this._score(items[i], tokens);
        if (score > 0) scored.push({ item: items[i], score: score });
    }
    scored.sort(function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        var aFormat = a.item.format === "epub" ? 0 : 1;
        var bFormat = b.item.format === "epub" ? 0 : 1;
        if (aFormat !== bFormat) return aFormat - bFormat;
        return String(a.item.title || "").localeCompare(String(b.item.title || ""));
    });
    return scored.slice(0, this.MAX_RESULTS).map(function(entry) { return entry.item; });
};

SwayTranslationsSource.searchDownloads = async function(bookOrQuery, page) {
    var query = "";
    if (typeof bookOrQuery === "string") {
        query = bookOrQuery;
    } else if (bookOrQuery) {
        query = [bookOrQuery.title, bookOrQuery.author].filter(Boolean).join(" ");
    }
    return this.search(query, page || 0);
};

SwayTranslationsSource.getDiscoverSections = async function() {
    return [
        { id: "all", title: "All Downloads", icon: "ST" },
        { id: "epub", title: "EPUB", icon: "ST" },
        { id: "pdf", title: "PDF", icon: "ST" },
    ];
};

SwayTranslationsSource.getDiscoverItems = async function(sectionId, page) {
    if (page && page > 0) return [];
    var items = await this._loadIndex();
    var section = String(sectionId || "all").toLowerCase();
    if (section === "epub" || section === "pdf") {
        items = items.filter(function(item) { return item.format === section; });
    }
    return items.slice(0, this.MAX_RESULTS);
};

SwayTranslationsSource.resolve = async function(item) {
    if (!item) throw new Error("Sway Translations item is missing.");
    var format = String(item.format || (item.extra && item.extra.format) || "").toLowerCase();
    if (!/^(epub|pdf)$/.test(format)) {
        format = /pdf/i.test(String(item.title || item.url || "")) ? "pdf" : "epub";
    }
    var directUrl = item.extra && item.extra.directUrl ? String(item.extra.directUrl) : "";
    var fileId = item.extra && item.extra.driveFileId ? String(item.extra.driveFileId) : this._driveId(item.url || "");
    if (!directUrl && fileId) directUrl = this._driveDownloadUrl(fileId);
    if (!directUrl) directUrl = String(item.url || "");
    if (!directUrl) throw new Error("No Sway Translations download URL was found for this result.");

    return {
        url: directUrl,
        fileName: (item.extra && item.extra.fileName) || this._fileName(item.title || "sway-translations", format),
        headers: this._downloadHeaders((item.extra && item.extra.pageUrl) || this.BASE_URL + "/"),
    };
};

__cinderExport = SwayTranslationsSource;

