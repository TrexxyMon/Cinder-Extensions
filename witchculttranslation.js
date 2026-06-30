__cinderExport = {
    id: "witchculttranslation",
    name: "Witch Cult Translations",
    version: "0.1.2",
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
    DEFAULT_COVER: "https://witchculttranslation.com/wp-content/uploads/2024/08/2408_garcar-min.png?x95263",

    ARCS: [
        {
            id: "all",
            title: "Re:Zero Web Novel - All HTML Chapters",
            url: "https://witchculttranslation.com/table-of-content/",
            description: "All public HTML chapters listed in the Witch Cult Translations table of contents. PDF-only legacy chapter batches are skipped.",
            cover: "https://witchculttranslation.com/wp-content/uploads/2024/08/2408_garcar-min.png?x95263",
        },
        {
            id: "arc-1",
            title: "Arc 1: The Capital City's First Day",
            url: "https://witchculttranslation.com/arc-1/",
            cover: "https://witchculttranslation.com/wp-content/uploads/2022/02/Emilia_Pin_3.png?x95263",
        },
        {
            id: "arc-2",
            title: "Arc 2: The Chaotic Week",
            url: "https://witchculttranslation.com/table-of-content/",
            description: "Arc 2 chapters linked from Witch Cult Translations' table of contents.",
            cover: "https://witchculttranslation.com/wp-content/uploads/2022/02/Emilia_Pin_3.png?x95263",
        },
        {
            id: "arc-3",
            title: "Arc 3: Return to the Royal Capital",
            url: "https://witchculttranslation.com/table-of-content/",
            description: "Arc 3 chapters linked from Witch Cult Translations' table of contents.",
            cover: "https://witchculttranslation.com/wp-content/uploads/2022/02/Satella_Pin.png?x95263",
        },
        {
            id: "arc-4",
            title: "Arc 4: Everlasting Contract",
            url: "https://witchculttranslation.com/table-of-content/",
            description: "Arc 4 HTML chapters and PDF-batch chapter references linked from Witch Cult Translations' table of contents.",
            allowPdfReferences: true,
            cover: "https://witchculttranslation.com/wp-content/uploads/2024/09/png-echidna-beatrice-2-editado-2.jpg?x95263",
        },
        {
            id: "arc-5",
            title: "Arc 5: Stars What Make History",
            url: "https://witchculttranslation.com/arc-5/",
            cover: "https://witchculttranslation.com/wp-content/uploads/2025/05/Gp9cmEIaEAAE3kc-scaled.jpg?x95263",
        },
        {
            id: "arc-6",
            title: "Arc 6: Hall of Memories",
            url: "https://witchculttranslation.com/arc-6/",
            cover: "https://witchculttranslation.com/wp-content/uploads/2024/09/FqJJIV3aYAA5KYw-1-min-scaled.jpg?x95263",
        },
        {
            id: "arc-7",
            title: "Arc 7: The Land of Wolves",
            url: "https://witchculttranslation.com/arc-7/",
            cover: "https://i.redd.it/bmdz6xtajix61.jpg",
        },
        {
            id: "arc-8",
            title: "Arc 8: Vincent Vollachia",
            url: "https://witchculttranslation.com/arc-8/",
            cover: "https://pbs.twimg.com/media/Ft0wiBfaQAEfQAf?format=jpg&name=4096x4096",
        },
        {
            id: "arc-9",
            title: "Arc 9: Light of a Nameless Star",
            url: "https://witchculttranslation.com/arc-9/",
            cover: "https://witchculttranslation.com/wp-content/uploads/2024/08/2408_garcar-min.png?x95263",
        },
        {
            id: "arc-10",
            title: "Arc 10: The Land of the Lion Kings",
            url: "https://witchculttranslation.com/arc-10/",
            cover: "https://witchculttranslation.com/wp-content/uploads/2026/02/HAXyic0acAAL0ij.jpg?x95263",
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

    _escapeRegExp: function(value) {
        return String(value || "").replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    },

    _escapeAttr: function(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    },

    _attr: function(tag, name) {
        var key = this._escapeRegExp(name);
        var match = String(tag || "").match(new RegExp("\\s" + key + "\\s*=\\s*([\"'])([\\s\\S]*?)\\1", "i")) ||
            String(tag || "").match(new RegExp("\\s" + key + "\\s*=\\s*([^\\s>]+)", "i"));
        return match ? this._decode(match[2] || match[1] || "") : "";
    },

    _bestSrcsetUrl: function(srcset) {
        var raw = this._decode(srcset || "");
        if (!raw) return "";
        var best = "";
        var bestWidth = -1;
        var parts = raw.split(",");
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (!part) continue;
            var tokens = part.split(/\s+/);
            var url = tokens[0] || "";
            var width = 0;
            var widthMatch = part.match(/\s(\d+)w\b/i);
            if (widthMatch) width = parseInt(widthMatch[1], 10) || 0;
            if (!best || width > bestWidth) {
                best = url;
                bestWidth = width;
            }
        }
        return best;
    },

    _imageUrlFromTag: function(tag, pageUrl) {
        var candidates = [
            this._attr(tag, "data-full-url"),
            this._attr(tag, "data-orig-file"),
            this._attr(tag, "data-lazy-src"),
            this._attr(tag, "data-src"),
            this._bestSrcsetUrl(this._attr(tag, "data-srcset")),
            this._bestSrcsetUrl(this._attr(tag, "srcset")),
            this._attr(tag, "src"),
        ];
        for (var i = 0; i < candidates.length; i++) {
            var url = this._decode(candidates[i] || "").trim();
            if (!url || /^data:/i.test(url) || /^javascript:/i.test(url) || /^about:blank$/i.test(url) || url.charAt(0) === "#") continue;
            return this._abs(url, pageUrl);
        }
        return "";
    },

    _isUsefulImage: function(url, tag) {
        var value = String(url || "").toLowerCase();
        var raw = String(tag || "").toLowerCase();
        if (!value) return false;
        if (/wct_logo|satella_pin|emilia_pin|\/jp\.png|\/es\.png|\/br\.png|\/cn\.png|france-flag|qr_|gravatar|avatar|identicon/.test(value + " " + raw)) return false;
        if (/\.(svg)(?:[?#].*)?$/i.test(value)) return false;
        return /\.(png|jpe?g|webp)(?:[?#].*)?$/i.test(value) || /pbs\.twimg\.com\/media\//i.test(value) || /i\.redd\.it\//i.test(value);
    },

    _coverFromHtml: function(html, pageUrl) {
        var og = this._meta(html, "og:image") || this._meta(html, "twitter:image");
        if (og) {
            var absolute = this._abs(og, pageUrl);
            if (this._isUsefulImage(absolute, "")) return absolute;
        }
        var regex = /<img\b[^>]*>/gi;
        var match;
        while ((match = regex.exec(String(html || ""))) !== null) {
            var url = this._imageUrlFromTag(match[0], pageUrl);
            if (this._isUsefulImage(url, match[0])) return url;
        }
        return this.DEFAULT_COVER;
    },

    _normalizeImageTag: function(tag, pageUrl) {
        var src = this._imageUrlFromTag(tag, pageUrl);
        if (!src) return "";
        var alt = this._attr(tag, "alt");
        var width = this._attr(tag, "width").replace(/[^\d.]/g, "");
        var height = this._attr(tag, "height").replace(/[^\d.]/g, "");
        var className = this._attr(tag, "class");
        var attrs = ['src="' + this._escapeAttr(src) + '"'];
        attrs.push('alt="' + this._escapeAttr(alt) + '"');
        if (width) attrs.push('width="' + this._escapeAttr(width) + '"');
        if (height) attrs.push('height="' + this._escapeAttr(height) + '"');
        if (className) attrs.push('class="' + this._escapeAttr(className) + '"');
        return "<img " + attrs.join(" ") + " />";
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
            cover: arc.cover || this.DEFAULT_COVER,
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
        if (/\.(pdf|jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(value)) return false;
        if (/^https?:\/\/witchculttranslation\.com\/\d{4}\/\d{2}\/\d{2}\//i.test(value) &&
            /(?:arc-\d+|chapter|prologue|interlude|intermission)/i.test(value) &&
            !/\.(pdf|jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(value)) {
            return true;
        }
        if (/^https?:\/\/(?:www\.)?eminenttranslations\.com\//i.test(value) &&
            /(?:arc-2|volume-2|chapter-\d+)/i.test(value)) {
            return true;
        }
        if (/^https?:\/\/kagurojp\.wordpress\.com\/\d{4}\/\d{2}\/\d{2}\/vol-3-ch-\d+/i.test(value)) {
            return true;
        }
        return false;
    },

    _isPdfChapterReference: function(url, text, arcId) {
        if (arcId !== "arc-4") return false;
        var value = String(url || "");
        var label = String(text || "");
        return /^https?:\/\/witchculttranslation\.com\/wp-content\/uploads\/\d{4}\/\d{2}\/a4-[^"'\s<>]+\.pdf(?:[?#][^"'\s<>]*)?$/i.test(value) &&
            /(?:chapter|interlude|intermission|appendix|phase)/i.test(label);
    },

    _chapterMatchesArc: function(href, text, arcId, isPdfReference) {
        if (!arcId || arcId === "all") return true;
        var url = String(href || "").toLowerCase();
        var label = String(text || "").toLowerCase();
        var arcText = arcId.replace("-", " ");
        if (url.indexOf("/" + arcId + "-") !== -1 || url.indexOf("/" + arcId + "/") !== -1 || label.indexOf(arcText) !== -1) {
            return true;
        }
        if (arcId === "arc-2") {
            return /^https?:\/\/(?:www\.)?eminenttranslations\.com\//i.test(href) &&
                (url.indexOf("arc-2") !== -1 || url.indexOf("/volume-2/") !== -1 || label.indexOf("arc 2") !== -1);
        }
        if (arcId === "arc-3") {
            return /^https?:\/\/kagurojp\.wordpress\.com\//i.test(href) ||
                url.indexOf("/category/arc-3/") !== -1 ||
                url.indexOf("arc-3-chapter") !== -1;
        }
        if (arcId === "arc-4") {
            return isPdfReference === true || url.indexOf("arc-4") !== -1 || url.indexOf("/a4-") !== -1;
        }
        return false;
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

    _elementByClassHtml: function(html, className) {
        var source = String(html || "");
        var classPattern = new RegExp("<div\\b[^>]*class=[\"'][^\"']*\\b" + this._escapeRegExp(className) + "\\b[^\"']*[\"'][^>]*>", "i");
        var match = classPattern.exec(source);
        if (!match) return "";
        var openEnd = match.index + match[0].length;
        var token = /<\/?div\b[^>]*>/gi;
        token.lastIndex = openEnd;
        var depth = 1;
        var next;
        while ((next = token.exec(source)) !== null) {
            if (/^<\s*\/div/i.test(next[0])) {
                depth -= 1;
                if (depth === 0) {
                    return source.slice(openEnd, next.index);
                }
            } else {
                depth += 1;
            }
        }
        return source.slice(openEnd);
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
            var isHtmlChapter = this._isChapterUrl(href);
            var isPdfReference = this._isPdfChapterReference(href, text, arcId);
            if (!isHtmlChapter && !isPdfReference) continue;
            if (!this._chapterMatchesArc(href, text, arcId, isPdfReference)) continue;
            var id = isPdfReference ? "pdfref::" + encodeURIComponent(href) + "::" + encodeURIComponent(text) : href;
            if (seen[id]) continue;
            seen[id] = true;
            var index = links.length + 1;
            links.push({
                id: id,
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
        var readerContent = this._elementByClassHtml(html, "reader-paged-content");
        if (readerContent) return readerContent;
        var entryContent = this._elementByClassHtml(html, "entry-content");
        if (entryContent) return entryContent;
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
        cleaned = cleaned.replace(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi, "$1");
        cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
        cleaned = cleaned.replace(/<form[\s\S]*?<\/form>/gi, "");
        cleaned = cleaned.replace(/<div\b[^>]*class=["'][^"']*(?:sharedaddy|jp-relatedposts|comments|comment|entry-meta|pum-|wp-block-buttons)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");
        cleaned = cleaned.replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, "");
        cleaned = cleaned.replace(/<source\b[^>]*>/gi, "");
        cleaned = cleaned.replace(/<img\b[^>]*>/gi, function(tag) {
            return __cinderExport._normalizeImageTag(tag, pageUrl);
        });
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
                    cover: __cinderExport.DEFAULT_COVER,
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
        if (url.indexOf("pdfref::") === 0) {
            var parts = url.split("::");
            var pdfUrl = parts[1] ? decodeURIComponent(parts[1]) : "";
            var pdfTitle = parts[2] ? decodeURIComponent(parts[2]) : "PDF chapter reference";
            return {
                id: url,
                title: pdfTitle,
                url: pdfUrl,
                html: '<p>This chapter is only available from the source as part of a Witch Cult PDF batch.</p><p><a href="' + this._decode(pdfUrl).replace(/"/g, "&quot;") + '">Open the source PDF batch</a></p>',
            };
        }
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
