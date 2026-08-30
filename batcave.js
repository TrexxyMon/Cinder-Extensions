var BatCave = {};

BatCave.id = "batcave";
BatCave.name = "BatCave";
BatCave.version = "0.2.1-cinder";
BatCave.icon = "BC";
BatCave.description = "Read western comics from BatCave. No debrid required.";
BatCave.contentType = "comics";
BatCave.contentTypes = ["comic"];
BatCave.contentSubtypes = ["westernComic"];
BatCave.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

BatCave.BASE_URL = "https://batcave.biz";
BatCave._htmlCache = {};
BatCave._htmlCacheTtlMs = 120000;

BatCave._headers = function(extra) {
  var headers = {
    "Referer": this.BASE_URL + "/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
  if (extra) {
    Object.keys(extra).forEach(function(key) {
      headers[key] = extra[key];
    });
  }
  return headers;
};

BatCave._browserHeaders = function(extra) {
  return this._headers(Object.assign({
    "X-Cinder-Suppress-Interactive": "1",
    "X-Cinder-Min-Wait-Ms": "750",
    "X-Cinder-Max-Wait-Ms": "18000",
  }, extra || {}));
};

BatCave._imageHeaders = function(imageUrl, referer) {
  var headers = {
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
  if (String(imageUrl || "").indexOf("batcave.biz") !== -1) {
    headers.Referer = referer || this.BASE_URL + "/";
  }
  return headers;
};

BatCave._decode = function(value) {
  if (!value) return "";
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

BatCave._stripTags = function(value) {
  return this._decode(String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
};

BatCave._normalizeDate = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return undefined;
  var parts = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (parts) {
    var month = String(Number(parts[2])).padStart(2, "0");
    var day = String(Number(parts[1])).padStart(2, "0");
    return parts[3] + "-" + month + "-" + day;
  }
  var parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().split("T")[0] : undefined;
};

BatCave._attr = function(html, attr) {
  var re = new RegExp(attr + "\\s*=\\s*([\"'])(.*?)\\1", "i");
  var match = String(html || "").match(re);
  return match ? this._decode(match[2]) : "";
};

BatCave._absUrl = function(value) {
  if (!value) return "";
  var url = this._decode(String(value).trim());
  if (!url || /^(?:blob|data|javascript):/i.test(url)) return "";
  if (url.indexOf("//") === 0) return "https:" + url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.charAt(0) === "/") return this.BASE_URL + url;
  return this.BASE_URL + "/" + url.replace(/^\/+/, "");
};

BatCave._pathFromUrl = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  try {
    var parsed = new URL(raw.indexOf("http") === 0 ? raw : this.BASE_URL + raw);
    return parsed.pathname + parsed.search;
  } catch (e) {
    return raw.replace(this.BASE_URL, "");
  }
};

BatCave._slugFromId = function(value) {
  var path = this._pathFromUrl(value).split("?")[0];
  var parts = path.split("/").filter(Boolean);
  if (parts[0] === "comix" && parts[1]) return parts[1];
  if (parts[0] === "comic" && parts[1]) return parts[1];
  return parts.length ? parts[parts.length - 1] : String(value || "");
};

BatCave._isProtectionPage = function(html) {
  var value = String(html || "");
  return (
    value.indexOf("/_c?") !== -1 ||
    value.indexOf('x.open("POST", "/_v"') !== -1 ||
    value.indexOf('params.push("pow_nonce="') !== -1 ||
    /DLE\s*Guard|site protection|Just a moment|Enable JavaScript and cookies to continue/i.test(value)
  );
};

BatCave._getCachedHtml = function(url) {
  var cached = this._htmlCache[url];
  if (!cached) return "";
  if (Date.now() - cached.savedAt > this._htmlCacheTtlMs) {
    delete this._htmlCache[url];
    return "";
  }
  return cached.html;
};

BatCave._setCachedHtml = function(url, html) {
  this._htmlCache[url] = {
    html: html,
    savedAt: Date.now(),
  };
  var keys = Object.keys(this._htmlCache);
  if (keys.length > 12) {
    keys.sort(function(a, b) {
      return BatCave._htmlCache[a].savedAt - BatCave._htmlCache[b].savedAt;
    });
    delete this._htmlCache[keys[0]];
  }
};

BatCave._fetchHtml = async function(url, options) {
  options = options || {};
  var res;
  if (cinder.fetchBrowser) {
    try {
      res = await cinder.fetchBrowser(url, {
        headers: this._browserHeaders(options.browserHeaders),
      });
      if (res && res.data && this._isProtectionPage(res.data)) {
        var retryHeaders = Object.assign({}, options.browserHeaders || {}, {
          "X-Cinder-Suppress-Interactive": "1",
          "X-Cinder-Visible-Layout": "1",
          "X-Cinder-Wake-Page": "1",
          "X-Cinder-Min-Wait-Ms": "1400",
          "X-Cinder-Max-Wait-Ms": "26000",
        });
        res = await cinder.fetchBrowser(url, {
          headers: this._browserHeaders(retryHeaders),
        });
      }
    } catch (browserError) {
      if (cinder.warn) cinder.warn("BatCave browser request failed; trying the standard request path.");
    }
  } else if (cinder.fetch) {
    res = await cinder.fetch(url, {
      headers: this._headers(options.headers),
      timeout: 30000,
    });
  }
  if ((!res || res.status !== 200 || !res.data) && cinder.fetch) {
    res = await cinder.fetch(url, {
      headers: this._headers(options.headers),
      timeout: 30000,
    });
  }
  if (!res || res.status !== 200 || !res.data) {
    throw new Error("BatCave request failed for " + url);
  }
  var html = String(res.data || "");
  if (this._isProtectionPage(html)) {
    throw new Error("BatCave site protection was not cleared by the browser bridge.");
  }
  return html;
};

BatCave._fetchCachedHtml = async function(url, options) {
  var cached = this._getCachedHtml(url);
  if (cached) return cached;
  var html = await this._fetchHtml(url, options);
  this._setCachedHtml(url, html);
  return html;
};

BatCave._extractData = function(html) {
  var raw = String(html || "");
  var markerIndex = raw.indexOf("window.__DATA__");
  if (markerIndex < 0) return null;
  var scriptEnd = raw.indexOf("</script>", markerIndex);
  var script = scriptEnd >= 0 ? raw.slice(markerIndex, scriptEnd) : raw.slice(markerIndex);
  var equalsIndex = script.indexOf("=");
  if (equalsIndex < 0) return null;
  var jsonText = script.slice(equalsIndex + 1).trim();
  if (jsonText.endsWith(";")) jsonText = jsonText.slice(0, -1).trim();
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    throw new Error("BatCave returned invalid embedded data.");
  }
};

