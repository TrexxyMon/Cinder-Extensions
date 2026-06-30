__cinderExport = {
    id: "witchculttranslation",
    name: "Witch Cult Translations",
    version: "0.1.0",
    icon: "WC",
    description: "Read public chaptered Re:Zero web novel fan translations from Witch Cult Translations and package arcs into EPUB on device. No debrid required.",
    contentType: "books",
    contentTypes: ["webnovel", "ebook"],
    contentSubtypes: ["lightNovel", "webFiction"],

    capabilities: {
        search: true,
        discover: true,
        download: false,
        resolve: false,
        bookChapters: true,
        manga: false,
    },

    BASE_URL: "https://witchculttranslation.com",

    ARCS: [
        {
            id: "all",
            title: "Re:Zero Web Novel - All HTML Chapters",
            url: "https://witchculttranslation.com/table-of-content/",
            description: "All public HTML chapters listed in the Witch Cult Translations table of contents. PDF-only legacy chapter batches are skipped.",
        },
        {
            id: "arc-1",
            title: "Arc 1: The Capital City's First Day",
            url: "https://witchculttranslation.com/arc-1/",
        },
        {
            id: "arc-5",
            title: "Arc 5: Stars What Make History",
            url: "https://witchculttranslation.com/arc-5/",
        },
        {
            id: "arc-6",
            title: "Arc 6: Hall of Memories",
            url: "https://witchculttranslation.com/arc-6/",
        },
        {
            id: "arc-7",
            title: "Arc 7: The Land of Wolves",
            url: "https://witchculttranslation.com/arc-7/",
        },
        {
            id: "arc-8",
            title: "Arc 8: Vincent Vollachia",
            url: "https://witchculttranslation.com/arc-8/",
        },
        {
            id: "arc-9",
            title: "Arc 9: Light of a Nameless Star",
            url: "https://witchculttranslation.com/arc-9/",
        },
        {
            id: "arc-10",
            title: "Arc 10: The Land of the Lion Kings",
            url: "https://witchculttranslation.com/arc-10/",
        },
    ],

    _headers: function(referer) {
        return {
            "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": referer || this.BASE_URL + "/",
        };
    },

    _decode: function(text) {
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
    },

    _stripTags: function(html) {
        return this._decode(String(html || "")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " "));
    },

    _abs: function(url, baseUrl) {
        var value = this._decode(url || "").trim();
        if (!value) return "";
        if (/^https?:\/\//i.test(value)) return value;
        if (value.indexOf("//") === 0) return "https:" + value;
        var base = baseUrl || this.BASE_URL + "/";
        if (typeof cinder !== "undefined" && cinder.resolveUrl) {
            return cinder.resolveUrl(value, base);
        }
        if (value.charAt(0) === "/") return this.BASE_URL + value;
        return this.BASE_URL + "/" + value.replace(/^\/+/, "");
    },

    _fetchHtml: async function(url, referer) {
        var response = await cinder.fetch(url, {
            headers: this._headers(referer),
            timeout: 30000,
        });
        if (!response || response.status !== 200 || !response.data) {
            response = await cinder.fetchBrowser(url, {
                headers: this._headers(referer),
                timeout: 30000,
            });
        }
        if (!response || response.status !== 200 || !response.data) {
            throw new Error("Witch Cult request failed: " + url);
        }
        return response.data;
    },

    _meta: function(html, key) {
        var escaped = String(key || "").replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
        var patterns = [
            new RegExp("<meta[^>]+property=[\"']" + escaped + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i"),
            new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']" + escaped + "[\"'][^>]*>", "i"),
            new RegExp("<meta[^>]+name=[\"']" + escaped + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i"),
        ];
        for (var i = 0; i < patterns.length; i++) {
            var match = String(html || "").match(patterns[i]);
            if (match && match[1]) return this._decode(match[1]);
        }
        return "";
    },

    _arcById: function(id) {
        for (var i = 0; i < this.ARCS.length; i++) {
            if (this.ARCS[i].id === id) return this.ARCS[i];
        }
        return null;
    },

    _arcSearchText: function(arc) {
        return String((arc && (arc.id + " " + arc.title + " " + (arc.description || ""))) || "").toLowerCase();
    },

    _resultFromArc: function(arc, index) {
        return {
            id: arc.id,
            title: arc.title,
            author: "Tappei Nagatsuki / Witch Cult Translations",
            cover: "",
            url: arc.url,
            format: "epub",
            source: "Witch Cult Translations",
            size: arc.id === "all" ? "chaptered" : "arc",
            availability: Math.max(1, 100 - index),
            extra: {
                arcId: arc.id,
                arcUrl: arc.url,
                summary: arc.description || "Chaptered web novel arc from Witch Cult Translations.",
            },
        };
    },

    _isChapterUrl: function(url) {
        var value = String(url || "");
        return /^https?:\/\/witchculttranslation\.com\/\d{4}\/\d{2}\/\d{2}\//i.test(value) &&
            /(?:arc-\d+|chapter|prologue|interlude|intermission)/i.test(value) &&
            !/\.(pdf|jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(value);
    },

    _chapterNumber: function(text, url, fallback) {
        var value = String((text || "") + " " + (url || ""));
        var match = value.match(/chapter[\s-]+(\d+(?:\.\d+)?)/i);
        if (match) return parseFloat(match[1]);
        if (/prologue/i.test(value)) return 0;
        if (/interlude|intermission/i.test(value)) return (fallback || 0) + 0.1;
        return fallback || 0;
    },

    _cleanChapterTitle: function(text) {
        var title = this._decode(text || "");
        return title
            .replace(/\s*\|\s*Witch Cult Translations\s*$/i, "")
            .replace(/\s+/g, " ")
            .trim();
    },

    _extractChapterLinks: function(html, pageUrl, arcId) {
        var links = [];
        var seen = {};
        var regex = /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
        var match;
        while ((match = regex.exec(String(html || ""))) !== null) {
            var href = this._abs(match[2], pageUrl);
            var text = this._cleanChapterTitle(this._stripTags(match[4]));
            if (!href || !text) continue;
            if (!this._isChapterUrl(href)) continue;
            if (arcId && arcId !== "all" && href.toLowerCase().indexOf("/" + arcId + "-") === -1 && text.toLowerCase().indexOf(arcId.replace("-", " ")) === -1) {
                continue;
            }
            if (seen[href]) continue;
            seen[href] = true;
            var index = links.length + 1;
            links.push({
                id: href,
                title: text,
                index: index,
                chapterNumber: this._chapterNumber(text, href, index),
                url: href,
            });
        }

        if (arcId !== "all") {
            links.sort(function(a, b) {
                if ((a.chapterNumber || 0) !== (b.chapterNumber || 0)) {
                    return (a.chapterNumber || 0) - (b.chapterNumber || 0);
                }
                return (a.index || 0) - (b.index || 0);
            });
        }
        for (var i = 0; i < links.length; i++) {
            links[i].index = i + 1;
        }
        return links;
    },

    _titleFromHtml: function(html, fallback) {
        var match = String(html || "").match(/<h1\b[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
            String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ||
            String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
        return this._cleanChapterTitle(match && match[1] ? this._stripTags(match[1]) : fallback || "Chapter");
    },

    _entryContentHtml: function(html) {
        var match = String(html || "").match(/<div\b[^>]*class=["'][^"']*\bentry-content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/article>/i);
        if (match && match[1]) return match[1];
        match = String(html || "").match(/<div\b[^>]*class=["'][^"']*\bentry-content\b[^"']*["'][^>]*>([\s\S]*?)<footer\b/i);
        if (match && match[1]) return match[1];
        match = String(html || "").match(/<div\b[^>]*class=["'][^"']*\bentry-content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
        return match && match[1] ? match[1] : "";
    },

    _sanitizeChapterHtml: function(html, pageUrl) {
        var cleaned = String(html || "");
        cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
        cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");
        cleaned = cleaned.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
        cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
        cleaned = cleaned.replace(/<form[\s\S]*?<\/form>/gi, "");
        cleaned = cleaned.replace(/<div\b[^>]*class=["'][^"']*(?:sharedaddy|jp-relatedposts|comments|comment|entry-meta|pum-|wp-block-buttons)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");
        cleaned = cleaned.replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, "");
        cleaned = cleaned.replace(/(?:href|src)=["']([^"']+)["']/gi, function(full, value) {
            if (!value || /^data:/i.test(value) || /^javascript:/i.test(value) || value.charAt(0) === "#") return full;
            var quote = full.indexOf("'") >= 0 ? "'" : '"';
            var attr = full.slice(0, full.indexOf("="));
            return attr + "=" + quote + __cinderExport._abs(value, pageUrl) + quote;
        });
        return cleaned.trim();
    },

    search: async function(query) {
        var q = String(query || "").toLowerCase().trim();
        if (!q) return [];
        var results = [];
        for (var i = 0; i < this.ARCS.length; i++) {
            var arc = this.ARCS[i];
            if (
                this._arcSearchText(arc).indexOf(q) >= 0 ||
                (q.indexOf("rezero") >= 0 || q.indexOf("re zero") >= 0 || q.indexOf("re:zero") >= 0 || q.indexOf("witch") >= 0)
            ) {
                results.push(this._resultFromArc(arc, i));
            }
        }
        return results.length ? results : [this._resultFromArc(this.ARCS[0], 0)];
    },

    getDiscoverSections: async function() {
        return [
            { id: "arcs", title: "Re:Zero Arcs", icon: "library-outline" },
            { id: "latest", title: "Latest Chapters", icon: "time-outline" },
        ];
    },

    getDiscoverItems: async function(sectionId) {
        if (sectionId === "latest") {
            var home = await this._fetchHtml(this.BASE_URL + "/", this.BASE_URL + "/");
            var latest = this._extractChapterLinks(home, this.BASE_URL + "/", "all").slice(-20).reverse();
            return latest.map(function(chapter, index) {
                return {
                    id: "latest-" + index + "::" + chapter.id,
                    title: chapter.title,
                    author: "Witch Cult Translations",
                    url: chapter.id,
                    format: "epub",
                    source: "Witch Cult Translations",
                    size: "chapter",
                    extra: {
                        arcId: "single",
                        chapterUrl: chapter.id,
                    },
                };
            });
        }
        var results = [];
        for (var i = 0; i < this.ARCS.length; i++) {
            results.push(this._resultFromArc(this.ARCS[i], i));
        }
        return results;
    },

    getBookChapters: async function(bookId) {
        var value = String(bookId || "");
        if (value.indexOf("latest-") === 0 && value.indexOf("::") >= 0) {
            var singleUrl = value.split("::").slice(1).join("::");
            return [{ id: singleUrl, title: this._titleFromHtml("", "Chapter"), index: 1, url: singleUrl }];
        }

        var arc = this._arcById(value) || this.ARCS[0];
        var html = await this._fetchHtml(arc.url, this.BASE_URL + "/");
        var chapters = this._extractChapterLinks(html, arc.url, arc.id);

        if (arc.id === "all") {
            var unique = {};
            chapters = chapters.filter(function(chapter) {
                if (unique[chapter.id]) return false;
                unique[chapter.id] = true;
                return true;
            });
        }

        if (!chapters.length) {
            throw new Error("Witch Cult Translations did not expose any HTML chapters for " + arc.title + ".");
        }
        return chapters;
    },

    getBookChapter: async function(chapterId) {
        var url = String(chapterId || "");
        var html = await this._fetchHtml(url, this.BASE_URL + "/");
        var title = this._titleFromHtml(html, url);
        var content = this._entryContentHtml(html);
        if (!content) {
            throw new Error("Could not locate Witch Cult chapter content.");
        }
        return {
            id: url,
            title: title,
            url: url,
            html: this._sanitizeChapterHtml(content, url),
        };
    },
};
