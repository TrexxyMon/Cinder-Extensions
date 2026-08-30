var AsuraScans = {};

AsuraScans.id = "asurascans";
AsuraScans.name = "Asura Scans";
AsuraScans.version = "0.1.1-cinder";
AsuraScans.icon = "AS";
AsuraScans.description = "Read manga, manhwa, and manhua from Asura Scans.";
AsuraScans.contentType = "manga";
AsuraScans.contentTypes = ["manga"];
AsuraScans.contentSubtypes = ["manga", "manhwa", "manhua"];
AsuraScans.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

AsuraScans.BASE_URL = "https://asurascans.com";
AsuraScans.API_URL = "https://api.asurascans.com/api";
AsuraScans.PAGE_LIMIT = 20;
AsuraScans._coverCache = {};

AsuraScans._headers = function(extra) {
  var headers = {
    "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

AsuraScans._imageHeaders = function(referer) {
  return this._headers({
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Referer": referer || this.BASE_URL + "/",
  });
};

AsuraScans._decode = function(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
};

AsuraScans._stripTags = function(value) {
  return this._decode(String(value || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

AsuraScans._pathFromUrl = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  try {
    var parsed = new URL(raw.indexOf("http") === 0 ? raw : this.BASE_URL + raw);
    return parsed.pathname.replace(/\/+$/, "") || "/";
  } catch (e) {
    return raw.replace(this.BASE_URL, "").split(/[?#]/)[0].replace(/\/+$/, "");
  }
};

AsuraScans._absUrl = function(value) {
  if (!value) return "";
  if (String(value).indexOf("//") === 0) return "https:" + value;
  if (/^https?:\/\//i.test(String(value))) return String(value).replace(/^http:\/\//i, "https://");
  if (String(value).charAt(0) === "/") return this.BASE_URL + value;
  return this.BASE_URL + "/" + String(value).replace(/^\/+/, "");
};

AsuraScans._seriesSlugFromId = function(value) {
  var raw = String(value || "").trim();
  var path = this._pathFromUrl(raw);
  var parts = path.split("/").filter(Boolean);
  if (parts[0] === "series" && parts[1]) return parts[1];
  if (parts[0] === "manga" && parts[1]) return parts[1].replace(/^\d+-/, "");
  if (parts[0] === "comics" && parts[1]) return parts[1];
  if (parts[0] === "s" && parts[1]) return parts[1];
  return raw.replace(/^\/+/, "").split(/[/?#]/)[0];
};

AsuraScans._chapterParts = function(value) {
  var path = this._pathFromUrl(value);
  var parts = path.split("/").filter(Boolean);
  var seriesSlug = "";
  var chapterNumber = "";
  if (parts[0] === "series" && parts[1] && parts[2] === "chapter" && parts[3]) {
    seriesSlug = parts[1];
    chapterNumber = parts[3];
  } else if (parts[0] === "comics" && parts[1] && parts[2] === "chapter" && parts[3]) {
    seriesSlug = parts[1];
    chapterNumber = parts[3];
  } else if (parts.length >= 4 && parts[parts.length - 2] === "chapter") {
    seriesSlug = parts[parts.length - 3];
    chapterNumber = parts[parts.length - 1];
  }
  return { seriesSlug: seriesSlug, chapterNumber: chapterNumber };
};

AsuraScans._numberString = function(value) {
  var text = String(value === undefined || value === null ? "" : value).trim();
  if (!text) return "";
  return text.replace(/\.0$/, "");
};

AsuraScans._dateString = function(value) {
  if (!value) return undefined;
  var ms = Date.parse(String(value).replace(/\.\d+Z$/, "Z"));
  if (!ms || isNaN(ms)) return undefined;
  try {
    return new Date(ms).toISOString();
  } catch (e) {
    return undefined;
  }
};

AsuraScans._status = function(value) {
  var status = String(value || "").toLowerCase();
  if (status === "ongoing") return "ongoing";
  if (status === "completed") return "completed";
  if (status === "hiatus") return "hiatus";
  if (status === "dropped" || status === "axed" || status === "cancelled" || status === "canceled") return "cancelled";
  return undefined;
};

AsuraScans._apiGet = async function(path, params) {
  var query = [];
  params = params || {};
  Object.keys(params).forEach(function(key) {
    var value = params[key];
    if (value === undefined || value === null || value === "") return;
    query.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
  });
  var url = /^https?:\/\//i.test(path)
    ? path
    : this.API_URL + path + (query.length ? "?" + query.join("&") : "");
  var res = await cinder.fetch(url, {
    headers: this._headers({ "Accept": "application/json" }),
    timeout: 30000,
  });
  if (!res || res.status < 200 || res.status >= 300 || !res.data) {
    throw new Error("Asura Scans request failed: " + url);
  }
  return JSON.parse(res.data);
};

AsuraScans._fetchHtml = async function(url, referer) {
  var res = await cinder.fetch(url, {
    headers: this._headers({
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer": referer || this.BASE_URL + "/",
    }),
    timeout: 30000,
  });
  if (!res || res.status < 200 || res.status >= 300 || !res.data) {
    throw new Error("Asura Scans page request failed: " + url);
  }
  return String(res.data || "");
};

AsuraScans._unwrapAstro = function(value) {
  if (Array.isArray(value)) {
    if (value.length === 2 && (value[0] === null || typeof value[0] !== "object")) {
      return this._unwrapAstro(value[1]);
    }
    return value.map(function(item) {
      return AsuraScans._unwrapAstro(item);
    });
  }
  if (value && typeof value === "object") {
    var out = {};
    Object.keys(value).forEach(function(key) {
      out[key] = AsuraScans._unwrapAstro(value[key]);
    });
    return out;
  }
  return value;
};

AsuraScans._extractAstroProp = function(html, key) {
  var text = String(html || "");
  var re = /<[^>]+\sprops=(["'])([\s\S]*?)\1[^>]*>/gi;
  var match;
  while ((match = re.exec(text))) {
    var attr = this._decode(match[2]);
    if (attr.indexOf('"' + key + '"') === -1 && attr.indexOf(key) === -1) continue;
    try {
      var parsed = JSON.parse(attr);
      var unwrapped = this._unwrapAstro(parsed);
      if (unwrapped && Object.prototype.hasOwnProperty.call(unwrapped, key)) return unwrapped;
    } catch (e) {}
  }
  throw new Error("Unable to find Asura Scans prop: " + key);
};

AsuraScans._coverPayload = async function(url) {
  if (!url) return { cover: "", coverHeaders: undefined };
  if (this._coverCache[url]) return this._coverCache[url];
  var payload = {
    cover: this._absUrl(url),
    coverHeaders: this._imageHeaders(this.BASE_URL + "/"),
  };
  this._coverCache[url] = payload;
  return payload;
};

AsuraScans._genres = function(manga) {
  var genres = [];
  if (manga && manga.type) genres.push(String(manga.type));
  (manga && Array.isArray(manga.genres) ? manga.genres : []).forEach(function(genre) {
    if (genre && genre.name) genres.push(String(genre.name));
  });
  return genres;
};

AsuraScans._description = function(manga) {
  var parts = [];
  if (manga.description) parts.push(this._stripTags(manga.description));
  if (manga.rating) parts.push("Rating: " + Number(manga.rating).toFixed(2) + "/10");
  if (manga.chapter_count !== undefined && manga.chapter_count !== null) {
    parts.push("Chapters: " + String(manga.chapter_count));
  }
  if (Array.isArray(manga.alt_titles) && manga.alt_titles.length) {
    parts.push("Alternative Titles:\n" + manga.alt_titles.map(function(title) {
      return "- " + String(title);
    }).join("\n"));
  }
  return parts.filter(Boolean).join("\n\n");
};

AsuraScans._publicSlug = function(manga) {
  var publicPath = manga && (manga.public_url || manga.publicUrl);
  var parts = this._pathFromUrl(publicPath).split("/").filter(Boolean);
  return parts[0] === "comics" && parts[1] ? parts[1] : (manga && manga.slug ? manga.slug : "");
};

AsuraScans._toSearchResult = async function(manga) {
  manga = manga || {};
  var slug = String(manga.slug || this._seriesSlugFromId(manga.public_url || manga.source_url || manga.id || "") || "");
  var publicUrl = this._absUrl(manga.public_url || (slug ? "/comics/" + slug : ""));
  var coverPayload = await this._coverPayload(manga.cover || manga.cover_url || manga.thumbnail_url || "");
  var description = this._description(manga);
  return {
    id: "/series/" + slug,
    title: String(manga.title || slug || "Unknown Title"),
    author: manga.author || undefined,
    cover: coverPayload.cover,
    coverHeaders: coverPayload.coverHeaders,
    url: publicUrl,
    source: this.name,
    format: "manga",
    contentType: "manga",
    contentTypes: ["manga"],
    contentSubtypes: [String(manga.type || "manga").toLowerCase()],
    description: description || undefined,
    extra: {
      slug: slug,
      publicUrl: publicUrl,
      randomSlug: this._publicSlug(manga),
      status: this._status(manga.status),
      genres: this._genres(manga),
      description: description || undefined,
      coverHeaders: coverPayload.coverHeaders,
    },
  };
};

AsuraScans._toDetails = async function(manga) {
  var result = await this._toSearchResult(manga);
  return {
    id: result.id,
    title: result.title,
    author: manga.author || undefined,
    artist: manga.artist || undefined,
    cover: result.cover,
    coverHeaders: result.coverHeaders,
    description: this._description(manga),
    status: this._status(manga.status),
    genres: this._genres(manga),
    url: result.url,
    contentType: "manga",
    contentTypes: ["manga"],
    contentSubtypes: result.contentSubtypes,
    extra: result.extra,
  };
};

AsuraScans._seriesData = async function(id) {
  var slug = this._seriesSlugFromId(id);
  var data = await this._apiGet("/series/" + encodeURIComponent(slug));
  return data && data.series ? data.series : (data && data.data ? data.data : data);
};

AsuraScans._hideLockedChapters = async function() {
  if (!cinder || !cinder.store || typeof cinder.store.get !== "function") return true;
  try {
    var value = await cinder.store.get("hide_locked_chapters");
    return value === undefined || value === null || value === "" ? true : value !== false && value !== "false";
  } catch (e) {
    return true;
  }
};

AsuraScans.search = async function(query, page) {
  var q = String(query || "").trim();
  if (!q) return this.getDiscoverItems("popular", page || 0);
  var pageIndex = Math.max(0, Number(page || 0));
  var data = await this._apiGet("/series", {
    offset: pageIndex * this.PAGE_LIMIT,
    limit: this.PAGE_LIMIT,
    search: q,
  });
  var rows = data && Array.isArray(data.data) ? data.data : [];
  var results = [];
  for (var i = 0; i < rows.length; i++) {
    results.push(await this._toSearchResult(rows[i]));
  }
  return results.filter(function(item) {
    return item.id !== "/series/";
  });
};

AsuraScans.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Popular", icon: "flame" },
    { id: "latest", title: "Latest Updates", icon: "time" },
  ];
};

AsuraScans.getDiscoverItems = async function(sectionId, page) {
  var pageIndex = Math.max(0, Number(page || 0));
  var params = {
    offset: pageIndex * this.PAGE_LIMIT,
    limit: this.PAGE_LIMIT,
  };
  if (sectionId === "latest") params.order = "latest";
  else params.sort = "popular";
  var data = await this._apiGet("/series", params);
  var rows = data && Array.isArray(data.data) ? data.data : [];
  var results = [];
  for (var i = 0; i < rows.length; i++) {
    results.push(await this._toSearchResult(rows[i]));
  }
  return results.filter(function(item) {
    return item.id !== "/series/";
  });
};

AsuraScans.getMangaDetails = async function(id) {
  var manga = await this._seriesData(id);
  return this._toDetails(manga || {});
};

AsuraScans.getChapters = async function(mangaId) {
  var manga = await this._seriesData(mangaId);
  var seriesSlug = manga.slug || this._seriesSlugFromId(mangaId);
  var publicSlug = this._publicSlug(manga) || seriesSlug;
  var html = await this._fetchHtml(this.BASE_URL + "/comics/" + encodeURIComponent(publicSlug), this.BASE_URL + "/");
  var data = this._extractAstroProp(html, "chapters");
  var rows = data && Array.isArray(data.chapters) ? data.chapters : [];
  var hideLocked = await this._hideLockedChapters();
  var chapters = [];
  rows.forEach(function(chapter) {
    if (!chapter) return;
    if (hideLocked && chapter.is_locked) return;
    var number = Number(chapter.number);
    var numberStr = AsuraScans._numberString(chapter.number);
    if (!numberStr) return;
    var chapterTitle = "Chapter " + numberStr;
    if (chapter.title) chapterTitle += " - " + AsuraScans._stripTags(chapter.title);
    if (chapter.is_locked) chapterTitle = "[Locked] " + chapterTitle;
    chapters.push({
      id: "/series/" + (chapter.series_slug || seriesSlug) + "/chapter/" + numberStr,
      title: chapterTitle,
      chapterNumber: isNaN(number) ? 0 : number,
      dateUploaded: AsuraScans._dateString(chapter.published_at || chapter.created_at),
      extra: {
        isLocked: !!chapter.is_locked,
        pageCount: chapter.page_count,
        publicSlug: publicSlug,
      },
    });
  });
  return chapters.sort(function(a, b) {
    return (a.chapterNumber || 0) - (b.chapterNumber || 0);
  });
};

AsuraScans.getPages = async function(chapterId) {
  var parts = this._chapterParts(chapterId);
  if (!parts.seriesSlug || !parts.chapterNumber) {
    throw new Error("Invalid Asura Scans chapter ID: " + chapterId);
  }
  var manga = await this._seriesData("/series/" + parts.seriesSlug);
  var publicSlug = this._publicSlug(manga) || parts.seriesSlug;
  var chapterUrl = this.BASE_URL + "/comics/" + encodeURIComponent(publicSlug) + "/chapter/" + encodeURIComponent(parts.chapterNumber);
  var html = await this._fetchHtml(chapterUrl, this.BASE_URL + "/comics/" + encodeURIComponent(publicSlug));
  var data = this._extractAstroProp(html, "pages");
  var rows = data && Array.isArray(data.pages) ? data.pages : [];
  var pages = [];
  rows.forEach(function(page) {
    if (!page || !page.url) return;
    var url = AsuraScans._absUrl(page.url);
    var extra = undefined;
    if (Array.isArray(page.tiles) && page.tiles.length) {
      extra = {
        tiles: page.tiles,
        tileCols: page.tile_cols || page.tileCols || 4,
        tileRows: page.tile_rows || page.tileRows || 5,
      };
      url += "#" + encodeURIComponent(JSON.stringify(extra));
    }
    pages.push({
      url: url,
      headers: AsuraScans._imageHeaders(chapterUrl),
      width: page.width,
      height: page.height,
      extra: extra,
    });
  });
  if (pages.length === 0) {
    throw new Error("Asura Scans returned no pages. The chapter may be locked or premium-only.");
  }
  return pages;
};

AsuraScans.getSettings = function() {
  return [
    {
      id: "hide_locked_chapters",
      label: "Hide locked chapters",
      type: "toggle",
      defaultValue: true,
    },
  ];
};

// Older Cinder builds request getBookDetails() on detail screens.
AsuraScans.getBookDetails = AsuraScans.getMangaDetails;

__cinderExport = AsuraScans;