BatCave._isSeriesId = function(value) {
  return /^\/\d+-[^?#]+\.html$/i.test(this._pathFromUrl(value).split("?")[0]);
};

BatCave._pushCard = function(items, seen, href, title, cover) {
  var url = this._absUrl(href);
  var id = this._pathFromUrl(url);
  if (!id || seen[id] || !this._isSeriesId(id)) return;
  seen[id] = true;
  var resolvedCover = this._absUrl(cover);
  items.push({
    id: id,
    title: this._decode(title) || this._slugFromId(id).replace(/-/g, " "),
    author: "Various",
    cover: resolvedCover,
    coverHeaders: resolvedCover ? this._imageHeaders(resolvedCover, url) : undefined,
    url: url,
    format: "comics",
    contentType: "comics",
  });
};

BatCave._parseCards = function(html) {
  var items = [];
  var seen = {};
  if (cinder.parseHTML) {
    var doc = cinder.parseHTML(html);
    var rows = doc.querySelectorAll("#dle-content > .readed, #dle-content .readed");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var link = row.querySelector(".readed__title > a") || row.querySelector("a[href]");
      if (!link) continue;
      var href = link.attr("href") || "";
      var img = row.querySelector("img");
      var cover = img ? (img.attr("data-src") || img.attr("src") || "") : "";
      this._pushCard(items, seen, href, link.text ? link.text() : "", cover);
    }

    var posters = doc.querySelectorAll("#dle-content .poster, main .poster");
    for (var j = 0; j < posters.length; j++) {
      var poster = posters[j];
      var posterLink = poster.tagName === "a" ? poster : poster.querySelector("a[href]");
      if (!posterLink) continue;
      var titleNode = poster.querySelector(".poster__title");
      var posterImg = poster.querySelector("img");
      this._pushCard(
        items,
        seen,
        posterLink.attr("href") || "",
        titleNode && titleNode.text ? titleNode.text() : "",
        posterImg ? (posterImg.attr("data-src") || posterImg.attr("src") || "") : "",
      );
    }
    if (items.length > 0) return items;
  }

  var readedRe = /<div[^>]+class=["'][^"']*\breaded\b[^"']*["'][\s\S]*?<img[\s\S]*?>[\s\S]*?<h2[^>]+class=["'][^"']*\breaded__title\b[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var readedMatch;
  while ((readedMatch = readedRe.exec(html)) !== null) {
    var readedTag = (readedMatch[0].match(/<img[\s\S]*?>/i) || [])[0] || "";
    this._pushCard(
      items,
      seen,
      readedMatch[1],
      this._stripTags(readedMatch[2]),
      this._attr(readedTag, "data-src") || this._attr(readedTag, "src"),
    );
  }

  var posterRe = /<a[^>]+class=["'][^"']*\bposter\b[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<img[\s\S]*?>[\s\S]*?<h3[^>]+class=["'][^"']*\bposter__title\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/gi;
  var posterMatch;
  while ((posterMatch = posterRe.exec(html)) !== null) {
    var posterTag = (posterMatch[0].match(/<img[\s\S]*?>/i) || [])[0] || "";
    this._pushCard(
      items,
      seen,
      posterMatch[1],
      this._stripTags(posterMatch[2]),
      this._attr(posterTag, "data-src") || this._attr(posterTag, "src"),
    );
  }
  return items;
};

BatCave.search = async function(query, page) {
  page = page || 0;
  var safeQuery = String(query || "").trim() || "batman";
  var url = this.BASE_URL + "/search/" + encodeURIComponent(safeQuery);
  if (page > 0) url += "/page/" + (page + 1) + "/";
  var html = await this._fetchHtml(url, {
    browserHeaders: {
      "X-Cinder-Wait-For-Selector": "#dle-content",
      "X-Cinder-Min-Wait-Ms": "600",
      "X-Cinder-Max-Wait-Ms": "18000",
    },
  });
  var items = this._parseCards(html);
  if (cinder.log) cinder.log("BatCave search results:", items.length, "query=", safeQuery);
  return items;
};

BatCave.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Popular Comics", icon: "flame" },
    { id: "latest", title: "Latest Updates", icon: "time" },
  ];
};

