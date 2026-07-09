var ComicKFan = {};

ComicKFan.id = "comickfan";
ComicKFan.name = "ComicK Fanmade";
ComicKFan.version = "0.1.1-cinder";
ComicKFan.icon = "CK";
ComicKFan.description = "Read manga, manhwa, and manhua from ComicK Fanmade. No debrid required.";
ComicKFan.contentType = "manga";
ComicKFan.contentTypes = ["manga"];
ComicKFan.contentSubtypes = ["manga", "manhwa", "manhua"];
ComicKFan.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

ComicKFan.BASE_URL = "https://comickfan.com";

ComicKFan._headers = function(extra) {
  var headers = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,text/plain,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
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

ComicKFan._imageHeaders = function(referer) {
  return {
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": referer || this.BASE_URL + "/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
};

ComicKFan._decode = function(value) {
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

ComicKFan._stripTags = function(value) {
  return this._decode(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
};

ComicKFan._attr = function(html, name) {
  if (!html) return "";
  var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var re = new RegExp(escaped + "\\s*=\\s*[\"']([^\"']+)[\"']", "i");
  var match = String(html).match(re);
  return match ? this._decode(match[1]) : "";
};

ComicKFan._absUrl = function(value) {
  if (!value) return "";
  var url = this._decode(String(value).trim());
  if (!url || /^data:/i.test(url) || /^blob:/i.test(url)) return "";
  if (url.indexOf("//") === 0) return "https:" + url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.charAt(0) === "/") return this.BASE_URL + url;
  return this.BASE_URL + "/" + url.replace(/^\/+/, "");
};

ComicKFan._pathFromUrl = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  try {
    var parsed = new URL(raw.indexOf("http") === 0 ? raw : this.BASE_URL + raw);
    return parsed.pathname.replace(/\/+$/, "");
  } catch (e) {
    return raw.replace(this.BASE_URL, "").split(/[?#]/)[0].replace(/\/+$/, "");
  }
};

ComicKFan._slugFromId = function(value) {
  var path = this._pathFromUrl(value);
  var parts = path.split("/").filter(Boolean);
  if (parts[0] === "manga" && parts[1]) return parts[1];
  return parts.length ? parts[parts.length - 1] : String(value || "");
};

ComicKFan._titleFromSlug = function(value) {
  return this._slugFromId(value)
    .replace(/-/g, " ")
    .replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
};

ComicKFan._fetchText = async function(url, options) {
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
  if (!text) throw new Error("ComicK Fanmade request failed for " + url);
  return text;
};

ComicKFan._fetchJson = async function(url) {
  var res = await cinder.fetch(url, {
    headers: this._headers({ "Accept": "application/json, text/plain, */*" }),
    timeout: 30000,
  });
  if (!res || res.status < 200 || res.status >= 300) {
    throw new Error("ComicK Fanmade API failed with HTTP " + (res ? res.status : 0));
  }
  var text = typeof res.data === "string" ? res.data : JSON.stringify(res.data || {});
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("ComicK Fanmade API returned invalid JSON.");
  }
};

ComicKFan._advancedSearchUrl = function(query, page, sort, type) {
  var params = [
    ["genres", ""],
    ["status", ""],
    ["type", type || ""],
    ["sort", sort || ""],
    ["name", query || ""],
    ["page", String(page || 1)],
  ];
  return this.BASE_URL + "/advanced-search?" + params.map(function(pair) {
    return encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]);
  }).join("&");
};

ComicKFan._resultFromAnchor = function(href, block) {
  var url = this._absUrl(href);
  var slug = this._slugFromId(url);
  if (!slug) return null;
  var img = (block.match(/<img[\s\S]*?>/i) || [])[0] || "";
  var title = this._attr(img, "alt") || this._stripTags(block) || this._titleFromSlug(slug);
  var cover = this._absUrl(this._attr(img, "src") || this._attr(img, "data-src"));
  if (/thumb-default|thumb-loading/i.test(cover)) cover = "";
  return {
    id: slug,
    title: title,
    cover: cover || undefined,
    coverHeaders: cover ? this._imageHeaders(url) : undefined,
    url: url,
    source: this.name,
    format: "manga",
    contentType: "manga",
    contentTypes: ["manga"],
    contentSubtypes: ["manga"],
  };
};

ComicKFan._parseSearchHtml = function(html) {
  var results = [];
  var seen = {};
  var linkRe = /<a[^>]+href=["']([^"']*\/manga\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var match;
  while ((match = linkRe.exec(html)) !== null) {
    var result = this._resultFromAnchor(match[1], match[2] || "");
    if (!result || seen[result.id]) continue;
    seen[result.id] = true;
    results.push(result);
  }
  return results;
};

ComicKFan.search = async function(query, page) {
  var q = String(query || "").trim();
  if (!q) return [];
  if (/^https?:\/\//i.test(q) || q.indexOf("/manga/") === 0) {
    var slug = this._slugFromId(q);
    if (!slug) return [];
    var details = await this.getMangaDetails(slug);
    return [{
      id: slug,
      title: details.title,
      cover: details.cover,
      coverHeaders: details.coverHeaders,
      url: this.BASE_URL + "/manga/" + encodeURIComponent(slug),
      source: this.name,
      format: "manga",
      contentType: "manga",
      contentTypes: ["manga"],
      contentSubtypes: ["manga"],
    }];
  }
  var html = await this._fetchText(this._advancedSearchUrl(q, (page || 0) + 1, "", ""), {
    minWaitMs: 1200,
    maxWaitMs: 12000,
  });
  return this._parseSearchHtml(html);
};

ComicKFan._detailLabel = function(html, label) {
  var re = new RegExp("<div[^>]*class=[\"'][^\"']*flex-row[^\"']*gap-4[^\"']*[\"'][^>]*>[\\s\\S]*?<div[^>]*class=[\"'][^\"']*text-sm[^\"']*[\"'][^>]*>\\s*" + label + "\\s*<\\/div>[\\s\\S]*?<div[^>]*class=[\"'][^\"']*text-sm[^\"']*[\"'][^>]*>([\\s\\S]*?)<\\/div>", "i");
  var match = html.match(re);
  return match ? this._stripTags(match[1]) : "";
};

ComicKFan.getMangaDetails = async function(id) {
  var slug = this._slugFromId(id);
  var url = this.BASE_URL + "/manga/" + encodeURIComponent(slug);
  var html = await this._fetchText(url);
  var title = this._stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) || this._titleFromSlug(slug);
  var description =
    this._stripTags((html.match(/<div[^>]+class=["'][^"']*comic-content[^"']*desk[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1]) ||
    this._decode((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [])[1]) ||
    undefined;
  var coverBlock = (html.match(/<div[^>]+class=["'][^"']*thumb-cover[^"']*["'][^>]*>[\s\S]*?<img[\s\S]*?>/i) || [])[0] || "";
  var cover = this._absUrl(this._attr(coverBlock, "src") || this._attr(coverBlock, "data-src"));
  if (/thumb-default|thumb-loading/i.test(cover)) cover = "";
  return {
    id: slug,
    title: title,
    author: this._detailLabel(html, "Author") || undefined,
    artist: this._detailLabel(html, "Artist") || undefined,
    cover: cover || undefined,
    coverHeaders: cover ? this._imageHeaders(url) : undefined,
    description: description,
    status: this._statusFromText(this._detailLabel(html, "Status")),
    genres: this._parseGenres(html),
    format: "manga",
    contentType: "manga",
  };
};

ComicKFan._parseGenres = function(html) {
  var genres = [];
  var block = (html.match(/<div[^>]+class=["'][^"']*font-medium[^"']*["'][^>]*>\s*Genres\s*<\/div>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "";
  var re = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  var match;
  while ((match = re.exec(block)) !== null) {
    var name = this._stripTags(match[1]);
    if (name) genres.push(name);
  }
  return genres;
};

ComicKFan._statusFromText = function(value) {
  var text = String(value || "").toLowerCase();
  if (/complete|finished/.test(text)) return "completed";
  if (/hiatus/.test(text)) return "hiatus";
  if (/cancel/.test(text)) return "cancelled";
  if (/ongoing|releas|publishing/.test(text)) return "ongoing";
  return undefined;
};

ComicKFan._chapterNumber = function(value) {
  var num = parseFloat(String(value || "").replace(/chapter/i, "").trim());
  return Number.isFinite(num) ? num : 0;
};

ComicKFan.getChapters = async function(mangaId) {
  var slug = this._slugFromId(mangaId);
  var json = await this._fetchJson(this.BASE_URL + "/api/comics/" + encodeURIComponent(slug) + "/chapter-list?translation_group_id=");
  var items = json && Array.isArray(json.data) ? json.data : [];
  var chapters = [];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var hash = item.hash_id || item.hashId || "";
    var chapterText = item.chapter || item.number || "";
    if (!hash || !chapterText) continue;
    var chapterNumber = this._chapterNumber(chapterText) || i + 1;
    var id = "/manga/" + slug + "/chapter-" + encodeURIComponent(chapterText) + "-" + encodeURIComponent(hash);
    if (seen[id]) continue;
    seen[id] = true;
    var title = "Chapter " + String(chapterText);
    if (item.title && String(item.title).trim()) title += ": " + this._decode(item.title);
    chapters.push({
      id: id,
      title: title,
      chapterNumber: chapterNumber,
      dateUploaded: item.created_at || item.published_at || undefined,
      scanlator: Array.isArray(item.group_names) ? item.group_names.join(", ") : undefined,
    });
  }
  if (chapters.length === 0) throw new Error("ComicK Fanmade returned no chapters.");
  return chapters.sort(function(a, b) {
    return a.chapterNumber - b.chapterNumber;
  });
};

ComicKFan.getPages = async function(chapterId) {
  var path = this._pathFromUrl(chapterId);
  var url = this._absUrl(path);
  var html = await this._fetchText(url, {
    minWaitMs: 1200,
    maxWaitMs: 12000,
  });
  var pages = [];
  var seen = {};
  var imgRe = /<img\b[^>]*>/gi;
  var match;
  while ((match = imgRe.exec(html)) !== null) {
    var tag = match[0];
    if (!/loading=["']lazy["']/i.test(tag)) continue;
    var src = this._absUrl(this._attr(tag, "src") || this._attr(tag, "data-src"));
    var alt = this._attr(tag, "alt");
    var isReaderPage = /cdncmk\.com/i.test(src) || /\bpage\s+\d+\b/i.test(alt);
    if (!isReaderPage || !src || /thumb-default|thumb-loading|favicon|logo|profile-picture|icons\//i.test(src) || seen[src]) continue;
    seen[src] = true;
    pages.push({
      url: src,
      headers: this._imageHeaders(url),
    });
  }
  if (pages.length === 0) throw new Error("ComicK Fanmade returned no pages for this chapter.");
  return pages;
};

ComicKFan.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Popular", icon: "flame" },
    { id: "latest", title: "Latest Updates", icon: "time" },
    { id: "rating", title: "Top Rated", icon: "star" },
    { id: "manhwa", title: "Manhwa", icon: "book-open" },
    { id: "manhua", title: "Manhua", icon: "book-open" },
  ];
};

ComicKFan.getDiscoverItems = async function(sectionId, page) {
  var sort = "";
  var type = "";
  if (sectionId === "latest") sort = "latest";
  else if (sectionId === "rating") sort = "rating";
  else if (sectionId === "popular") sort = "bookmark";
  if (sectionId === "manhwa") type = "kr";
  if (sectionId === "manhua") type = "cn";
  try {
    var html = await this._fetchText(this._advancedSearchUrl("", (page || 0) + 1, sort, type), {
      minWaitMs: 1200,
      maxWaitMs: 12000,
    });
    return this._parseSearchHtml(html);
  } catch (e) {
    return [];
  }
};

ComicKFan.getSettings = function() {
  return [];
};

var _cinderExport = ComicKFan;
__cinderExport = ComicKFan;
if (typeof module !== "undefined") module.exports = ComicKFan;
