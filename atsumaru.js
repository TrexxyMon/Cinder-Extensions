var Atsumaru = {};

Atsumaru.id = "atsumaru";
Atsumaru.name = "Atsumaru";
Atsumaru.version = "0.1.0-cinder";
Atsumaru.icon = "AT";
Atsumaru.description = "Read manga, manhwa, manhua, and OEL from Atsumaru.";
Atsumaru.contentType = "manga";
Atsumaru.contentTypes = ["manga"];
Atsumaru.contentSubtypes = ["manga", "manhwa", "manhua", "oel"];
Atsumaru.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

Atsumaru.BASE_URL = "https://atsu.moe";
Atsumaru._coverCache = {};

Atsumaru._headers = function(extra) {
  var headers = {
    "Accept": "application/json,*/*",
    "Content-Type": "application/json",
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

Atsumaru._imageHeaders = function() {
  return {
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Referer": this.BASE_URL + "/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
};

Atsumaru._apiGet = async function(url) {
  var res = await cinder.fetch(url, {
    headers: this._headers(),
    timeout: 30000,
  });
  if (!res || res.status < 200 || res.status >= 300 || !res.data) {
    throw new Error("Atsumaru request failed: " + url);
  }
  return JSON.parse(res.data);
};

Atsumaru._normalizeImage = function(value) {
  if (!value) return "";
  var raw = "";
  if (typeof value === "string") {
    raw = value;
  } else if (value && typeof value === "object") {
    raw = value.image || value.url || value.src || "";
  }
  raw = String(raw || "").trim();
  if (!raw) return "";
  if (raw.indexOf("//") === 0) return "https:" + raw;
  if (/^https?:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, "https://");
  raw = raw.replace(/^\/+/, "").replace(/^static\//i, "");
  return this.BASE_URL + "/static/" + raw;
};

Atsumaru._namesFromValue = function(value, typeFilter) {
  if (!value) return [];
  var arr = Array.isArray(value) ? value : [value];
  var names = [];
  arr.forEach(function(item) {
    if (!item) return;
    if (typeof item === "string") {
      if (!typeFilter) names.push(item);
      return;
    }
    if (typeof item === "object") {
      if (typeFilter && item.type && String(item.type) !== typeFilter) return;
      if (!typeFilter && item.type && item.type !== "Author") return;
      if (item.name) names.push(String(item.name));
    }
  });
  return names;
};

Atsumaru._genresFromValue = function(value) {
  if (!value) return [];
  var arr = Array.isArray(value) ? value : [value];
  var genres = [];
  arr.forEach(function(item) {
    if (!item) return;
    if (typeof item === "string") genres.push(item);
    else if (typeof item === "object" && item.name) genres.push(String(item.name));
  });
  return genres;
};

Atsumaru._status = function(value) {
  var s = String(value || "").toLowerCase().trim();
  if (s === "ongoing") return "ongoing";
  if (s === "completed") return "completed";
  if (s === "hiatus") return "hiatus";
  if (s === "canceled" || s === "cancelled") return "cancelled";
  return undefined;
};

Atsumaru._dateString = function(value) {
  if (!value) return undefined;
  var ms = typeof value === "number" ? value : Date.parse(String(value).replace("T ", "T"));
  if (!ms || isNaN(ms)) return undefined;
  try {
    return new Date(ms).toISOString();
  } catch (e) {
    return undefined;
  }
};

Atsumaru._description = function(item) {
  var parts = [];
  var rating = item.avgRating || item.mbRating;
  if (rating && Number(rating) > 0) {
    parts.push("Rating: " + Number(rating).toFixed(2) + "/10");
  }
  if (item.released && Number(item.released) > 0) {
    try {
      parts.push("Year: " + new Date(Number(item.released)).getFullYear());
    } catch (e) {}
  }
  if (item.views) parts.push("Views: " + String(item.views));
  if (item.synopsis) parts.push("Synopsis: " + String(item.synopsis));
  if (Array.isArray(item.otherNames)) {
    var names = item.otherNames.filter(function(name) {
      return name && String(name) !== String(item.title || "");
    });
    if (names.length) {
      parts.push("Alternative Names:\n" + names.map(function(name) {
        return "- " + name;
      }).join("\n"));
    }
  }
  return parts.join("\n\n");
};

Atsumaru._coverPayload = async function(url) {
  if (!url) return { cover: "", coverHeaders: undefined };
  if (this._coverCache[url]) return this._coverCache[url];
  var payload = {
    cover: url,
    coverHeaders: this._imageHeaders(),
  };
  this._coverCache[url] = payload;
  return payload;
};

Atsumaru._mapMangaResult = async function(item) {
  item = item || {};
  var cover = this._normalizeImage(item.mediumImage || item.smallImage || item.largeImage || item.image || item.poster);
  var coverPayload = await this._coverPayload(cover);
  var authors = this._namesFromValue(item.authors);
  var genres = [];
  if (item.type) genres.push(String(item.type));
  genres = genres.concat(this._genresFromValue(item.genres || item.tags));
  return {
    id: String(item.id || ""),
    title: String(item.title || item.englishTitle || "Unknown Title"),
    author: authors.join(", ") || undefined,
    cover: coverPayload.cover,
    coverHeaders: coverPayload.coverHeaders,
    url: String(item.id || ""),
    source: this.name,
    format: "manga",
    contentType: "manga",
    contentTypes: ["manga"],
    contentSubtypes: [String(item.type || "manga").toLowerCase()],
    extra: {
      description: this._description(item),
      status: this._status(item.status),
      genres: genres,
      coverHeaders: coverPayload.coverHeaders,
    },
  };
};

Atsumaru._mapMangaDetails = async function(item) {
  var result = await this._mapMangaResult(item);
  var authors = this._namesFromValue(item.authors, "Author");
  if (!authors.length) authors = this._namesFromValue(item.authors);
  var artists = this._namesFromValue(item.authors, "Artist");
  var genres = [];
  if (item.type) genres.push(String(item.type));
  genres = genres.concat(this._genresFromValue(item.genres || item.tags));
  return {
    id: result.id,
    title: result.title,
    author: authors.join(", ") || undefined,
    artist: artists.join(", ") || undefined,
    cover: result.cover,
    coverHeaders: result.coverHeaders,
    description: this._description(item),
    status: this._status(item.status),
    genres: genres,
  };
};

Atsumaru._searchUrl = function(query, page) {
  var pageNumber = Math.max(1, (page || 0) + 1);
  var params = new URLSearchParams();
  params.set("q", query || "*");
  params.set("filter_by", [
    "hidden:!=true",
    "isAdult:=false",
    "(mbContentRating:=[`Safe`,`Suggestive`,`Erotica`] || mbContentRating:!=*)",
    "views:>0",
  ].join(" && "));
  if (query) {
    params.set("query_by", "title,englishTitle,otherNames,authors");
    params.set("query_by_weights", "4,3,2,1");
    params.set("num_typos", "4,3,2,1");
  }
  params.set("page", String(pageNumber));
  params.set("per_page", "40");
  return this.BASE_URL + "/collections/manga/documents/search?" + params.toString();
};

Atsumaru.search = async function(query, page) {
  var q = String(query || "").trim();
  if (!q) return this.getDiscoverItems("popular", page || 0);
  var data = await this._apiGet(this._searchUrl(q, page || 0));
  var rows = data.hits
    ? data.hits.map(function(hit) { return hit.document; })
    : (data.items || []);
  var results = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i]) results.push(await this._mapMangaResult(rows[i]));
  }
  return results.filter(function(result) { return !!result.id; });
};

Atsumaru.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Trending", icon: "flame" },
    { id: "latest", title: "Recently Updated", icon: "time" },
  ];
};