BatCave.getDiscoverItems = async function(sectionId, page) {
  page = page || 0;
  if (sectionId === "popular" && page > 0) return [];
  var url = sectionId === "popular" ? this.BASE_URL + "/watched/" : this.BASE_URL + "/comix/";
  if (sectionId !== "popular" && page > 0) url += "page/" + (page + 1) + "/";
  var html = await this._fetchHtml(url, {
    browserHeaders: {
      "X-Cinder-Wait-For-Selector": "#dle-content",
      "X-Cinder-Min-Wait-Ms": "600",
      "X-Cinder-Max-Wait-Ms": "18000",
    },
  });
  return this._parseCards(html);
};

BatCave.getMangaDetails = async function(id) {
  var path = this._pathFromUrl(id);
  var url = this._absUrl(path);
  var html = await this._fetchCachedHtml(url, {
    browserHeaders: {
      "X-Cinder-Wait-For-Selector": ".page__header",
      "X-Cinder-Min-Wait-Ms": "600",
      "X-Cinder-Max-Wait-Ms": "18000",
    },
  });

  var title = "";
  var cover = "";
  var description = "";
  var metadata = {};
  if (cinder.parseHTML) {
    var doc = cinder.parseHTML(html);
    var titleNode = doc.querySelector(".page__header h1");
    var coverNode = doc.querySelector(".page__poster img");
    var descriptionNode = doc.querySelector(".page__text");
    title = titleNode && titleNode.text ? titleNode.text() : "";
    cover = coverNode ? this._absUrl(coverNode.attr("src") || coverNode.attr("data-src") || "") : "";
    description = descriptionNode && descriptionNode.text ? descriptionNode.text() : "";
    var metadataRows = doc.querySelectorAll(".page__list li");
    for (var metadataIndex = 0; metadataIndex < metadataRows.length; metadataIndex++) {
      var metadataRow = metadataRows[metadataIndex];
      var metadataLabelNode = metadataRow.querySelector("div");
      var metadataLabel = metadataLabelNode && metadataLabelNode.text
        ? metadataLabelNode.text().replace(/:\s*$/, "").trim().toLowerCase()
        : "";
      var metadataText = metadataRow.text ? metadataRow.text() : "";
      if (metadataLabel) {
        metadata[metadataLabel] = metadataText
          .replace(metadataLabelNode.text(), "")
          .replace(/^\s*:\s*/, "")
          .trim();
      }
    }
  }
  if (!title) {
    title = this._stripTags((html.match(/<header[^>]+class=["'][^"']*\bpage__header\b[^"']*["'][\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  }
  if (!title) title = this._slugFromId(path).replace(/-/g, " ");
  if (!cover) {
    var poster = (html.match(/<div[^>]+class=["'][^"']*\bpage__poster\b[^"']*["'][\s\S]*?<\/div>/i) || [])[0] || "";
    var imgTag = (poster.match(/<img[\s\S]*?>/i) || [])[0] || "";
    cover = this._absUrl(this._attr(imgTag, "src") || this._attr(imgTag, "data-src"));
  }
  if (!description) {
    description = this._stripTags((html.match(/<div[^>]+class=["'][^"']*\bpage__text\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
  }

  function metaValue(label) {
    var parsedValue = metadata[String(label || "").toLowerCase()];
    if (parsedValue) return parsedValue;
    var re = new RegExp("<li[^>]*>[\\s\\S]*?<div[^>]*>\\s*" + label + "\\s*:?\\s*<\\/div>([\\s\\S]*?)<\\/li>", "i");
    return BatCave._stripTags((html.match(re) || [])[1]);
  }

  var genres = [];
  var tagRe = /<div[^>]+class=["'][^"']*\bpage__tags\b[^"']*["'][\s\S]*?<\/div>/i;
  var tagBlock = (html.match(tagRe) || [])[0] || "";
  var tagMatch;
  var linkRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  while ((tagMatch = linkRe.exec(tagBlock)) !== null) {
    var genre = this._stripTags(tagMatch[1]);
    if (genre) genres.push(genre);
  }
  if (genres.indexOf("Comic") === -1) genres.push("Comic");

  return {
    id: path,
    title: title,
    author: metaValue("Writer") || "Various",
    artist: metaValue("Artist") || undefined,
    description: description,
    cover: cover,
    coverHeaders: cover ? this._imageHeaders(cover, url) : undefined,
    genres: genres,
    status: /completed/i.test(metaValue("Release type")) ? "completed" : (/ongoing/i.test(metaValue("Release type")) ? "ongoing" : "unknown"),
    format: "comics",
    contentType: "comics",
  };
};

BatCave.getChapters = async function(mangaId) {
  var path = this._pathFromUrl(mangaId);
  var url = this._absUrl(path);
  var html = await this._fetchCachedHtml(url, {
    browserHeaders: {
      "X-Cinder-Wait-For-Selector": ".page__header",
      "X-Cinder-Min-Wait-Ms": "600",
      "X-Cinder-Max-Wait-Ms": "18000",
    },
  });
  var data = this._extractData(html);
  if (!data || !data.news_id || !Array.isArray(data.chapters)) {
    throw new Error("BatCave chapter data script not found.");
  }
  var seen = {};
  return data.chapters.map(function(chapter) {
    var chapterId = String(chapter && chapter.id || "").trim();
    if (!chapterId || seen[chapterId]) return null;
    seen[chapterId] = true;
    var number = Number(chapter.posi);
    if (!Number.isFinite(number)) {
      var numberMatch = String(chapter.title || "").match(/(?:#|issue\s*)(\d+(?:\.\d+)?)/i);
      number = numberMatch ? Number(numberMatch[1]) : 0;
    }
    return {
      id: "/reader/" + data.news_id + "/" + chapter.id + (data.xhash || ""),
      title: chapter.title || ("Issue #" + number),
      chapterNumber: number,
      dateUploaded: BatCave._normalizeDate(chapter.date),
    };
  }).filter(Boolean).sort(function(a, b) {
    if (a.chapterNumber === b.chapterNumber) return String(a.title).localeCompare(String(b.title));
    return a.chapterNumber - b.chapterNumber;
  });
};

BatCave.getPages = async function(chapterId) {
  var path = this._pathFromUrl(chapterId);
  var url = this._absUrl(path);
  var html = await this._fetchCachedHtml(url, {
    browserHeaders: {
      "X-Cinder-Wait-For-Selector": ".reader-root",
      "X-Cinder-Min-Wait-Ms": "600",
      "X-Cinder-Max-Wait-Ms": "18000",
    },
  });
  var data = this._extractData(html);
  if (!data || !Array.isArray(data.images)) {
    throw new Error("BatCave page data script not found.");
  }
  var seen = {};
  var pages = data.images.map(function(image) {
    var raw = typeof image === "string" ? image : (image && (image.url || image.src || image.link));
    var src = BatCave._absUrl(String(raw || "").trim());
    if (!src || seen[src]) return null;
    seen[src] = true;
    return {
      url: src,
      headers: BatCave._imageHeaders(src, url),
    };
  }).filter(Boolean);
  if (pages.length === 0) {
    throw new Error(data.broken ? "BatCave marks this chapter as unavailable." : "BatCave returned no pages for this chapter.");
  }
  return pages;
};

BatCave.getSettings = function() {
  return [];
};

// Older Cinder builds request getBookDetails() on detail screens.
BatCave.getBookDetails = BatCave.getMangaDetails;

__cinderExport = BatCave;
