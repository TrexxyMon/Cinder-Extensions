var ReadAllComics = {};

ReadAllComics.id = "readallcomics";
ReadAllComics.name = "ReadAllComics";
ReadAllComics.version = "0.1.3-cinder";
ReadAllComics.icon = "RAC";
ReadAllComics.description = "Read western comics from ReadAllComics.";
ReadAllComics.contentType = "comics";
ReadAllComics.contentTypes = ["comic"];
ReadAllComics.contentSubtypes = ["westernComic"];
ReadAllComics.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

ReadAllComics.BASE_URL = "https://readallcomics.com";

ReadAllComics._headers = function(extra) {
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

ReadAllComics._imageHeaders = function(referer) {
  return {
    "Referer": referer || this.BASE_URL + "/",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
};

ReadAllComics._decode = function(value) {
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

ReadAllComics._stripTags = function(value) {
  return this._decode(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
};

ReadAllComics._attr = function(html, attr) {
  var re = new RegExp(attr + "\\s*=\\s*([\\\"'])(.*?)\\1", "i");
  var match = String(html || "").match(re);
  return match ? this._decode(match[2]) : "";
};

ReadAllComics._absUrl = function(value) {
  if (!value) return "";
  var url = this._decode(String(value).trim());
  if (!url || /^data:/i.test(url)) return "";
  if (url.indexOf("//") === 0) return "https:" + url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.charAt(0) === "/") return this.BASE_URL + url;
  return this.BASE_URL + "/" + url.replace(/^\/+/, "");
};

ReadAllComics._firstSrcsetUrl = function(value) {
  var srcset = this._decode(value);
  if (!srcset) return "";
  var first = srcset.split(",")[0] || "";
  return first.trim().split(/\s+/)[0] || "";
};

ReadAllComics._pathFromUrl = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  try {
    var parsed = new URL(raw.indexOf("http") === 0 ? raw : this.BASE_URL + raw);
    return parsed.pathname.replace(/\/+/g, "/");
  } catch (e) {
    return raw.replace(this.BASE_URL, "").split(/[?#]/)[0];
  }
};

ReadAllComics._slugify = function(value) {
  return this._decode(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

ReadAllComics._titleFromSlug = function(value) {
  var parts = this._pathFromUrl(value).split("/").filter(Boolean);
  var slug = parts.length ? parts[parts.length - 1] : String(value || "");
  return slug.replace(/-/g, " ").replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
};

ReadAllComics._fetchHtml = async function(url, options) {
  options = options || {};
  var res;
  var fetchOptions = {
    headers: this._headers(options.headers),
    timeout: options.timeout || 25000,
  };
  try {
    res = await cinder.fetch(url, fetchOptions);
  } catch (error) {
    if (options.allowMissing) return "";
    if (cinder.fetchBrowser) {
      res = await cinder.fetchBrowser(url, {
        headers: this._headers(Object.assign({
          "X-Cinder-Suppress-Interactive": "1",
          "X-Cinder-Min-Wait-Ms": "1200",
          "X-Cinder-Max-Wait-Ms": "8000",
        }, options.headers || {})),
      });
    } else {
      throw error;
    }
  }
  if (!res || res.status < 200 || res.status >= 300 || !res.data) {
    if (options.allowMissing) return "";
    throw new Error("ReadAllComics request failed for " + url);
  }
  return String(res.data || "");
};

ReadAllComics._imageFromHtml = function(html) {
  return this._absUrl(
    this._attr(html, "data-src") ||
    this._attr(html, "data-lazy-src") ||
    this._attr(html, "data-original") ||
    this._attr(html, "data-lazy") ||
    this._attr(html, "src") ||
    this._firstSrcsetUrl(this._attr(html, "data-srcset") || this._attr(html, "srcset"))
  );
};

ReadAllComics._parseSeriesList = function(html) {
  var results = [];
  var seen = {};

  if (cinder.parseHTML) {
    var doc = cinder.parseHTML(html);
    var rows = doc.querySelectorAll("ul.list-story.categories > li, .list-story.categories li");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var link = row.querySelector("a.book-link[href]") || row.querySelector("a.cat-title[href]") || row.querySelector("a[href*='/category/']");
      if (!link) continue;
      var url = this._absUrl(link.attr("href") || "");
      var path = this._pathFromUrl(url);
      if (!/^\/category\//i.test(path) || seen[path]) continue;
      seen[path] = true;
      var titleNode = row.querySelector("a.cat-title") || link;
      var title = this._decode(titleNode.text ? titleNode.text() : "") || this._decode(link.attr("title") || "") || this._titleFromSlug(path);
      var img = row.querySelector("img.book-cover") || row.querySelector("img");
      var cover = img ? this._imageFromHtml(img.toString ? img.toString() : "") : "";
      if (!cover && img) cover = this._absUrl(img.attr("data-src") || img.attr("src") || "");
      var rowHtml = row.toString ? row.toString() : "";
      var publisherMatch = rowHtml.match(/<div[^>]+class=["'][^"']*cat-publisher[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      var publisher = this._stripTags(publisherMatch ? publisherMatch[1] : "");
      publisher = publisher.replace(/^Publisher:\s*/i, "").trim();
      results.push({
        id: path,
        title: title,
        author: publisher || "Various",
        cover: cover,
        coverHeaders: cover ? this._imageHeaders(url) : undefined,
        url: url,
        format: "comics",
        contentType: "comics",
        contentTypes: ["comic"],
      });
    }
    if (results.length > 0) return results;
  }

  var blockRe = /<li[^>]*style=["'][^"']*display\s*:\s*flex[\s\S]*?(?=<li[^>]*style=["'][^"']*display\s*:\s*flex|<\/ul>\s*<\/div>|<nav|$)/gi;
  var match;
  while ((match = blockRe.exec(html)) !== null) {
    var block = match[0];
    var linkMatch = block.match(/<a[^>]+href=["']([^"']*\/category\/[^"']+)["'][^>]*(?:class=["'][^"']*(?:book-link|cat-title)[^"']*["'])?[^>]*>/i) ||
      block.match(/<a[^>]+(?:class=["'][^"']*(?:book-link|cat-title)[^"']*["'][^>]+)?href=["']([^"']*\/category\/[^"']+)["'][^>]*>/i);
    if (!linkMatch) continue;
    var url = this._absUrl(linkMatch[1]);
    var path = this._pathFromUrl(url);
    if (!path || seen[path]) continue;
    seen[path] = true;
    var title = this._stripTags((block.match(/<a[^>]+class=["'][^"']*cat-title[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) || [])[1]) ||
      this._decode(this._attr((block.match(/<img[\s\S]*?>/i) || [])[0], "alt")) ||
      this._titleFromSlug(path);
    var imgTag = (block.match(/<img[\s\S]*?>/i) || [])[0] || "";
    var cover = this._imageFromHtml(imgTag);
    var publisher = this._stripTags((block.match(/<div[^>]+class=["'][^"']*cat-publisher[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1]).replace(/^Publisher:\s*/i, "").trim();
    results.push({
      id: path,
      title: title,
      author: publisher || "Various",
      cover: cover,
      coverHeaders: cover ? this._imageHeaders(url) : undefined,
      url: url,
      format: "comics",
      contentType: "comics",
      contentTypes: ["comic"],
    });
  }
  return results;
};

ReadAllComics._categoryCandidatePaths = function(query) {
  var slug = this._slugify(query);
  if (!slug) return [];
  var paths = ["/category/" + slug + "/"];
  var withoutLeadingArticle = slug.replace(/^(the|a|an)-/, "");
  if (withoutLeadingArticle && withoutLeadingArticle !== slug) paths.push("/category/" + withoutLeadingArticle + "/");
  return paths;
};

ReadAllComics._categoryResultFromHtml = function(path, html) {
  if (!html || !/Issue List|list-story/i.test(html)) return null;
  var title = this._stripTags((html.match(/<h1[^>]*>[\s\S]*?<b[^>]*>([\s\S]*?)<\/b>[\s\S]*?<\/h1>/i) || [])[1]) ||
    this._stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) ||
    this._titleFromSlug(path);
  var imgTags = html.match(/<img[\s\S]*?>/gi) || [];
  var cover = "";
  for (var i = 0; i < imgTags.length; i++) {
    var candidate = this._imageFromHtml(imgTags[i]);
    if (!candidate || /logo|cropped-logo|avatar|gravatar|default\.png/i.test(candidate)) continue;
    cover = candidate;
    break;
  }
  return {
    id: path,
    title: title,
    author: "Various",
    cover: cover,
    coverHeaders: cover ? this._imageHeaders(this._absUrl(path)) : undefined,
    url: this._absUrl(path),
    format: "comics",
    contentType: "comics",
    contentTypes: ["comic"],
  };
};

ReadAllComics.search = async function(query, page) {
  query = String(query || "").trim();
  page = page || 0;
  if (!query) return this.getDiscoverItems("latest", page);

  var results = [];
  var seen = {};
  function add(item) {
    if (!item || !item.id || seen[item.id]) return;
    seen[item.id] = true;
    results.push(item);
  }

  if (page === 0) {
    var candidates = this._categoryCandidatePaths(query);
    for (var i = 0; i < candidates.length; i++) {
      var path = candidates[i];
      var html = await this._fetchHtml(this._absUrl(path), { allowMissing: true, timeout: 12000 });
      add(this._categoryResultFromHtml(path, html));
    }
  }

  var latestPath = page > 0 ? "/page/" + (page + 1) + "/" : "/";
  var latestHtml = await this._fetchHtml(this._absUrl(latestPath), { allowMissing: true, timeout: 15000 });
  var latest = this._parseSeriesList(latestHtml);
  var normalizedQuery = this._slugify(query).replace(/-/g, " ");
  latest.forEach(function(item) {
    var normalizedTitle = ReadAllComics._slugify(item.title).replace(/-/g, " ");
    if (normalizedTitle.indexOf(normalizedQuery) !== -1 || normalizedQuery.indexOf(normalizedTitle) !== -1) add(item);
  });

  return results;
};

ReadAllComics.getDiscoverSections = async function() {
  return [
    { id: "latest", title: "Latest Comics", icon: "time" },
  ];
};

ReadAllComics.getDiscoverItems = async function(sectionId, page) {
  var pageNumber = (page || 0) + 1;
  var path = pageNumber <= 1 ? "/" : "/page/" + pageNumber + "/";
  var html = await this._fetchHtml(this._absUrl(path), { timeout: 20000 });
  return this._parseSeriesList(html);
};

ReadAllComics.getMangaDetails = async function(id) {
  var path = this._pathFromUrl(id);
  var url = this._absUrl(path);
  var html = await this._fetchHtml(url, { timeout: 20000 });
  var result = this._categoryResultFromHtml(path, html) || { id: path, title: this._titleFromSlug(path), author: "Various" };
  var genres = [];
  var genreText = this._stripTags((html.match(/Genres:\s*<\/span>\s*([\s\S]*?)<\/div>/i) || [])[1]);
  if (genreText) {
    genres = genreText.split(/,|\//).map(function(g) { return ReadAllComics._decode(g); }).filter(Boolean);
  }
  if (genres.length === 0) genres = ["Comic"];
  return {
    id: path,
    title: result.title,
    author: result.author || "Various",
    description: "",
    cover: result.cover,
    coverHeaders: result.cover ? this._imageHeaders(url) : undefined,
    status: "unknown",
    genres: genres,
  };
};

ReadAllComics._chapterNumber = function(title, index) {
  var text = String(title || "");
  var volume = 0;
  var issue = 0;
  var volMatch = text.match(/\bv\s*([0-9]+)\b/i);
  if (volMatch) volume = parseInt(volMatch[1], 10) || 0;
  var issueMatch = text.match(/(?:#|\bv\s*[0-9]+\s+|\bissue\s*)0*([0-9]+(?:\.[0-9]+)?)/i) || text.match(/0*([0-9]+(?:\.[0-9]+)?)/);
  if (issueMatch) issue = parseFloat(issueMatch[1]) || 0;
  if (volume > 0 && issue > 0) return volume * 1000 + issue;
  if (issue > 0) return issue;
  return index + 1;
};

ReadAllComics.getChapters = async function(mangaId) {
  var path = this._pathFromUrl(mangaId);
  var url = this._absUrl(path);
  var html = await this._fetchHtml(url, { timeout: 25000 });
  var chapters = [];
  var seen = {};
  var listBlock = (html.match(/<ul[^>]+class=["'][^"']*list-story[^"']*["'][^>]*>[\s\S]*?<\/ul>/i) || [])[0] || html;
  var linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var match;
  var sourceIndex = 0;
  while ((match = linkRe.exec(listBlock)) !== null) {
    var chapterUrl = this._absUrl(match[1]);
    var chapterPath = this._pathFromUrl(chapterUrl);
    if (!chapterPath || /^\/category\//i.test(chapterPath) || seen[chapterPath]) continue;
    seen[chapterPath] = true;
    var title = this._stripTags(match[2]) || this._titleFromSlug(chapterPath);
    chapters.push({
      id: chapterPath,
      title: title,
      chapterNumber: this._chapterNumber(title, sourceIndex),
      _sourceIndex: sourceIndex++,
    });
  }
  if (chapters.length === 0) throw new Error("ReadAllComics returned no issues for this series.");
  return chapters.sort(function(a, b) {
    return b._sourceIndex - a._sourceIndex;
  }).map(function(chapter) {
    delete chapter._sourceIndex;
    return chapter;
  });
};

ReadAllComics._isComicImage = function(url) {
  if (!url) return false;
  if (/logo|cropped-logo|avatar|gravatar|default\.png|wp-content\/uploads\/2020\/02\/logo/i.test(url)) return false;
  var hasImageExtension = /\.(?:jpg|jpeg|png|webp)(?:[?#]|$)/i.test(url);
  var trustedExternalHost = /blogger\.googleusercontent\.com|(?:^|\/\/)[0-9]\.bp\.blogspot\.com|bp\.blogspot\.com|blogspot\.com|googleusercontent\.com|ggpht\.com/i.test(url);
  var trustedUploadHost = /readallcomics\.com\/wp-content\/uploads/i.test(url);
  return trustedExternalHost || (trustedUploadHost && hasImageExtension);
};

ReadAllComics.getPages = async function(chapterId) {
  var path = this._pathFromUrl(chapterId);
  var chapterUrl = this._absUrl(path);
  var html = await this._fetchHtml(chapterUrl, { timeout: 25000, headers: { "Referer": this.BASE_URL + "/" } });
  var pages = [];
  var seen = {};
  var imgRe = /<img[\s\S]*?>/gi;
  var match;
  while ((match = imgRe.exec(html)) !== null) {
    var src = this._imageFromHtml(match[0]);
    if (!this._isComicImage(src) || seen[src]) continue;
    seen[src] = true;
    pages.push({
      url: src,
      headers: this._imageHeaders(chapterUrl),
    });
  }
  if (pages.length === 0) throw new Error("ReadAllComics returned no pages for this issue.");
  return pages;
};

ReadAllComics.getSettings = function() {
  return [];
};

__cinderExport = ReadAllComics;


