var BBato = {};

BBato.id = "bbato";
BBato.name = "BBato";
BBato.version = "1.0.4-cinder";
BBato.icon = "BB";
BBato.description = "Read manga, manhwa, and manhua from BBato.";
BBato.contentType = "manga";

BBato.contentTypes = ["manga"];
BBato.contentSubtypes = ["manga", "manhwa", "manhua"];
BBato.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

BBato.BASE_URL = "https://bbato.com";
BBato._coverCache = {};

BBato._headers = function(extra) {
  var headers = {
    "Referer": this.BASE_URL + "/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
  if (extra) {
    Object.keys(extra).forEach(function(k) {
      headers[k] = extra[k];
    });
  }
  return headers;
};

BBato._imageHeaders = function() {
  return {
    "Referer": this.BASE_URL + "/",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
};

BBato._decode = function(str) {
  if (!str) return "";
  return String(str)
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

BBato._stripTags = function(str) {
  return this._decode(String(str || "").replace(/<[^>]+>/g, " "));
};

BBato._absUrl = function(url) {
  if (!url) return "";
  if (url.indexOf("//") === 0) return "https:" + url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.charAt(0) === "/") return this.BASE_URL + url;
  return this.BASE_URL + "/" + url;
};

BBato._pathFromUrl = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  try {
    var parsed = new URL(raw.indexOf("http") === 0 ? raw : this.BASE_URL + raw);
    return parsed.pathname;
  } catch (e) {
    return raw.replace(this.BASE_URL, "").split(/[?#]/)[0];
  }
};

BBato._slugFromId = function(value) {
  var path = this._pathFromUrl(value);
  var parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(value || "");
};

BBato._attr = function(html, attr) {
  var re = new RegExp(attr + "\\s*=\\s*([\"'])(.*?)\\1", "i");
  var match = String(html || "").match(re);
  return match ? this._decode(match[2]) : "";
};

BBato._imageFromHtml = function(html) {
  return this._absUrl(this._attr(html, "data-src") || this._attr(html, "src"));
};

BBato._fetchText = async function(url, headers) {
  var res = await cinder.fetch(url, { headers: headers || this._headers(), timeout: 30000 });
  return String(res && res.data ? res.data : "");
};

BBato._mimeFromHeaders = function(headers) {
  var contentType = "";
  headers = headers || {};
  Object.keys(headers).some(function(key) {
    if (String(key).toLowerCase() === "content-type") {
      contentType = String(headers[key] || "").split(";")[0].trim();
      return true;
    }
    return false;
  });
  return /^image\//i.test(contentType) ? contentType : "image/webp";
};

BBato._coverPayload = async function(url) {
  if (!url) return { cover: "", coverHeaders: undefined };
  if (this._coverCache[url]) return this._coverCache[url];
  var payload = {
    cover: url,
    coverHeaders: this._imageHeaders(),
  };

  // Older Cinder builds do not pass custom image headers to cover renders.
  // Inline BBato thumbnails as data URIs so covers load without app changes.
  if (cinder && typeof cinder.fetchBase64 === "function") {
    try {
      var res = await cinder.fetchBase64(url, {
        headers: this._imageHeaders(),
        timeout: 15000,
      });
      if (res && res.status >= 200 && res.status < 300 && res.data) {
        payload = {
          cover: "data:" + this._mimeFromHeaders(res.headers) + ";base64," + res.data,
          coverHeaders: this._imageHeaders(),
        };
      }
    } catch (e) {
      // Keep the direct URL for newer Cinder builds that honor coverHeaders.
    }
  }

  this._coverCache[url] = payload;
  return payload;
};

BBato._parseListItems = async function(html) {
  var results = [];
  var seen = {};
  var re = /<div[^>]+class=["'][^"']*\bunit\b[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*\bunit\b|<\/main>|<\/section>|$)/gi;
  var match;
  while ((match = re.exec(html))) {
    var block = match[1];
    var hrefMatch =
      block.match(/<a[^>]+class=["'][^"']*\bposter\b[^"']*["'][^>]+href=["']([^"']+)["'][\s\S]*?<\/a>/i) ||
      block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
    if (!hrefMatch) continue;
    var href = this._absUrl(hrefMatch[1]);
    var path = this._pathFromUrl(href);
    if (!path || seen[path]) continue;

    var mangaPath = this._pathFromUrl(href);
    var escapedPath = mangaPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var title = "";
    var titleRe = new RegExp("<a[^>]+href=[\"'][^\"']*" + escapedPath + "[^\"']*[\"'][^>]*>([\\s\\S]*?)<\\/a>", "gi");
    var titleMatch;
    while ((titleMatch = titleRe.exec(block))) {
      title = this._stripTags(titleMatch[1]);
      if (title) break;
    }
    title = title || this._decode(this._attr((block.match(/<img[\s\S]*?>/i) || [])[0], "alt"));
    if (!title) continue;

    var imgTag = (block.match(/<img[\s\S]*?>/i) || [])[0] || "";
    seen[path] = true;
    var coverPayload = await this._coverPayload(this._imageFromHtml(imgTag));
    results.push({
      id: path,
      title: title,
      cover: coverPayload.cover,
      coverHeaders: coverPayload.coverHeaders,
      url: href,
      source: this.name,
      format: "manga",
      extra: {
        coverHeaders: coverPayload.coverHeaders,
      },
    });
  }
  return results;
};

BBato._status = function(value) {
  var s = String(value || "").toLowerCase();
  if (s.indexOf("ongoing") !== -1 || s.indexOf("releasing") !== -1) return "ongoing";
  if (s.indexOf("completed") !== -1) return "completed";
  if (s.indexOf("hiatus") !== -1) return "hiatus";
  if (s.indexOf("cancelled") !== -1 || s.indexOf("discontinued") !== -1) return "cancelled";
  return undefined;
};

BBato._metaValue = function(html, label) {
  var re = new RegExp("<div[^>]*>[\\s\\S]*?<span[^>]*>\\s*" + label + "\\s*<\\/span>([\\s\\S]*?)<\\/div>", "i");
  var match = String(html || "").match(re);
  return match ? this._stripTags(match[1]) : "";
};

BBato.search = async function(query, page) {
  var q = String(query || "").trim();
  if (!q) return [];

  if (/^https?:\/\//i.test(q) || q.charAt(0) === "/") {
    var details = await this.getMangaDetails(q);
    return [{
      id: details.id,
      title: details.title,
      author: details.author,
      cover: details.cover,
      coverHeaders: details.coverHeaders,
      description: details.description,
      url: this._absUrl(details.id),
      source: this.name,
      format: "manga",
      extra: {
        coverHeaders: details.coverHeaders,
        description: details.description,
      },
    }];
  }

  var url = this.BASE_URL + "/filter?keyword=" + encodeURIComponent(q);
  if ((page || 1) > 1) url += "&page=" + encodeURIComponent(String(page));
  var html = await this._fetchText(url);
  return await this._parseListItems(html);
};

BBato.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Popular", icon: "flame" },
    { id: "latest", title: "Latest Updates", icon: "time" },
  ];
};

BBato.getDiscoverItems = async function(sectionId, page) {
  var url;
  if (sectionId === "popular") {
    url = this.BASE_URL + "/";
  } else {
    url = this.BASE_URL + ((page || 1) <= 1 ? "/updated" : "/updated/page/" + encodeURIComponent(String(page)));
  }
  var html = await this._fetchText(url);
  return await this._parseListItems(html);
};

BBato.getMangaDetails = async function(id) {
  var path = this._pathFromUrl(id);
  var url = this._absUrl(path);
  var html = await this._fetchText(url);
  var title = this._stripTags((html.match(/<h1[^>]+itemprop=["']name["'][^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  if (!title) title = this._stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);

  var posterBlock = (html.match(/<div[^>]+class=["'][^"']*\bposter\b[^"']*["'][\s\S]*?<\/div>/i) || [])[0] || "";
  var imgTag = (posterBlock.match(/<img[\s\S]*?>/i) || html.match(/<img[\s\S]*?>/i) || [])[0] || "";
  var description = this._stripTags((html.match(/<div[^>]+class=["'][^"']*\bdescription\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
  var genres = this._metaValue(html, "Genres").split(",").map(function(g) { return g.trim(); }).filter(Boolean);

  var coverPayload = await this._coverPayload(this._imageFromHtml(imgTag));
  return {
    id: path,
    title: title || this._slugFromId(id),
    author: this._metaValue(html, "Author") || undefined,
    artist: this._metaValue(html, "Artist") || undefined,
    cover: coverPayload.cover,
    coverHeaders: coverPayload.coverHeaders,
    description: description,
    status: this._status(this._metaValue(html, "Status") || this._stripTags((html.match(/<div[^>]+class=["'][^"']*\binfo\b[^"']*["'][\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1])),
    genres: genres,
  };
};

BBato.getChapters = async function(mangaId) {
  var path = this._pathFromUrl(mangaId);
  var slug = this._slugFromId(path);
  if (!slug) throw new Error("Invalid BBato manga slug.");
  var url = this.BASE_URL + "/get-chapter-list?slug=" + encodeURIComponent(slug);
  var raw = await this._fetchText(url, this._headers({
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": this._absUrl(path),
  }));
  var json = JSON.parse(raw);
  var items = json && json.data ? json.data : [];
  return items.map(function(item, index) {
    var title = item.chapter_name || ("Chapter " + (items.length - index));
    var numberMatch = String(title).match(/([0-9]+(?:\.[0-9]+)?)/);
    return {
      id: "/read/" + slug + "/" + item.chapter_slug,
      title: title,
      chapterNumber: numberMatch ? parseFloat(numberMatch[1]) : items.length - index,
      dateUploaded: item.updated_at && Date.parse(item.updated_at)
        ? new Date(Date.parse(item.updated_at)).toISOString()
        : undefined,
    };
  }).sort(function(a, b) {
    return a.chapterNumber - b.chapterNumber;
  });
};

BBato.getPages = async function(chapterId) {
  var path = this._pathFromUrl(chapterId);
  var url = this._absUrl(path);
  var html = await this._fetchText(url, this._headers({ "Referer": this.BASE_URL + "/" }));
  var pages = [];
  var seen = {};
  var re = /<img[^>]+data-number=["']([0-9]+)["'][\s\S]*?>/gi;
  var match;
  while ((match = re.exec(html))) {
    var imgHtml = match[0];
    var src = this._imageFromHtml(imgHtml);
    if (!/\/[0-9]+(?:\.[a-z0-9]+)?(?:\?|$)/i.test(src)) continue;
    if (!src || seen[src]) continue;
    seen[src] = true;
    pages.push({ url: src, headers: this._imageHeaders() });
  }
  if (pages.length === 0) throw new Error("BBato returned no pages for this chapter.");
  return pages;
};

BBato.getSettings = function() {
  return [];
};

// Older Cinder builds request getBookDetails() on detail screens.
BBato.getBookDetails = BBato.getMangaDetails;

__cinderExport = BBato;

