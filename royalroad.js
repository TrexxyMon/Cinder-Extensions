__cinderExport = {
    id: "royalroad",
    name: "Royal Road",
    version: "1.0.1",
    icon: "RR",
    description: "Search chaptered fiction from Royal Road and package it into EPUB for reading in Cinder.",
    contentType: "books",

    capabilities: {
        search: true,
        discover: false,
        download: false,
        resolve: false,
        bookChapters: true,
        manga: false,
    },

    _headers: function() {
        return {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        };
    },

    _decode: function(text) {
        return cinder.normalizeText(text || "");
    },

    _queryFirst: function(root, selectors) {
        for (var i = 0; i < selectors.length; i++) {
            var match = root.querySelector(selectors[i]);
            if (match) return match;
        }
        return null;
    },

    _fetchHtml: async function(url) {
        var response = await cinder.fetch(url, {
            headers: this._headers(),
            timeout: 30000,
        });
        if (!response || response.status !== 200 || !response.data) {
            response = await cinder.fetchBrowser(url, {
                headers: this._headers(),
                timeout: 30000,
            });
        }
        if (!response || response.status !== 200 || !response.data) {
            throw new Error("Failed to load Royal Road page: " + url);
        }
        return response.data;
    },

    _parseFictionUrl: function(url) {
        var match = String(url || "").match(/\/fiction\/(\d+)\/([^/?#]+)/i);
        if (!match) return null;
        return {
            fictionId: match[1],
            fictionSlug: match[2],
        };
    },

    _makeBookId: function(fictionId, fictionSlug) {
        return fictionId + "::" + fictionSlug;
    },

    _parseBookId: function(bookId) {
        var parts = String(bookId || "").split("::");
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            throw new Error("Invalid Royal Road book ID: " + bookId);
        }
        return {
            fictionId: parts[0],
            fictionSlug: parts[1],
        };
    },

    _fictionUrlFromBookId: function(bookId) {
        var parsed = this._parseBookId(bookId);
        return "https://www.royalroad.com/fiction/" + parsed.fictionId + "/" + parsed.fictionSlug;
    },

    _extractDescriptionFromCard: function(card) {
        var descriptionEl = this._queryFirst(card, [
            "div[class*='description']",
            "div.hidden-content",
            "div.mt-2",
            "p",
        ]);
        return descriptionEl ? this._decode(descriptionEl.text()) : "";
    },

    _extractChapterCount: function(text) {
        var match = String(text || "").match(/([\d,]+)\s+Chapters/i);
        return match ? parseInt(match[1].replace(/,/g, ""), 10) : 0;
    },

    _extractSearchResults: function(html) {
        var doc = cinder.parseHTML(html);
        var baseUrl = "https://www.royalroad.com";
        var cardSelectors = [
            ".fiction-list-item",
            ".fiction-list-item.row",
            "div[class*='fiction-list-item']",
            "div.list-page div.row",
        ];
        var cards = [];
        for (var selectorIndex = 0; selectorIndex < cardSelectors.length; selectorIndex++) {
            cards = doc.querySelectorAll(cardSelectors[selectorIndex]);
            if (cards && cards.length) break;
        }

        var results = [];
        var seen = {};

        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var titleEl = this._queryFirst(card, [
                "h2 a[href*='/fiction/']",
                "h3 a[href*='/fiction/']",
                "a[href*='/fiction/']",
            ]);
            if (!titleEl) continue;

            var href = titleEl.attr("href") || "";
            var absoluteUrl = cinder.resolveUrl(href, baseUrl);
            var parsed = this._parseFictionUrl(absoluteUrl);
            if (!parsed) continue;

            var bookId = this._makeBookId(parsed.fictionId, parsed.fictionSlug);
            if (seen[bookId]) continue;
            seen[bookId] = true;

            var authorEl = this._queryFirst(card, [
                "h4 a[href*='/profile/']",
                "a[href*='/profile/']",
            ]);
            var imgEl = this._queryFirst(card, ["img"]);
            var cover = "";
            if (imgEl) {
                cover = imgEl.attr("src") || imgEl.attr("data-src") || "";
                if (cover) cover = cinder.resolveUrl(cover, absoluteUrl);
            }

            var description = this._extractDescriptionFromCard(card);
            var chapterCount = this._extractChapterCount(card.text());
            results.push({
                id: bookId,
                title: this._decode(titleEl.text()),
                author: authorEl ? this._decode(authorEl.text()) : "",
                cover: cover,
                url: absoluteUrl,
                format: "epub",
                size: chapterCount ? String(chapterCount) + " chapters" : "",
                source: "Royal Road",
                extra: {
                    fictionId: parsed.fictionId,
                    fictionSlug: parsed.fictionSlug,
                    description: description,
                },
            });
        }

        if (results.length) return results;

        var titleLinks = doc.querySelectorAll("h2 a[href*='/fiction/'], h3 a[href*='/fiction/']");
        for (var linkIndex = 0; linkIndex < titleLinks.length; linkIndex++) {
            var titleLink = titleLinks[linkIndex];
            var titleHref = titleLink.attr("href") || "";
            var titleUrl = cinder.resolveUrl(titleHref, baseUrl);
            var titleParsed = this._parseFictionUrl(titleUrl);
            if (!titleParsed) continue;
            var fallbackBookId = this._makeBookId(titleParsed.fictionId, titleParsed.fictionSlug);
            if (seen[fallbackBookId]) continue;
            seen[fallbackBookId] = true;
            results.push({
                id: fallbackBookId,
                title: this._decode(titleLink.text()),
                author: "",
                cover: "",
                url: titleUrl,
                format: "epub",
                source: "Royal Road",
                extra: {
                    fictionId: titleParsed.fictionId,
                    fictionSlug: titleParsed.fictionSlug,
                },
            });
        }

        return results;
    },

    _scoreChapterContainer: function(element) {
        var className = String(element.attr("class") || "").toLowerCase();
        var id = String(element.attr("id") || "").toLowerCase();
        var html = element.html() || "";
        var text = this._decode(element.text() || "");
        var meta = className + " " + id;

        if (text.length < 800) return -1;
        if (/comment|author-note|navigation|sidebar|advert|profile|review|rating|spoiler-title|portlet-title|footer|header|button/.test(meta)) {
            return -1;
        }

        var score = text.length;
        if (/<p[\s>]/i.test(html)) score += 2000;
        if (/chapter/.test(meta)) score += 5000;
        if (/content/.test(meta)) score += 3000;
        if (/profile|comment|advert/.test(html)) score -= 2000;
        return score;
    },

    _findChapterContent: function(doc) {
        var selectors = [
            "div.chapter-content",
            "div.chapter-inner.chapter-content",
            "div[class*='chapter-content']",
            "div.chapter-inner",
            "div[class*='chapter-inner']",
        ];

        for (var i = 0; i < selectors.length; i++) {
            var matches = doc.querySelectorAll(selectors[i]);
            for (var j = 0; j < matches.length; j++) {
                if (this._scoreChapterContainer(matches[j]) > 0) {
                    return matches[j];
                }
            }
        }

        var allDivs = doc.querySelectorAll("div");
        var best = null;
        var bestScore = -1;
        for (var divIndex = 0; divIndex < allDivs.length; divIndex++) {
            var score = this._scoreChapterContainer(allDivs[divIndex]);
            if (score > bestScore) {
                best = allDivs[divIndex];
                bestScore = score;
            }
        }
        return best;
    },

    _absolutizeHtml: function(html, pageUrl) {
        if (!html) return "";
        return html.replace(/(href|src)=(['"])([^'"]+)\2/gi, function(_, attr, quote, value) {
            if (!value || value.indexOf("data:") === 0 || value.indexOf("javascript:") === 0 || value.indexOf("#") === 0) {
                return attr + "=" + quote + value + quote;
            }
            return attr + "=" + quote + cinder.resolveUrl(value, pageUrl) + quote;
        });
    },

    _sanitizeChapterHtml: function(html, pageUrl) {
        var cleaned = html || "";
        cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
        cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");
        cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
        return this._absolutizeHtml(cleaned, pageUrl);
    },

    _chapterTitleFromUrl: function(chapterUrl) {
        var match = String(chapterUrl || "").match(/\/chapter\/\d+\/([^/?#]+)/i);
        if (!match) return "Chapter";
        return this._decode(match[1].replace(/-/g, " "));
    },

    search: async function(query, page) {
        if (!query || !query.trim()) return [];
        var pageNumber = page && page > 0 ? page + 1 : 1;
        var url = "https://www.royalroad.com/fictions/search?globalFilters=true&title=" + encodeURIComponent(query.trim()) + "&page=" + pageNumber;
        var html = await this._fetchHtml(url);
        return this._extractSearchResults(html);
    },

    getBookChapters: async function(bookId) {
        var bookUrl = this._fictionUrlFromBookId(bookId);
        var extractChapters = function(doc) {
            var selectors = [
                "table tbody tr a[href*='/chapter/']",
                ".chapter-row a[href*='/chapter/']",
                "div[data-fiction-id] a[href*='/chapter/']",
                "a[href*='/chapter/']",
            ];
            var chapters = [];
            var seen = {};

            for (var selectorIndex = 0; selectorIndex < selectors.length; selectorIndex++) {
                var chapterLinks = doc.querySelectorAll(selectors[selectorIndex]);
                for (var i = 0; i < chapterLinks.length; i++) {
                    var chapterLink = chapterLinks[i];
                    var href = chapterLink.attr("href") || "";
                    if (!href) continue;
                    var chapterUrl = cinder.resolveUrl(href, bookUrl);
                    if (!/\/chapter\/\d+\//i.test(chapterUrl)) continue;
                    if (seen[chapterUrl]) continue;

                    var title = this._decode(chapterLink.text()) || this._chapterTitleFromUrl(chapterUrl);
                    if (!title) continue;

                    seen[chapterUrl] = true;
                    chapters.push({
                        id: chapterUrl,
                        title: title,
                        index: chapters.length + 1,
                        url: chapterUrl,
                    });
                }
                if (chapters.length) break;
            }

            return chapters;
        }.bind(this);

        var html = await this._fetchHtml(bookUrl);
        var chapters = extractChapters(cinder.parseHTML(html));

        if (!chapters.length) {
            var browserResponse = await cinder.fetchBrowser(bookUrl, {
                headers: this._headers(),
                timeout: 30000,
            });
            if (browserResponse && browserResponse.status === 200 && browserResponse.data) {
                chapters = extractChapters(cinder.parseHTML(browserResponse.data));
            }
        }

        if (!chapters.length) {
            throw new Error("Royal Road did not expose any chapter links for this fiction.");
        }

        return chapters;
    },

    getBookChapter: async function(chapterId) {
        var html = await this._fetchHtml(chapterId);
        var doc = cinder.parseHTML(html);
        var titleEl = doc.querySelector("h1") || doc.querySelector("title");
        var contentEl = this._findChapterContent(doc);
        if (!contentEl) {
            throw new Error("Failed to locate Royal Road chapter content.");
        }

        var title = this._decode(titleEl ? titleEl.text() : "") || this._chapterTitleFromUrl(chapterId);
        return {
            id: chapterId,
            title: title,
            url: chapterId,
            html: this._sanitizeChapterHtml(contentEl.html(), chapterId),
        };
    },
};



