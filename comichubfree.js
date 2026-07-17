var ComicHubFree = {};

ComicHubFree.id = "comichubfree";
ComicHubFree.name = "ComicHubFree";
ComicHubFree.version = "0.1.2-cinder";
ComicHubFree.icon = "CHF";
ComicHubFree.description = "Read western comics from ComicHubFree.";
ComicHubFree.contentType = "comics";
ComicHubFree.contentTypes = ["comic"];
ComicHubFree.contentSubtypes = ["westernComic"];
ComicHubFree.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

ComicHubFree.BASE_URL = "https://comichubfree.com";

ComicHubFree._headers = function(extra) {
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

ComicHubFree._imageHeaders = function(referer) {
  return {
    "Referer": referer || this.BASE_URL + "/",
    "Accept": "image/jpeg,image/png,image/webp,image/*,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
};

ComicHubFree._decode = function(value) {
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

ComicHubFree._stripTags = function(value) {
  return this._decode(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
};

ComicHubFree._attr = function(html, attr) {
  var re = new RegExp(attr + "\\s*=\\s*([\"'])(.*?)\\1", "i");
  var match = String(html || "").match(re);
  return match ? this._decode(match[2]) : "";
};

ComicHubFree._absUrl = function(value) {
  if (!value) return "";
  var url = this._decode(String(value).trim());
  if (!url || /^data:/i.test(url)) return "";
  if (url.indexOf("//") === 0) return "https:" + url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.charAt(0) === "/") return this.BASE_URL + url;
  return this.BASE_URL + "/" + url.replace(/^\/+/, "");
};

ComicHubFree._pathFromUrl = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  try {
    var parsed = new URL(raw.indexOf("http") === 0 ? raw : this.BASE_URL + raw);
    return parsed.pathname;
  } catch (e) {
    return raw.replace(this.BASE_URL, "").split(/[?#]/)[0];
  }
};

ComicHubFree._fetchText = async function(url, headers) {
  var res = await cinder.fetch(url, {
    headers: headers || this._headers(),
    timeout: 30000,
  });
  if (!res || res.status < 200 || res.status >= 300 || !res.data) {
    throw new Error("ComicHubFree request failed for " + url);
  }
  return String(res.data || "");
};

ComicHubFree._imageFromHtml = function(html) {
  var dataSrc = this._attr(html, "data-src");
  var dataOriginal = this._attr(html, "data-original");
  var dataLazy = this._attr(html, "data-lazy");
  var src = this._attr(html, "src");
  return this._absUrl(dataSrc) || this._absUrl(dataOriginal) || this._absUrl(dataLazy) || this._absUrl(src);
};

ComicHubFree._isLiveImage = async function(url, headers) {
  try {
    var res = await cinder.fetch(url, {
      method: "HEAD",
      headers: headers,
      timeout: 8000,
    });
    if (!res || res.status === 0) return true;
    if (res.status < 200 || res.status >= 300) return false;
    var contentType = "";
    var responseHeaders = res.headers || {};
    Object.keys(responseHeaders).forEach(function(key) {
      if (key.toLowerCase() === "content-type") contentType = String(responseHeaders[key] || "");
    });
    return !contentType || /^image\//i.test(contentType);
  } catch (error) {
    return true;
  }
};

ComicHubFree._filterLivePages = async function(pages) {
  var filtered = [];
  var batchSize = 6;
  for (var i = 0; i < pages.length; i += batchSize) {
    var batch = pages.slice(i, i + batchSize);
    var checks = await Promise.all(batch.map(async function(page) {
      return {
        page: page,
        live: await ComicHubFree._isLiveImage(page.url, page.headers),
      };
    }));
    checks.forEach(function(result) {
      if (result.live) filtered.push(result.page);
    });
  }
  return filtered;
};

ComicHubFree._titleFromPath = function(path) {
  var parts = this._pathFromUrl(path).split("/").filter(Boolean);
  var slug = parts.length ? parts[parts.length - 1] : String(path || "");
  return slug.replace(/-/g, " ").replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
};

ComicHubFree._numberFromText = function(value) {
  var match = String(value || "").match(/(?:issue|chapter|#)\s*#?\s*([0-9]+(?:\.[0-9]+)?)/i) ||
    String(value || "").match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? parseFloat(match[1]) : 0;
};

ComicHubFree._parseList = function(html) {
  var results = [];
  var seen = {};
  var re = /<div[^>]+class=["'][^"']*\bcartoon-box\b[^"']*["'][\s\S]*?(?=<div[^>]+class=["'][^"']*\bcartoon-box\b|<ul[^>]+class=["'][^"']*\bpagination\b|<\/main>|<\/section>|$)/gi;
  var match;
  while ((match = re.exec(html)) !== null) {
    var block = match[0];
    if (block.indexOf("detail") === -1) continue;
    var linkMatch =
      block.match(/<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*\bimage\b[^"']*["'][\s\S]*?>/i) ||
      block.match(/<a[^>]+class=["'][^"']*\bimage\b[^"']*["'][^>]+href=["']([^"']+)["'][\s\S]*?>/i) ||
      block.match(/<a[^>]+href=["']([^"']*\/comic\/[^"']+)["'][\s\S]*?>/i);
    if (!linkMatch) continue;
    var url = this._absUrl(linkMatch[1]);
    var path = this._pathFromUrl(url);
    if (!path || seen[path]) continue;
    seen[path] = true;

    var title = this._stripTags((block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || [])[1]);
    if (!title) title = this._decode(this._attr((block.match(/<img[\s\S]*?>/i) || [])[0], "alt"));
    if (!title) title = this._titleFromPath(path);
    var imgTag = (block.match(/<img[\s\S]*?>/i) || [])[0] || "";
    var cover = this._imageFromHtml(imgTag);
    results.push({
      id: path,
      title: title,
      author: "Various",
      cover: cover,
      coverHeaders: cover ? this._imageHeaders(url) : undefined,
      url: url,
      format: "comics",
      contentType: "comics",
    });
  }
  return results;
};

ComicHubFree._hasNextPage = function(html) {
  return /<ul[^>]+class=["'][^"']*\bpagination\b[\s\S]*?<a[^>]+rel=["']next["'][^>]*(?!hidden)/i.test(html);
};

ComicHubFree.search = async function(query, page) {
  page = (page || 0) + 1;
  var url = this.BASE_URL + "/search-comic?key=" + encodeURIComponent(String(query || "").trim()) + "&page=" + page;
  var html = await this._fetchText(url);
  return this._parseList(html);
};

ComicHubFree.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Popular Comics", icon: "flame" },
    { id: "latest", title: "Latest Updates", icon: "time" },
  ];
};

ComicHubFree.getDiscoverItems = async function(sectionId, page) {
  var pageNumber = (page || 0) + 1;
  var path = sectionId === "latest" ? "/new-comic" : "/popular-comic";
  var html = await this._fetchText(this.BASE_URL + path + "?page=" + pageNumber);
  return this._parseList(html);
};

ComicHubFree.getMangaDetails = async function(id) {
  var path = this._pathFromUrl(id);
  var url = this._absUrl(path);
  var html = await this._fetchText(url);
  var info = (html.match(/<div[^>]+class=["'][^"']*\bmovie-info\b[^"']*["'][\s\S]*?(?=<div[^>]+class=["'][^"']*\bepisode-list\b|<\/main>|$)/i) || [])[0] || html;
  var seriesInfo = (info.match(/<div[^>]+class=["'][^"']*\bseries-info\b[^"']*["'][\s\S]*?<\/div>/i) || [])[0] || info;
  var description = this._stripTags((info.match(/<div[^>]+id=["']film-content["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
  var imageTag = (seriesInfo.match(/<img[\s\S]*?>/i) || [])[0] || "";
  var cover = this._imageFromHtml(imageTag);
  var title = this._stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) || this._titleFromPath(path);

  function meta(label) {
    var re = new RegExp("<dt[^>]*>\\s*" + label + "\\s*:?\\s*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>", "i");
    return ComicHubFree._stripTags((seriesInfo.match(re) || [])[1]);
  }

  var statusText = meta("Status");
  var status = /completed/i.test(statusText) ? "completed" : (/ongoing/i.test(statusText) ? "ongoing" : "unknown");
  return {
    id: path,
    title: title,
    author: meta("Authors") || "Various",
    description: description,
    cover: cover,
    coverHeaders: cover ? this._imageHeaders(url) : undefined,
    status: status,
    genres: ["Comic"],
    format: "comics",
    contentType: "comics",
  };
};

ComicHubFree.getChapters = async function(mangaId) {
  var path = this._pathFromUrl(mangaId);
  var url = this._absUrl(path);
  var html = await this._fetchText(url);
  var chapters = [];
  var seen = {};
  var rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  var rowMatch;
  var sourceIndex = 0;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    var row = rowMatch[1];
    if (row.indexOf("<a") === -1) continue;
    var linkMatch = row.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    var chapterUrl = this._absUrl(linkMatch[1]);
    var chapterPath = this._pathFromUrl(chapterUrl);
    if (!chapterPath || seen[chapterPath]) continue;
    seen[chapterPath] = true;
    var title = this._stripTags(linkMatch[2]) || this._titleFromPath(chapterPath);
    var chapterNumber = this._numberFromText(title);
    var date = this._stripTags((row.match(/<td[^>]*>\s*([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4})\s*<\/td>/i) || [])[1]);
    chapters.push({
      id: chapterPath,
      title: title,
      chapterNumber: chapterNumber,
      dateUploaded: date || undefined,
      _sourceIndex: sourceIndex++,
    });
  }
  if (chapters.length === 0) throw new Error("ComicHubFree returned no chapters.");
  return chapters.sort(function(a, b) {
    var aNum = a.chapterNumber > 0 ? a.chapterNumber : Number.POSITIVE_INFINITY;
    var bNum = b.chapterNumber > 0 ? b.chapterNumber : Number.POSITIVE_INFINITY;
    if (aNum !== bNum) return aNum - bNum;
    return a._sourceIndex - b._sourceIndex;
  }).map(function(chapter) {
    delete chapter._sourceIndex;
    return chapter;
  });
};

ComicHubFree.getPages = async function(chapterId) {
  var path = this._pathFromUrl(chapterId);
  var chapterUrl = this._absUrl(path);
  var allUrl = chapterUrl.replace(/\/$/, "") + "/all";
  var html = await this._fetchText(allUrl, this._headers({ "Referer": chapterUrl }));
  var pages = [];
  var seen = {};
  var imgRe = /<img[^>]+class=["'][^"']*\bchapter_img\b[^"']*["'][\s\S]*?>/gi;
  var match;
  while ((match = imgRe.exec(html)) !== null) {
    var src = this._imageFromHtml(match[0]);
    if (!src || seen[src]) continue;
    seen[src] = true;
    pages.push({
      url: src,
      headers: this._imageHeaders(allUrl),
    });
  }
  pages = await this._filterLivePages(pages);
  if (pages.length === 0) throw new Error("ComicHubFree returned no pages for this chapter.");
  return pages;
};

ComicHubFree.getSettings = function() {
  return [];
};

__cinderExport = ComicHubFree;
