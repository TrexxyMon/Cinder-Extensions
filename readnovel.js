__cinderExport = {
    id: "readnovel",
    name: "ReadNovelEU",
    version: "0.1.0-cinder",
    icon: "RN",
    description: "Search and read chaptered web novels from ReadNovelEU, the current wuxiaworld.eu destination.",
    contentType: "books",
    contentTypes: ["webnovel", "ebook"],
    contentSubtypes: ["webFiction", "lightNovel", "wuxia", "xianxia", "xuanhuan"],

    capabilities: {
        search: true,
        discover: true,
        download: false,
        resolve: false,
        bookChapters: true,
        manga: false,
    },

    BASE_URL: "https://readnovel.eu",

    _headers: function() {
        return {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": this.BASE_URL + "/",
        };
    },

    _decode: function(text) {
        return cinder.normalizeText(String(text || ""));
    },

    _escapeHtml: function(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    },

    _fetch: async function(url, options) {
        var response = await cinder.fetch(url, {
            headers: this._headers(),
            timeout: options && options.timeout ? options.timeout : 30000,
        });
        if (!response || response.status < 200 || response.status >= 300 || response.data == null) {
            throw new Error("ReadNovelEU request failed: " + url);
        }
        return response.data;
    },

    _fetchJson: async function(url) {
        var data = await this._fetch(url);
        if (typeof data === "string") {
            return JSON.parse(data);
        }
        return data;
    },

    _fetchHtml: async function(url) {
        var data = await this._fetch(url);
        return String(data || "");
    },

    _absoluteUrl: function(path) {
        if (!path) return "";
        var value = String(path);
        if (/^https?:\/\//i.test(value)) return value;
        if (value.indexOf("//") === 0) return "https:" + value;
        if (value.charAt(0) === "/") return this.BASE_URL + value;
        return this.BASE_URL + "/" + value.replace(/^\/+/, "");
    },

    _authorName: function(author) {
        if (!author) return "";
        if (typeof author === "string") return this._decode(author);
        if (author.name) return this._decode(author.name);
        if (author.title) return this._decode(author.title);
        return "";
    },

    _statusLabel: function(status) {
        var code = String(status || "").toUpperCase();
        if (code === "CD") return "Completed";
        if (code === "OG") return "Ongoing";
        if (code === "HI") return "Hiatus";
        return status || "";
    },

    _parseBookId: function(bookId) {
        var value = String(bookId || "").trim();
        if (!value) throw new Error("Missing ReadNovelEU book ID.");

        var novelMatch = value.match(/\/novel\/([^/?#]+)/i);
        if (novelMatch) return decodeURIComponent(novelMatch[1]);

        var apiMatch = value.match(/\/api\/novels\/([^/?#]+)/i);
        if (apiMatch) return decodeURIComponent(apiMatch[1]);

        return value.replace(/^\/+|\/+$/g, "");
    },

    _parseChapterId: function(chapterId) {
        var value = String(chapterId || "").trim();
        if (!value) throw new Error("Missing ReadNovelEU chapter ID.");

        var chapterMatch = value.match(/\/chapter\/([^/?#]+)/i);
        if (chapterMatch) return decodeURIComponent(chapterMatch[1]);

        return value.replace(/^\/+|\/+$/g, "");
    },

    _novelResult: function(item) {
        var slug = item.slug || item.id || "";
        var chapterCount = item.chapters || item.numOfChaps || 0;
        var cover = this._absoluteUrl(item.original_image || item.image || "");
        var status = this._statusLabel(item.status);
        return {
            id: slug,
            title: this._decode(item.name || item.title || slug),
            author: this._authorName(item.author),
            cover: cover,
            url: this.BASE_URL + "/novel/" + slug,
            format: "epub",
            size: chapterCount ? String(chapterCount) + " chapters" : "",
            source: "ReadNovelEU",
            extra: {
                slug: slug,
                description: this._decode(item.description || ""),
                chapterCount: chapterCount,
                status: status,
                lastChapterUpdated: item.last_chap_updated || item.updated_at || "",
                categories: item.categories || [],
                tags: item.tags || [],
                rating: item.rating || "",
                views: item.views || "",
            },
        };
    },

    _resultsFromPayload: function(payload) {
        var raw = Array.isArray(payload) ? payload : payload && Array.isArray(payload.results) ? payload.results : [];
        var results = [];
        var seen = {};
        for (var i = 0; i < raw.length; i++) {
            var item = raw[i] || {};
            var slug = item.slug || item.id || "";
            if (!slug || seen[slug]) continue;
            seen[slug] = true;
            results.push(this._novelResult(item));
        }
        return results;
    },

    _extractNextData: function(html) {
        var match = String(html || "").match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
        if (!match || !match[1]) {
            throw new Error("ReadNovelEU chapter data was not found.");
        }
        return JSON.parse(match[1]);
    },

    _findChapterState: function(nextData) {
        var queries = nextData &&
            nextData.props &&
            nextData.props.pageProps &&
            nextData.props.pageProps.dehydratedState &&
            nextData.props.pageProps.dehydratedState.queries;

        if (!Array.isArray(queries)) return null;
        for (var i = 0; i < queries.length; i++) {
            var stateData = queries[i] && queries[i].state && queries[i].state.data;
            if (stateData && typeof stateData.text === "string") {
                return stateData;
            }
        }
        return null;
    },

    _textToHtml: function(text) {
        var lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
        var html = [];
        for (var i = 0; i < lines.length; i++) {
            var line = this._decode(lines[i]);
            if (!line) continue;
            html.push("<p>" + this._escapeHtml(line) + "</p>");
        }
        return html.join("\n");
    },

    search: async function(query, page) {
        if (!query || !query.trim()) return [];
        var offset = Math.max(0, page || 0) * 12;
        var url = this.BASE_URL + "/api/search/?limit=12&offset=" + offset + "&search=" + encodeURIComponent(query.trim());
        var payload = await this._fetchJson(url);
        return this._resultsFromPayload(payload);
    },

    getDiscoverSections: async function() {
        return [
            { id: "all", title: "All Novels" },
            { id: "mature", title: "Mature" },
            { id: "psychological", title: "Psychological" },
            { id: "mystery", title: "Mystery" },
            { id: "action", title: "Action" },
            { id: "romance", title: "Romance" },
        ];
    },

    getDiscoverItems: async function(sectionId, page) {
        var offset = Math.max(0, page || 0) * 12;
        var url;
        if (!sectionId || sectionId === "all") {
            url = this.BASE_URL + "/api/novels/?limit=12&offset=" + offset;
        } else {
            url = this.BASE_URL + "/api/search/?limit=12&offset=" + offset + "&category=" + encodeURIComponent(sectionId);
        }
        var payload = await this._fetchJson(url);
        return this._resultsFromPayload(payload);
    },

    getBookChapters: async function(bookId) {
        var slug = this._parseBookId(bookId);
        var payload = await this._fetchJson(this.BASE_URL + "/api/chapters/" + encodeURIComponent(slug));
        if (!Array.isArray(payload)) {
            throw new Error("ReadNovelEU did not return a chapter list for this novel.");
        }

        var chapters = [];
        var seen = {};
        for (var i = 0; i < payload.length; i++) {
            var item = payload[i] || {};
            var chapterSlug = item.novSlugChapSlug || item.slug || item.id;
            if (!chapterSlug || seen[chapterSlug]) continue;
            seen[chapterSlug] = true;

            var index = Number(item.index || chapters.length + 1);
            chapters.push({
                id: String(chapterSlug),
                title: this._decode(item.title || ("Chapter " + index)),
                index: index,
                url: this.BASE_URL + "/chapter/" + chapterSlug,
                datePublished: item.timeAdded || "",
            });
        }

        chapters.sort(function(a, b) {
            return (a.index || 0) - (b.index || 0);
        });

        return chapters;
    },

    getBookChapter: async function(chapterId) {
        var chapterSlug = this._parseChapterId(chapterId);
        var url = this.BASE_URL + "/chapter/" + encodeURIComponent(chapterSlug);
        var html = await this._fetchHtml(url);
        var nextData = this._extractNextData(html);
        var chapter = this._findChapterState(nextData);
        if (!chapter || !chapter.text) {
            throw new Error("ReadNovelEU chapter text was not found.");
        }

        return {
            id: chapterSlug,
            title: this._decode(chapter.title || "Chapter"),
            url: url,
            index: Number(chapter.index || 0),
            html: this._textToHtml(chapter.text),
        };
    },
};
