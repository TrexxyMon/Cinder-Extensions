var MangaK = {};

MangaK.id = "mangak";
MangaK.name = "MangaK";
MangaK.version = "0.1.2-cinder";
MangaK.icon = "MK";
MangaK.description = "Read manga, manhwa, and manhua from MangaK. No debrid required.";
MangaK.contentType = "manga";
MangaK.contentTypes = ["manga"];
MangaK.contentSubtypes = ["manga", "manhwa", "manhua"];
MangaK.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

MangaK.BASE_URL = "https://mangak.io";
MangaK.API_URL = "https://api.mangak.io";

MangaK._headers = function(extra) {
  var headers = {
    "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": this.BASE_URL,
    "Referer": this.BASE_URL + "/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
  if (extra) {
    Object.keys(extra).forEach(function(key) {
      headers[key] = extra[key];
    });
  }
  return headers;
};

MangaK._imageHeaders = function(referer) {
  return {
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": referer || this.BASE_URL + "/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
};

MangaK._decode = function(value) {
  if (!value) return "";
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

MangaK._stripTags = function(value) {
  return this._decode(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
};

MangaK._absUrl = function(value) {
  if (!value) return "";
  var url = this._decode(String(value).trim()).replace(/\\\//g, "/");
  if (!url || /^data:/i.test(url) || /^blob:/i.test(url)) return "";
  if (url.indexOf("//") === 0) return "https:" + url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.charAt(0) === "/") return this.BASE_URL + url;
  return this.BASE_URL + "/" + url.replace(/^\/+/, "");
};

MangaK._looksLikePageImage = function(value) {
  var url = String(value || "");
  if (!url) return false;
  if (!/\.(?:jpe?g|png|webp|avif)(?:[?#].*)?$/i.test(url)) return false;
  if (/logo|banner|loading|loader|placeholder|blank|avatar|favicon|cover|thumb|svg/i.test(url)) return false;
  return /qvzr|mangak|cdn|uploads|images|\/r\/p\//i.test(url);
};

MangaK._collectPageImages = function(value, pages, seen) {
  if (!value) return;
  if (typeof value === "string") {
    var text = value.replace(/\\\//g, "/");
    var direct = this._absUrl(text);
    if (this._looksLikePageImage(direct) && !seen[direct]) {
      seen[direct] = true;
      pages.push(direct);
      return;
    }
    var match;
    var urlRe = /https?:\/\/[^"'\s<>]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'\s<>]*)?/gi;
    while ((match = urlRe.exec(text)) !== null) {
      var imageUrl = this._absUrl(match[0]);
      if (!this._looksLikePageImage(imageUrl) || seen[imageUrl]) continue;
      seen[imageUrl] = true;
      pages.push(imageUrl);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) this._collectPageImages(value[i], pages, seen);
    return;
  }
  if (typeof value === "object") {
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j++) this._collectPageImages(value[keys[j]], pages, seen);
  }
};

MangaK._pathFromUrl = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  var hash = raw.indexOf("#") >= 0 ? raw.slice(raw.indexOf("#")) : "";
  var pathPart = raw.split("#")[0];
  try {
    var parsed = new URL(pathPart.indexOf("http") === 0 ? pathPart : this.BASE_URL + pathPart);
    return parsed.pathname.replace(/\/+$/, "") + hash;
  } catch (e) {
    return pathPart.replace(this.BASE_URL, "").split(/[?#]/)[0].replace(/\/+$/, "") + hash;
  }
};

MangaK._slugFromId = function(value) {
  var path = this._pathFromUrl(value).split("#")[0];
  var parts = path.split("/").filter(Boolean);
  return parts.length ? parts[0] : String(value || "").split("#")[0].replace(/^\/+/, "");
};

MangaK._titleFromSlug = function(value) {
  return this._slugFromId(value)
    .replace(/-/g, " ")
    .replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
};

MangaK._idFromMangaId = function(value) {
  var raw = String(value || "");
  var hash = raw.indexOf("#") >= 0 ? raw.split("#").pop() : "";
  return hash && hash !== raw ? hash : "";
};

MangaK._fetchText = async function(url, options) {
  options = options || {};
  var res;
  try {
    res = await cinder.fetch(url, {
      headers: this._headers(options.headers),
      timeout: options.timeout || 30000,
    });
  } catch (e) {
    res = null;
  }
  var text = res && res.status >= 200 && res.status < 300 ? String(res.data || "") : "";
  if ((!text || /cf-challenge|turnstile|just a moment|checking your browser/i.test(text)) && cinder.fetchBrowser) {
    res = await cinder.fetchBrowser(url, {
      headers: this._headers({
        "X-Cinder-Suppress-Interactive": "1",
        "X-Cinder-Wake-Page": "1",
        "X-Cinder-Min-Wait-Ms": String(options.minWaitMs || 1200),
        "X-Cinder-Max-Wait-Ms": String(options.maxWaitMs || 12000),
      }),
      timeout: options.timeout || 30000,
    });
    text = res && res.status >= 200 && res.status < 300 ? String(res.data || "") : "";
  }
  if (!text) throw new Error("MangaK request failed for " + url);
  return text;
};

MangaK._fetchJson = async function(url) {
  var text = await this._fetchText(url, {
    headers: { "Accept": "application/json, text/plain, */*" },
    timeout: 30000,
  });
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("MangaK returned invalid JSON.");
  }
};

MangaK._nextData = function(html) {
  var match = String(html || "").match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(this._decode(match[1]));
  } catch (e) {
    try {
      return JSON.parse(match[1]);
    } catch (ignored) {
      return null;
    }
  }
};

MangaK._query = function(params) {
  var out = [];
  Object.keys(params).forEach(function(key) {
    var value = params[key];
    if (value === undefined || value === null || value === "") return;
    out.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
  });
  return out.join("&");
};

MangaK._resultFromItem = function(item) {
  if (!item) return null;
  var id = item.id || "";
  var path = item.url || (item.slug ? "/" + item.slug : "");
  var slug = this._slugFromId(path);
  if (!id || !slug) return null;
  var cover = this._absUrl(item.cover || "");
  var subtypes = this._subtypes(item);
  return {
    id: "/" + slug + "#" + id,
    title: this._decode(item.name || slug.replace(/-/g, " ")),
    author: item.authors && Array.isArray(item.authors) ? item.authors.map(function(a) { return a.name; }).join(", ") : undefined,
    cover: cover || undefined,
    coverHeaders: cover ? this._imageHeaders(this.BASE_URL + "/" + slug) : undefined,
    description: item.summary ? this._stripTags(item.summary) : undefined,
    url: this.BASE_URL + "/" + slug,
    source: this.name,
    format: "manga",
    contentType: "manga",
    contentTypes: ["manga"],
    contentSubtypes: subtypes,
    extra: {
      mangakId: id,
      slug: slug,
    },
  };
};

MangaK._subtypes = function(item) {
  var text = JSON.stringify(item || {}).toLowerCase();
  if (text.indexOf("manhwa") !== -1) return ["manhwa"];
  if (text.indexOf("manhua") !== -1) return ["manhua"];
  return ["manga"];
};

MangaK.search = async function(query, page) {
  var q = String(query || "").trim();
  if (!q) return [];
  if (/^https?:\/\//i.test(q) || q.charAt(0) === "/") {
    var details = await this.getMangaDetails(q);
    var slug = this._slugFromId(q);
    var id = this._idFromMangaId(q);
    return [{
      id: "/" + slug + (id ? "#" + id : ""),
      title: details.title,
      cover: details.cover,
      coverHeaders: details.coverHeaders,
      url: this.BASE_URL + "/" + slug,
      source: this.name,
      format: "manga",
      contentType: "manga",
      contentTypes: ["manga"],
      contentSubtypes: ["manga"],
    }];
  }
  var filtered = q.replace(/[^\p{L}\p{N} ]/gu, " ").trim().slice(0, 50);
  var url = this.API_URL + "/titles/search?" + this._query({
    page: (page || 0) + 1,
    limit: 24,
    q: filtered,
  });
  var json = await this._fetchJson(url);
  var items = json && json.data && Array.isArray(json.data.items) ? json.data.items : [];
  var out = [];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var result = this._resultFromItem(items[i]);
    if (!result || seen[result.id]) continue;
    seen[result.id] = true;
    out.push(result);
  }
  return out;
};

MangaK.getMangaDetails = async function(id) {
  var slug = this._slugFromId(id);
  var url = this.BASE_URL + "/" + slug;
  var html = await this._fetchText(url, { minWaitMs: 1200, maxWaitMs: 12000 });
  var next = this._nextData(html);
  var manga = next && next.props && next.props.pageProps && next.props.pageProps.initialManga;
  if (!manga) throw new Error("Could not find MangaK details.");
  var cover = this._absUrl(manga.cover || "");
  var description = manga.summary ? this._stripTags(manga.summary) : undefined;
  return {
    id: "/" + slug + "#" + manga.id,
    title: this._decode(manga.name || this._titleFromSlug(slug)),
    author: Array.isArray(manga.authors) ? manga.authors.map(function(a) { return a.name; }).join(", ") : undefined,
    cover: cover || undefined,
    coverHeaders: cover ? this._imageHeaders(url) : undefined,
    description: description,
    status: this._statusFromText(manga.status),
    genres: Array.isArray(manga.genres) ? manga.genres.map(function(g) { return g.name; }).filter(Boolean) : [],
    format: "manga",
    contentType: "manga",
  };
};

MangaK._statusFromText = function(value) {
  var text = String(value || "").toLowerCase();
  if (/complete|finished/.test(text)) return "completed";
  if (/hiatus/.test(text)) return "hiatus";
  if (/cancel/.test(text)) return "cancelled";
  if (/ongoing|releas|publishing/.test(text)) return "ongoing";
  return undefined;
};

MangaK._chapterNumberFromItem = function(item, fallback) {
  var title = this._decode((item && item.name) || "");
  var path = String((item && item.url) || "");
  var candidates = [title, path];
  for (var i = 0; i < candidates.length; i++) {
    var text = candidates[i] || "";
    var match =
      text.match(/chapter[\s_-]*(\d+(?:\.\d+)?)/i) ||
      text.match(/ch[\s._-]*(\d+(?:\.\d+)?)/i);
    if (match) {
      var parsed = parseFloat(match[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  var apiNumber = parseFloat((item && (item.chapter || item.chapterNumber)) || "");
  if (Number.isFinite(apiNumber)) return apiNumber;
  return fallback;
};

MangaK.getChapters = async function(mangaId) {
  var id = this._idFromMangaId(mangaId);
  var slug = this._slugFromId(mangaId);
  if (!id) {
    var details = await this.getMangaDetails(mangaId);
    id = this._idFromMangaId(details.id);
  }
  if (!id) throw new Error("Could not find MangaK title ID.");
  var json = await this._fetchJson(this.API_URL + "/titles/" + encodeURIComponent(id) + "/chapters?cv=" + Date.now());
  var items = json && json.data && Array.isArray(json.data.chapters) ? json.data.chapters : [];
  var chapters = [];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var path = item.url || "";
    if (!path) continue;
    var chapterNumber = this._chapterNumberFromItem(item, i + 1);
    var chapterId = this._pathFromUrl(path);
    if (seen[chapterId]) continue;
    seen[chapterId] = true;
    chapters.push({
      id: chapterId,
      title: this._decode(item.name || ("Chapter " + chapterNumber)),
      chapterNumber: chapterNumber,
      dateUploaded: item.updated_at || undefined,
    });
  }
  if (chapters.length === 0) throw new Error("MangaK returned no chapters.");
  return chapters.sort(function(a, b) {
    return a.chapterNumber - b.chapterNumber;
  });
};

MangaK.getPages = async function(chapterId) {
  var path = this._pathFromUrl(chapterId).split("#")[0];
  var url = this._absUrl(path);
  var html = await this._fetchText(url, { minWaitMs: 1200, maxWaitMs: 12000 });
  var next = this._nextData(html);
  var chapter = next && next.props && next.props.pageProps && next.props.pageProps.initialChapter;
  var images = chapter && Array.isArray(chapter.images) ? chapter.images : [];
  var imageUrls = [];
  var seen = {};
  for (var i = 0; i < images.length; i++) {
    var imageUrl = this._absUrl(images[i]);
    if (!this._looksLikePageImage(imageUrl) || seen[imageUrl]) continue;
    seen[imageUrl] = true;
    imageUrls.push(imageUrl);
  }
  if (imageUrls.length === 0 && chapter) {
    this._collectPageImages(chapter, imageUrls, seen);
  }
  if (imageUrls.length === 0 && next && next.props && next.props.pageProps) {
    this._collectPageImages(next.props.pageProps, imageUrls, seen);
  }
  if (imageUrls.length === 0) {
    this._collectPageImages(html, imageUrls, seen);
  }
  var pages = imageUrls.map(function(imageUrl) {
    return {
      url: imageUrl,
      headers: MangaK._imageHeaders(url),
    };
  });
  if (pages.length === 0) throw new Error("MangaK returned no pages for this chapter.");
  return pages;
};

MangaK.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Popular This Week", icon: "flame" },
    { id: "latest", title: "Latest Updates", icon: "time" },
    { id: "newest", title: "Recently Added", icon: "new" },
    { id: "rating", title: "Highest Rating", icon: "star" },
    { id: "manhwa", title: "Manhwa", icon: "book-open" },
    { id: "manhua", title: "Manhua", icon: "book-open" },
  ];
};

MangaK.getDiscoverItems = async function(sectionId, page) {
  var params = {
    page: (page || 0) + 1,
    limit: 24,
  };
  if (sectionId === "latest") params.sort = "latest";
  else if (sectionId === "newest") params.sort = "newest";
  else if (sectionId === "rating") params.sort = "rating";
  else if (sectionId === "manhwa") params.type = "manhwa";
  else if (sectionId === "manhua") params.type = "manhua";
  else {
    params.sort = "popular";
    params.window = "week";
  }
  try {
    var json = await this._fetchJson(this.API_URL + "/titles/search?" + this._query(params));
    var items = json && json.data && Array.isArray(json.data.items) ? json.data.items : [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var result = this._resultFromItem(items[i]);
      if (result) out.push(result);
    }
    return out;
  } catch (e) {
    return [];
  }
};

MangaK.getSettings = function() {
  return [];
};

__cinderExport = MangaK;
if (typeof module !== "undefined") module.exports = MangaK;
