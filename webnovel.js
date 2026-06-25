__cinderExport = {
    id: "webnovel",
    name: "WebNovel",
    version: "0.1.2-cinder",
    icon: "WN",
    description: "Search and read public chaptered web novels from WebNovel. Locked chapters are not bypassed.",
    contentType: "books",
    contentTypes: ["webnovel", "ebook"],
    contentSubtypes: ["webFiction", "lightNovel", "wuxia", "xianxia", "xuanhuan"],

    capabilities: {
        search: true,
        discover: false,
        download: false,
        resolve: false,
        bookChapters: true,
        manga: false,
    },

    BASE_URL: "https://m.webnovel.com",

    _headers: function(referer) {
        return {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": referer || this.BASE_URL + "/",
        };
    },

    _decode: function(text) {
        return cinder.normalizeText(String(text || ""));
    },

    _fetch: async function(url, options) {
        var attempts = options && options.retries ? options.retries : 1;
        var lastStatus = 0;
        var lastError = "";
        for (var attempt = 1; attempt <= attempts; attempt++) {
            try {
                var response = await cinder.fetch(url, {
                    headers: this._headers(options && options.referer),
                    timeout: options && options.timeout ? options.timeout : 30000,
                });
                lastStatus = response && response.status ? response.status : 0;
                if (response && response.status >= 200 && response.status < 300 && response.data != null) {
                    return response.data;
                }
            } catch (error) {
                lastError = error && error.message ? error.message : String(error || "");
            }

            if (attempt < attempts && typeof setTimeout === "function") {
                await new Promise(function(resolve) {
                    setTimeout(resolve, 350 * attempt);
                });
            }
        }

        throw new Error("WebNovel request failed" + (lastStatus ? " (HTTP " + lastStatus + ")" : "") + (lastError ? " (" + lastError + ")" : "") + ": " + url);
    },

    _fetchJson: async function(url, options) {
        var data = await this._fetch(url, options);
        if (typeof data === "string") {
            return JSON.parse(data);
        }
        return data;
    },

    _fetchHtml: async function(url, options) {
        var data = await this._fetch(url, options);
        return String(data || "");
    },

    _extractNextData: function(html) {
        var match = String(html || "").match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
        if (!match || !match[1]) {
            throw new Error("WebNovel page data was not found.");
        }
        return JSON.parse(match[1]);
    },

    _parseBookId: function(bookId) {
        var value = String(bookId || "").trim();
        if (!value) throw new Error("Missing WebNovel book ID.");

        var combined = value.match(/^([^:\/?#]+)::([^:\/?#]+)$/);
        if (combined) return combined[1];

        var urlMatch = value.match(/\/book\/(?:[^\/?#_]+_)?(\d+)/i);
        if (urlMatch) return urlMatch[1];

        var idMatch = value.match(/(\d{8,})/);
        if (idMatch) return idMatch[1];

        throw new Error("Invalid WebNovel book ID: " + bookId);
    },

    _parseChapterId: function(chapterId) {
        var value = String(chapterId || "").trim();
        if (!value) throw new Error("Missing WebNovel chapter ID.");

        var combined = value.match(/^([^:\/?#]+)::([^:\/?#]+)$/);
        if (combined) {
            return {
                bookId: combined[1],
                chapterId: combined[2],
            };
        }

        var urlMatch = value.match(/\/book\/(?:[^\/?#_]+_)?(\d+)\/(?:[^\/?#_]+_)?(\d+)/i);
        if (urlMatch) {
            return {
                bookId: urlMatch[1],
                chapterId: urlMatch[2],
            };
        }

        throw new Error("Invalid WebNovel chapter ID: " + chapterId);
    },

    _coverUrl: function(bookId, updateTime) {
        var url = "https://book-pic.webnovel.com/bookcover/" + encodeURIComponent(bookId) + "?imageMogr2/thumbnail/600.jpg";
        if (updateTime) {
            url += "&updateTime=" + encodeURIComponent(updateTime);
        }
        return url;
    },

    _bookUrl: function(bookId) {
        return this.BASE_URL + "/book/" + encodeURIComponent(bookId);
    },

    _catalogUrl: function(bookId) {
        return this.BASE_URL + "/book/" + encodeURIComponent(bookId) + "/catalog";
    },

    _searchPageUrl: function(query, pageIndex) {
        var url = this.BASE_URL + "/search?keywords=" + encodeURIComponent(query);
        if (pageIndex > 1) {
            url += "&pageIndex=" + encodeURIComponent(pageIndex);
        }
        return url;
    },

    _searchApiUrl: function(query, pageIndex) {
        return this.BASE_URL + "/go/pcm/search/result?keywords=" + encodeURIComponent(query) + "&pageIndex=" + pageIndex + "&type=novel&orderBy=1";
    },

    _contentUrl: function(bookId, chapterId) {
        return this.BASE_URL + "/go/pcm/chapter/getContent?bookId=" + encodeURIComponent(bookId) + "&chapterId=" + encodeURIComponent(chapterId);
    },

    _chapterPageUrl: function(bookId, chapterId) {
        return this._bookUrl(bookId) + "/" + encodeURIComponent(chapterId);
    },

    _bookResult: function(item) {
        var bookId = String(item.bookId || item.id || "").trim();
        if (!bookId) return null;
        var title = this._decode(item.bookName || item.name || item.title || bookId);
        var author = this._decode(item.authorName || item.author || "");
        var chapterCount = item.totalChapterNum || item.chapterNum || item.totalChapterCount || 0;
        return {
            id: bookId,
            title: title,
            author: author,
            cover: this._coverUrl(bookId, item.coverUpdateTime || item.coverUpdateTimeMS || ""),
            url: this._bookUrl(bookId),
            format: "epub",
            size: chapterCount ? String(chapterCount) + " chapters" : "",
            source: "WebNovel",
            extra: {
                bookId: bookId,
                description: this._decode(item.description || ""),
                category: this._decode(item.categoryName || ""),
                rating: item.totalScore || item.score || "",
                tags: item.tagInfo || item.tagInfos || [],
                chapterCount: chapterCount,
                updateTime: item.updateTime || "",
                firstChapterId: item.firstChapterId || "",
                publicOnly: true,
            },
        };
    },

    _resultsFromSearchItems: function(items) {
        var rawItems = Array.isArray(items) ? items : [];
        var results = [];
        var seen = {};
        for (var i = 0; i < rawItems.length; i++) {
            var result = this._bookResult(rawItems[i]);
            if (!result || seen[result.id]) continue;
            seen[result.id] = true;
            results.push(result);
        }
        return results;
    },

    _dateString: function(timestamp) {
        var value = Number(timestamp || 0);
        if (!value) return "";
        try {
            return new Date(value).toISOString();
        } catch (_) {
            return "";
        }
    },

    _isPublicChapter: function(chapter) {
        return chapter && Number(chapter.isAuth) === 1 && Number(chapter.isVip || 0) === 0 && Number(chapter.noArchive || 0) === 0;
    },

    _sanitizeChapterHtml: function(html) {
        var cleaned = String(html || "");
        cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
        cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");
        cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
        cleaned = cleaned.replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "");
        cleaned = cleaned.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
        cleaned = cleaned.replace(/javascript:/gi, "");
        return cleaned;
    },

    _chapterFromPageData: function(data, parsed) {
        var pageProps = data && data.props && data.props.initialProps && data.props.initialProps.pageProps;
        var serverChapter = pageProps &&
            pageProps.data &&
            pageProps.data.initChapterServer &&
            pageProps.data.initChapterServer.chapterInfo;
        if (serverChapter && String(serverChapter.chapterId || "") === String(parsed.chapterId)) {
            return serverChapter;
        }

        var entities = data && data.props && data.props.initialState && data.props.initialState.entities;
        var chapter = entities && entities.chapter && entities.chapter[parsed.chapterId];
        if (chapter) return chapter;
        return null;
    },

    _fetchChapterFromApi: async function(parsed) {
        var payload = await this._fetchJson(this._contentUrl(parsed.bookId, parsed.chapterId), {
            referer: this._chapterPageUrl(parsed.bookId, parsed.chapterId),
            timeout: 30000,
            retries: 2,
        });
        if (!payload || payload.code !== 0 || !payload.data || !payload.data.chapterInfo) {
            throw new Error("WebNovel chapter API returned no chapter data.");
        }
        return payload.data.chapterInfo;
    },

    _fetchChapterFromPage: async function(parsed) {
        var html = await this._fetchHtml(this._chapterPageUrl(parsed.bookId, parsed.chapterId), {
            referer: this._bookUrl(parsed.bookId),
            timeout: 30000,
            retries: 2,
        });
        var data = this._extractNextData(html);
        var chapter = this._chapterFromPageData(data, parsed);
        if (!chapter) {
            throw new Error("WebNovel chapter page returned no chapter data.");
        }
        return chapter;
    },

    _chapterResult: function(parsed, chapter) {
        if (!chapter || !this._isPublicChapter(chapter) || !Array.isArray(chapter.contents) || !chapter.contents.length) {
            throw new Error("This WebNovel chapter is locked or not publicly readable.");
        }

        var htmlParts = [];
        for (var i = 0; i < chapter.contents.length; i++) {
            var paragraph = chapter.contents[i] || {};
            if (!paragraph.content) continue;
            htmlParts.push(this._sanitizeChapterHtml(paragraph.content));
        }

        return {
            id: parsed.bookId + "::" + parsed.chapterId,
            title: "Chapter " + Number(chapter.chapterIndex || 0) + " - " + this._decode(chapter.chapterName || ""),
            url: this._chapterPageUrl(parsed.bookId, parsed.chapterId),
            index: Number(chapter.chapterIndex || 0),
            html: htmlParts.join("\n"),
        };
    },

    search: async function(query, page) {
        if (!query || !query.trim()) return [];
        var cleanQuery = query.trim();
        var pageIndex = Math.max(1, (page || 0) + 1);

        var pageError = null;
        try {
            var html = await this._fetchHtml(this._searchPageUrl(cleanQuery, pageIndex), {
                referer: this.BASE_URL + "/",
                timeout: 30000,
                retries: 2,
            });
            var data = this._extractNextData(html);
            var pageProps = data && data.props && data.props.initialProps && data.props.initialProps.pageProps;
            var pageItems = pageProps &&
                pageProps.rawData &&
                pageProps.rawData.bookInfo &&
                pageProps.rawData.bookInfo.bookItems;
            return this._resultsFromSearchItems(pageItems);
        } catch (error) {
            pageError = error;
        }

        try {
            var payload = await this._fetchJson(this._searchApiUrl(cleanQuery, pageIndex), {
                referer: this._searchPageUrl(cleanQuery, pageIndex),
                retries: 2,
            });
            var apiItems = payload && payload.data && payload.data.bookInfo && Array.isArray(payload.data.bookInfo.bookItems)
                ? payload.data.bookInfo.bookItems
                : [];
            return this._resultsFromSearchItems(apiItems);
        } catch (apiError) {
            throw new Error("WebNovel search failed. Page: " + (pageError && pageError.message ? pageError.message : pageError) + " API: " + (apiError && apiError.message ? apiError.message : apiError));
        }
    },

    getBookChapters: async function(bookId) {
        var parsedBookId = this._parseBookId(bookId);
        var html = await this._fetchHtml(this._catalogUrl(parsedBookId), {
            referer: this._bookUrl(parsedBookId),
            timeout: 45000,
        });
        var data = this._extractNextData(html);
        var entities = data && data.props && data.props.initialState && data.props.initialState.entities;
        var catalog = entities && entities.catalog && entities.catalog[parsedBookId];
        var volumes = entities && entities.volume;
        var chapterMap = entities && entities.chapter;

        if (!catalog || !Array.isArray(catalog.volumeItems) || !volumes || !chapterMap) {
            throw new Error("WebNovel catalog data was not found.");
        }

        var chapters = [];
        var lockedCount = 0;
        var seen = {};
        for (var volumeIndex = 0; volumeIndex < catalog.volumeItems.length; volumeIndex++) {
            var volume = volumes[catalog.volumeItems[volumeIndex]];
            if (!volume || !Array.isArray(volume.chapterItems)) continue;
            for (var chapterIndex = 0; chapterIndex < volume.chapterItems.length; chapterIndex++) {
                var chapterId = String(volume.chapterItems[chapterIndex] || "");
                var chapter = chapterMap[chapterId];
                if (!chapter || seen[chapterId]) continue;
                seen[chapterId] = true;

                if (!this._isPublicChapter(chapter)) {
                    lockedCount += 1;
                    continue;
                }

                var index = Number(chapter.chapterIndex || chapters.length + 1);
                chapters.push({
                    id: parsedBookId + "::" + chapterId,
                    title: "Chapter " + index + " - " + this._decode(chapter.chapterName || ""),
                    index: index,
                    sourceChapterIndex: index,
                    url: this._bookUrl(parsedBookId) + "/" + encodeURIComponent(chapterId),
                    datePublished: this._dateString(chapter.publishTime),
                });
            }
        }

        chapters.sort(function(a, b) {
            return (a.sourceChapterIndex || a.index || 0) - (b.sourceChapterIndex || b.index || 0);
        });

        for (var returnedIndex = 0; returnedIndex < chapters.length; returnedIndex++) {
            chapters[returnedIndex].index = returnedIndex + 1;
        }

        if (!chapters.length && lockedCount > 0) {
            throw new Error("WebNovel exposes this catalog, but all chapters are locked on the public web page.");
        }
        if (!chapters.length) {
            throw new Error("WebNovel did not expose any public chapters for this book.");
        }

        return chapters;
    },

    getBookChapter: async function(chapterId) {
        var parsed = this._parseChapterId(chapterId);
        var pageError = null;
        try {
            return this._chapterResult(parsed, await this._fetchChapterFromPage(parsed));
        } catch (error) {
            pageError = error;
        }

        try {
            return this._chapterResult(parsed, await this._fetchChapterFromApi(parsed));
        } catch (apiError) {
            throw new Error("WebNovel chapter fetch failed. Page: " + (pageError && pageError.message ? pageError.message : pageError) + " API: " + (apiError && apiError.message ? apiError.message : apiError));
        }
    },
};