Atsumaru.getDiscoverItems = async function(sectionId, page) {
  var pageNumber = Math.max(0, page || 0);
  var path = sectionId === "latest" ? "recentlyUpdated" : "trending";
  var url = this.BASE_URL + "/api/infinite/" + path + "?page=" + pageNumber + "&types=Manga,Manwha,Manhua,OEL";
  var data = await this._apiGet(url);
  var rows = data.items || [];
  var results = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i]) results.push(await this._mapMangaResult(rows[i]));
  }
  return results.filter(function(result) { return !!result.id; });
};

Atsumaru.getMangaDetails = async function(id) {
  var mangaId = String(id || "").trim();
  var data = await this._apiGet(this.BASE_URL + "/api/manga/page?id=" + encodeURIComponent(mangaId));
  return this._mapMangaDetails(data.mangaPage || {});
};

Atsumaru.getChapters = async function(mangaId) {
  mangaId = String(mangaId || "").trim();
  var scanlators = {};
  try {
    var details = await this._apiGet(this.BASE_URL + "/api/manga/page?id=" + encodeURIComponent(mangaId));
    var list = ((details.mangaPage || {}).scanlators) || [];
    list.forEach(function(item) {
      if (item && item.id) scanlators[item.id] = item.name || "";
    });
  } catch (e) {}

  var data = await this._apiGet(this.BASE_URL + "/api/manga/allChapters?mangaId=" + encodeURIComponent(mangaId));
  return (data.chapters || []).map(function(ch) {
    var n = Number(ch.number);
    return {
      id: mangaId + "/" + ch.id,
      title: ch.title || ("Chapter " + (isNaN(n) ? "?" : n)),
      chapterNumber: isNaN(n) ? 0 : n,
      dateUploaded: Atsumaru._dateString(ch.createdAt),
      scanlator: ch.scanlationMangaId ? scanlators[ch.scanlationMangaId] : undefined,
    };
  }).sort(function(a, b) {
    return (a.chapterNumber || 0) - (b.chapterNumber || 0);
  });
};

Atsumaru.getPages = async function(chapterId) {
  var parts = String(chapterId || "").split("/");
  if (parts.length < 2) throw new Error("Invalid Atsumaru chapter id: " + chapterId);
  var mangaId = parts[0];
  var id = parts.slice(1).join("/");
  var url = this.BASE_URL + "/api/read/chapter?mangaId=" + encodeURIComponent(mangaId) + "&chapterId=" + encodeURIComponent(id);
  var data = await this._apiGet(url);
  var pages = (((data || {}).readChapter || {}).pages) || [];
  return pages.map(function(page) {
    return {
      url: Atsumaru._normalizeImage(page.image),
      headers: Atsumaru._imageHeaders(),
    };
  }).filter(function(page) {
    return !!page.url;
  });
};

__cinderExport = Atsumaru;
