// Independent on-device adapter. Only the site's actual audio players supply files.
// Cinder handles native inspection, streaming, downloads, and listening progress.
var GoldenAudiobooks = {
  id: "goldenaudiobooks", name: "GoldenAudiobooks", version: "0.1.1-cinder",
  icon: "headset-outline", language: "English", contentType: "audiobooks", contentTypes: ["audiobook"],
  description: "Browse and search audiobooks with direct listening and downloads when the website provides audio files.",
  excludeFromDefaultMetadataProviders: true, debridSupport: "none",
  debridDescription: "No debrid required. Direct downloads and streaming.",
  browser: { startUrl: "https://goldenaudiobooks.com/", userAgent: "desktop" },
  capabilities: { search: true, searchDownloads: true, discover: true, resolve: true, download: false, manga: false },
  downloadResults: { order: "source", limit: 40 },
  BASE: "https://goldenaudiobooks.com", _cache: [], _pending: {}, _cooldownUntil: 0,
  _browserPending: 0, _browserTail: null
};
GoldenAudiobooks._text = function (value) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim() : "";
};
GoldenAudiobooks._error = function (message, status) {
  var error = new Error(message); if (status) error.status = status; return error;
};
GoldenAudiobooks._url = function (value, base) {
  var raw = typeof value === "string" ? value.trim().replace(/&amp;|&#0*38;/gi, "&") : "";
  if (!raw || raw.length > 4096 || /[\u0000-\u0020\\<>"]/.test(raw) || /%(?![a-f0-9]{2})/i.test(raw)) return "";
  var url = raw;
  try {
    if (typeof cinder.resolveUrl === "function") url = cinder.resolveUrl(raw, base || this.BASE + "/");
    else if (raw.indexOf("//") === 0) url = "https:" + raw;
    else if (raw.charAt(0) === "/") url = this.BASE + raw;
  } catch (_) { return ""; }
  return /^https:\/\/[a-z0-9.-]+\/[^\s\\<>"]*$/i.test(url) ? url.split("#")[0] : "";
};
GoldenAudiobooks._path = function (value) {
  var raw = typeof value === "string" ? value.trim() : "";
  if (/^https:\/\/(?:www\.)?goldenaudiobooks\.com\//i.test(raw)) raw = raw.replace(/^https:\/\/[^/]+/i, "");
  var match = /^\/([a-z0-9][a-z0-9%_-]{0,700})\/(?:([1-9]\d{0,2})\/)?(?:#.*)?$/i.exec(raw.replace(/\/?(?:#.*)?$/, "/"));
  if (!match || /%(?![a-f0-9]{2})|%(?:2f|5c|2e|00|25)/i.test(match[1]) || /^(?:feed|search|category|tag|author|about|contact|privacy-policy|dmca)$/i.test(match[1])) return "";
  return "/" + match[1] + "/" + (match[2] && Number(match[2]) > 1 ? Number(match[2]) + "/" : "");
};
GoldenAudiobooks._root = function (path) { return path.replace(/^(\/[^/]+\/)\d+\/$/, "$1"); };
GoldenAudiobooks._partNumber = function (path) { var match = /^\/[^/]+\/(\d+)\/$/.exec(path); return match ? Number(match[1]) : 1; };
GoldenAudiobooks._samePage = function (left, right) {
  // Historical links sometimes spell the suffix audio-book instead of audiobook.
  // Do not accept unrelated canonical pages merely because the host is correct.
  return !!left && !!right && this._partNumber(left) === this._partNumber(right) &&
    this._root(left).replace(/-audio-book\/$/i, "-audiobook/") === this._root(right).replace(/-audio-book\/$/i, "-audiobook/");
};
GoldenAudiobooks._searchIdentity = function (url) {
  if (!/^https:\/\/(?:www\.)?goldenaudiobooks\.com\//i.test(url)) return "";
  var relative = url.replace(/^https:\/\/[^/]+/i, "").split("#")[0], parts = relative.split("?"), query = "", page = 1;
  var match = /^\/search\/([^?#]+?)\/(?:page\/([1-9]\d*)\/)?$/.exec(parts[0]);
  if (match) { query = match[1]; page = Number(match[2] || 1); }
  else {
    match = /^\/(?:page\/([1-9]\d*)\/)?$/.exec(parts[0]); if (!match) return "";
    page = Number(match[1] || 1);
    var values = (parts[1] || "").split("&");
    for (var i = 0; i < values.length; i++) if (/^s=/.test(values[i])) query = values[i].slice(2).replace(/\+/g, " ");
  }
  try { query = this._text(decodeURIComponent(query)); } catch (_) { return ""; }
  return query ? page + ":" + query.toLowerCase() : "";
};
GoldenAudiobooks._cover = function (value) {
  var url = this._url(value);
  return /^https:\/\/(?:www\.)?goldenaudiobooks\.com\/wp-content\/uploads\/[^?#]+\.(?:jpe?g|png|webp)(?:\?[^#]*)?$/i.test(url) ? url : undefined;
};
GoldenAudiobooks._media = function (value) {
  var url = this._url(value);
  if (!/^https:\/\/(?:www\.)?(?:ipaudio\.club|goldenaudiobooks\.com)\/wp-content\/uploads\/[^?#]+\.(?:mp3|m4a|m4b|flac|wav)(?:\?[^#]*)?$/i.test(url)) return "";
  try { if (/(?:^|\/)\.{1,2}(?:\/|$)|[\\\u0000-\u001f]/.test(decodeURIComponent(url.split("?")[0]))) return ""; } catch (_) { return ""; }
  var parts = url.split("?"), query = parts[1] ? parts[1].split("&").filter(function (parameter) {
    try { return decodeURIComponent(parameter.split("=")[0]) !== "_"; } catch (_) { return true; }
  }) : [];
  // WordPress adds one player-instance number. Other query parameters may be signatures.
  return parts[0] + (query.length ? "?" + query.join("&") : "");
};
GoldenAudiobooks._get = function (key) {
  for (var i = 0; i < this._cache.length; i++) if (this._cache[i].key === key && this._cache[i].until > Date.now()) return this._cache[i].value;
  return null;
};
GoldenAudiobooks._remember = function (key, value) {
  this._cache = this._cache.filter(function (entry) { return entry.key !== key && entry.until > Date.now(); });
  this._cache.push({ key: key, value: value, until: Date.now() + 30000 });
  if (this._cache.length > 16) this._cache.shift();
  return value;
};
GoldenAudiobooks._single = function (key, work) {
  if (this._pending[key]) return this._pending[key];
  var self = this, result = Promise.resolve().then(work);
  this._pending[key] = result;
  return result.then(function (value) { delete self._pending[key]; return value; }, function (error) { delete self._pending[key]; throw error; });
};
GoldenAudiobooks._document = function (response, kind, requestedUrl) {
  var html = response && typeof response.data === "string" ? response.data : "";
  if (html.length > 2000000) throw this._error("GoldenAudiobooks returned an unusually large page. Try a narrower search.");
  if (!response || response.status < 200 || response.status >= 300 || !html) return null;
  var finalUrl = response.url, requested = this._path(requestedUrl);
  if (typeof finalUrl === "string" && finalUrl) {
    if (!/^https:\/\/(?:www\.)?goldenaudiobooks\.com\//i.test(finalUrl) ||
      kind === "detail" && !this._samePage(this._path(finalUrl), requested) ||
      kind === "search" && (!this._searchIdentity(finalUrl) || this._searchIdentity(finalUrl) !== this._searchIdentity(requestedUrl)) ||
      kind === "list" && finalUrl.replace(/^https:\/\/(?:www\.)?/i, "https://").replace(/\/$/, "") !== requestedUrl.replace(/\/$/, ""))
      throw this._error("GoldenAudiobooks redirected to a different page. Search again instead of using an unrelated result.");
  }
  var doc = cinder.parseHTML(html);
  if (kind === "detail") {
    if (!doc.querySelector("h1.title-page") || !doc.querySelector(".post-single")) return null;
    var canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical && !this._samePage(this._path(canonical.attr("href")), requested)) throw this._error("GoldenAudiobooks returned metadata for a different book. Search again.");
    return doc;
  }
  var heading = doc.querySelector('meta[property="og:title"]'), empty = doc.querySelector(".no-results, .not-found");
  if (kind === "search" && !doc.querySelector("body.search") && !/^You searched for /i.test(this._text(heading && heading.attr("content"))) && !empty) return null;
  return doc.querySelector("article h2.title-post a") || empty ? doc : null;
};
GoldenAudiobooks._browserPage = function (url, headers, kind, deadline) {
  if (this._browserPending >= 4) return Promise.reject(this._error("GoldenAudiobooks has other requests in progress. Retry shortly."));
  var self = this, previous = this._browserTail || Promise.resolve(); this._browserPending++;
  var task = previous.catch(function () {}).then(async function () {
    if (self._cooldownUntil > Date.now()) throw self._error("GoldenAudiobooks is limiting requests. Retry shortly.", 429);
    var timeout = Math.min(4000, deadline - Date.now());
    if (timeout < 500) throw self._error("GoldenAudiobooks browser request timed out. Retry shortly.");
    headers["X-Cinder-Suppress-Interactive"] = "1";
    headers["X-Cinder-Wait-For-Selector"] = kind === "detail" ? ".post-single" : "article h2.title-post, .no-results";
    headers["X-Cinder-Max-Wait-Ms"] = String(Math.max(300, timeout - 500));
    var response = await cinder.fetchBrowser(url, { headers: headers, browserUserAgent: "desktop", timeout: timeout });
    if (response && (response.status === 429 || response.status === 503)) {
      self._cooldownUntil = Date.now() + 30000;
      throw self._error("GoldenAudiobooks is limiting requests. Retry shortly.", response.status);
    }
    return response;
  });
  this._browserTail = task;
  return task.then(function (response) {
    self._browserPending--; if (self._browserTail === task) self._browserTail = null; return response;
  }, function (error) {
    self._browserPending--; if (self._browserTail === task) self._browserTail = null; throw error;
  });
};
GoldenAudiobooks._page = async function (url, kind, deadline) {
  if (this._cooldownUntil > Date.now()) throw this._error("GoldenAudiobooks is limiting requests. Wait a moment, then retry.", 429);
  deadline = deadline || Date.now() + 14000;
  var headers = { Accept: "text/html,application/xhtml+xml" }, response = null;
  if (typeof cinder.getBrowserSessionHeaders === "function") {
    try { var session = await cinder.getBrowserSessionHeaders(url); if (session && session.Cookie) headers.Cookie = session.Cookie; } catch (_) {}
  }
  var timeout = Math.min(8000, deadline - Date.now());
  if (timeout < 500) throw this._error("GoldenAudiobooks took too long to prepare all parts. Retry shortly.");
  try { response = await cinder.fetch(url, { headers: headers, timeout: timeout }); } catch (_) {}
  if (response && (response.status === 429 || response.status === 503)) {
    var raw, retryHeaders = response.headers || {};
    Object.keys(retryHeaders).some(function (key) { if (key.toLowerCase() === "retry-after") { raw = String(retryHeaders[key]); return true; } return false; });
    var wait = /^\d+$/.test(raw || "") ? Number(raw) * 1000 : Date.parse(raw || "") - Date.now();
    this._cooldownUntil = Date.now() + Math.max(30000, Math.min(300000, isFinite(wait) ? wait : 30000));
    throw this._error("GoldenAudiobooks is temporarily unavailable. Wait a moment, then retry.", response.status);
  }
  if (response && response.status === 404) throw this._error("This GoldenAudiobooks page is no longer available.", 404);
  var doc = this._document(response, kind, url);
  if (doc) return doc;
  timeout = Math.min(4000, deadline - Date.now());
  if (timeout >= 500 && typeof cinder.fetchBrowser === "function") {
    try {
      response = await this._browserPage(url, headers, kind, deadline);
      doc = this._document(response, kind, url);
      if (doc) return doc;
    } catch (error) { if (error && (error.status === 429 || error.status === 503)) throw error; }
  }
  throw this._error("GoldenAudiobooks did not return a readable page. Use Verify Website in extension settings, then retry.");
};
GoldenAudiobooks._label = function (value) {
  var label = this._text(value).replace(/\s+Audio\s*books?(?:\s+Free(?:\s+Online)?)?\s*$/i, "").trim();
  var match = /^(.{2,160}?)\s+[\u2013\u2014-]\s+(.+)$/.exec(label);
  return { title: match ? match[2].trim() : label, author: match ? match[1].trim() : undefined };
};
GoldenAudiobooks._genres = function (node) {
  var self = this, result = [];
  node.querySelectorAll('a[rel~="category"]').slice(0, 30).forEach(function (entry) { var value = self._text(entry.text()); if (value && result.indexOf(value) < 0) result.push(value); });
  return result.length ? result : undefined;
};
GoldenAudiobooks._listing = function (doc) {
  var posts = doc.querySelectorAll("article"), result = [], seen = {};
  for (var i = 0; i < posts.length && result.length < 40; i++) {
    var post = posts[i], heading = post.querySelector("h2.title-post a"), path = this._path(heading && heading.attr("href"));
    if (!heading || !path) continue;
    path = this._root(path); if (seen[path]) continue;
    var label = this._label(heading.text()), image = post.querySelector(".post-cover img"), date = post.querySelector("time[datetime]");
    if (!label.title) continue;
    seen[path] = true;
    result.push({ id: path, url: this.BASE + path, title: label.title, author: label.author,
      cover: image ? this._cover(image.attr("data-lazy-src") || image.attr("data-src") || image.attr("src")) : undefined,
      date: date && isFinite(Date.parse(date.attr("datetime"))) ? date.attr("datetime") : undefined,
      genres: this._genres(post), format: "audiobook", contentType: "audiobooks", contentTypes: ["audiobook"], source: this.name });
  }
  return result;
};
GoldenAudiobooks._list = async function (query, page, section) {
  var q = this._text(query).slice(0, 200), number = Number(page);
  if (isFinite(number) && number > 500) return [];
  var n = isFinite(number) && number > 1 ? Math.floor(number) : 1;
  var prefix = section && section !== "latest" ? "/category/" + section + "/" : "/";
  var url = this.BASE + prefix + (n > 1 ? "page/" + n + "/" : "") + (q ? "?s=" + encodeURIComponent(q) : "");
  var key = "list:" + url, cached = this._get(key), self = this;
  if (cached) return JSON.parse(JSON.stringify(cached));
  var value = await this._single(key, async function () { return self._remember(key, self._listing(await self._page(url, q ? "search" : "list"))); });
  return JSON.parse(JSON.stringify(value));
};
GoldenAudiobooks.search = function (query, page) { return this._text(query) ? this._list(query, page, "") : Promise.resolve([]); };
GoldenAudiobooks.getDiscoverSections = async function () {
  // The homepage is a static landing page, not a latest-release catalog.
  return [{ id: "bestsellers", title: "Bestsellers", type: "popular" }, { id: "audio-fantasy", title: "Fantasy", type: "genres" }];
};
GoldenAudiobooks.getDiscoverItems = function (section, page) {
  return ["bestsellers", "audio-fantasy"].indexOf(section) >= 0 ? this._list("", page, section) : Promise.resolve([]);
};
GoldenAudiobooks._parseDetail = function (doc, requested) {
  var body = doc.querySelector(".post-single"), heading = doc.querySelector("h1.title-page"), label = this._label(heading.text());
  var canonical = doc.querySelector('link[rel="canonical"]'), path = this._path(canonical && canonical.attr("href")) || requested;
  var root = this._root(path), image = body.querySelector("figure img, .wp-caption img"), og = doc.querySelector('meta[property="og:image"]');
  var self = this;
  var description = [], length = 0;
  body.querySelectorAll("p").slice(0, 100).forEach(function (paragraph) {
    if (paragraph.querySelector("audio, script, style, iframe")) return;
    var text = self._text(paragraph.text());
    if (text.length < 50 || /^(?:Download and Keep Forever|Your browser does not support|Listen (?:Online|Free)|Download (?:Now|Free))\b/i.test(text) || /^https?:\/\//i.test(text)) return;
    if (length + text.length > 12000) return;
    description.push(text); length += text.length;
  });
  // The website's Author taxonomy also contains narrators. Do not promote those
  // tags, the uploader, or a cover filename to an author when the heading lacks one.
  var item = { id: root, url: this.BASE + root, title: label.title, author: label.author,
    cover: image ? this._cover(image.attr("data-lazy-src") || image.attr("src")) : undefined,
    coverHighResolution: og ? this._cover(og.attr("content")) : undefined,
    genres: this._genres(doc), description: description.length ? description.join("\n\n") : undefined,
    format: "audiobook", contentType: "audiobooks", contentTypes: ["audiobook"], source: this.name };
  if (!item.cover) item.cover = item.coverHighResolution;
  var parts = {}, files = [], seen = {}, error = "";
  doc.querySelectorAll('link[rel="next"], .page-links a, a.post-page-numbers').slice(0, 100).forEach(function (entry) {
    var part = self._path(entry.attr("href"));
    if (part && self._root(part) === root && self._partNumber(part) > 1) parts[part] = true;
  });
  var players = body.querySelectorAll("audio");
  if (players.length > 5000) error = "This audiobook has too many audio tracks.";
  for (var i = 0; i < players.length && !error; i++) {
    var player = players[i], candidates = [player.attr("src")];
    player.querySelectorAll("source[src], a[href]").slice(0, 30).forEach(function (entry) { candidates.push(entry.attr("src") || entry.attr("href")); });
    var url = "";
    for (var j = 0; j < candidates.length && !url; j++) url = this._media(candidates[j]);
    if (!url) { error = "One or more audio tracks are unavailable or use an unsupported host or format. The incomplete book was not returned."; break; }
    if (seen[url]) continue;
    seen[url] = true;
    files.push({ url: url, title: this._text(player.attr("title")) || undefined });
  }
  if (!files.length && !error) error = "This GoldenAudiobooks page does not provide supported audio files. No download was started.";
  return { item: item, path: path, root: root, parts: Object.keys(parts), files: files, error: error };
};
GoldenAudiobooks._detail = async function (path, deadline) {
  var key = "detail:" + path, cached = this._get(key), self = this;
  if (cached) return cached;
  return this._single(key, async function () {
    var record = self._parseDetail(await self._page(self.BASE + path, "detail", deadline), path);
    return record.error ? record : self._remember(key, record);
  });
};
GoldenAudiobooks.getBookDetails = async function (id) {
  var path = this._path(id); if (!path) throw this._error("Invalid GoldenAudiobooks page. Search again.");
  return JSON.parse(JSON.stringify((await this._detail(this._root(path))).item));
};
GoldenAudiobooks.resolve = async function (item) {
  var path = this._path(item && (item.id || item.url));
  if (!path) throw this._error("Invalid GoldenAudiobooks page. Search again.");
  path = this._root(path);
  var self = this, key = "resolve:" + path, cached = this._get(key);
  if (cached) return JSON.parse(JSON.stringify(cached));
  var value = await this._single(key, async function () {
    var deadline = Date.now() + 100000, first = await self._detail(path, deadline), root = first.root;
    var pending = first.parts.slice(), seenParts = {}, pages = [first]; seenParts[root] = true;
    if (first.error) throw self._error(first.error);
    while (pending.length) {
      pending.sort(function (a, b) { return self._partNumber(a) - self._partNumber(b); });
      var part = pending.shift(); if (seenParts[part]) continue;
      if (pages.length >= 32 || self._partNumber(part) > 32) throw self._error("This audiobook has too many content pages to prepare safely.");
      if (Date.now() >= deadline) throw self._error("GoldenAudiobooks took too long to prepare all parts. Retry shortly.");
      seenParts[part] = true;
      var next = await self._detail(part, deadline);
      if (next.root !== root || self._partNumber(next.path) !== self._partNumber(part)) throw self._error("GoldenAudiobooks redirected an audio part to a different page. The incomplete book was not returned.");
      if (next.error) throw self._error(next.error);
      pages.push(next); pending = pending.concat(next.parts);
    }
    pages.sort(function (a, b) { return self._partNumber(a.path) - self._partNumber(b.path); });
    var files = [], seen = {};
    for (var p = 0; p < pages.length; p++) {
      if (self._partNumber(pages[p].path) !== p + 1) throw self._error("GoldenAudiobooks omitted an audio part. The incomplete book was not returned.");
      for (var f = 0; f < pages[p].files.length; f++) {
        var track = pages[p].files[f]; if (seen[track.url]) continue;
        seen[track.url] = true;
        if (files.length >= 5000) throw self._error("This audiobook has too many audio tracks.");
        var basename = track.url.split("?")[0].split("/").pop();
        try { basename = decodeURIComponent(basename); } catch (_) {}
        basename = basename.replace(/[/\\\u0000-\u001f<>:"|?*]/g, "_").replace(/^\.+/, "_");
        if (basename.length > 180) basename = basename.slice(0, 160) + basename.slice(basename.lastIndexOf("."));
        // The app naturally sorts filenames: retain the website's exact player order.
        files.push({ name: ("0000" + (files.length + 1)).slice(-4) + "-" + basename, url: track.url, title: track.title });
      }
    }
    return self._remember(key, { audioFiles: files });
  });
  return JSON.parse(JSON.stringify(value));
};
GoldenAudiobooks.getSettings = function () {
  return [{ id: "verify", label: "Verify Website", type: "webview", url: this.BASE + "/", subtitle: "Complete a website check if one is requested, then retry." },
    { id: "playback", label: "Direct Audio", type: "label", subtitle: "No debrid service is required. Listening and downloads need an audiobook-capable Cinder build. Unavailable audio parts are reported instead of returning an incomplete book." }];
};
GoldenAudiobooks.completeSettingAction = async function () { this._cache = []; this._cooldownUntil = 0; };
__cinderExport = GoldenAudiobooks;
