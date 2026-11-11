// Query-only compatibility for catalogs spelling "Work: Series: Book 2".
// Preserve ambiguous titles, source result names, IDs, and ordinary direct searches.
function cinderAudiobookCatalogQuery(query) {
  var raw = typeof query === "string" ? query : "";
  if (raw.length > 2048) return raw;
  var value = raw.replace(/\s+/g, " ").trim(), stack = [], parts = [], start = 0;
  var decoration = /^(?:(?:unabridged|abridged)(?: audio\s?book)?|audio\s?book|dramatized adaptation|(?:english|spanish|french|german|italian|portuguese) edition)$/i;
  // Only balanced annotations are eligible for shortening.
  for (var i = 0; i < value.length; i++) {
    var char = value.charAt(i);
    if (char === "(" || char === "[") stack.push(char);
    else if (char === ")" || char === "]") {
      if (stack.pop() !== (char === ")" ? "(" : "[")) return raw;
    }
  }
  if (stack.length) return raw;
  for (;;) {
    var group = value.match(/\s*(\(([^()]*)\)|\[([^\[\]]*)\])$/);
    if (!group || !decoration.test((group[2] || group[3] || "").trim())) break;
    value = value.slice(0, group.index).trim();
  }
  for (var j = 0; j < value.length; j++) {
    var c = value.charAt(j);
    if (c === "(" || c === "[") stack.push(c);
    else if (c === ")" || c === "]") stack.pop();
    else if (!stack.length) {
      var separator = value.slice(j).match(/^(?::|[\u2013\u2014]|\s+-{1,2}\s+)/);
      if (separator) { parts.push({ text: value.slice(start, j).trim(), start: start }); j += separator[0].length - 1; start = j + 1; }
    }
  }
  parts.push({ text: value.slice(start).trim(), start: start });
  for (var k = 2; k < parts.length; k++) {
    var label = parts[k].text.match(/^(?:book|volume|vol\.?|tome|livre|libro|livro|volumen|band|teil)\s+(.+)$/i);
    if (!label) continue;
    var n = label[1], roman = n.toUpperCase();
    var valid = /^\d+(?:\.\d+)?(?:st|nd|rd|th)?$/i.test(n)
      || /^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?)$/i.test(n)
      || ((n === roman || n === n.toLowerCase()) && /^[IVXLCDM]+$/.test(roman) && /^M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/.test(roman));
    if (!valid || !parts[k - 1].text || decoration.test(parts[k - 1].text)) continue;
    if (!parts.slice(k + 1).every(function (part) { return decoration.test(part.text); })) continue;
    // Several numbered prefixes are ambiguous; do not guess which work is intended.
    if (parts.slice(0, k).some(function (part) { return /(?:\b(?:book|volume|vol\.?|part|tome|livre|libro|livro|volumen|band|teil)\s+|#\s*)[\w.]+\s*$/i.test(part.text); })) continue;
    var work = value.slice(0, parts[k - 1].start).replace(/\s*(?::|[-\u2013\u2014]{1,2})\s*$/, "").trim();
    return work.length >= 2 ? work : raw;
  }
  return raw;
}

// AudioBookBay for Cinder. Public HTML is fetched and parsed on-device.
// Only the detail page's validated torrent identity is returned to debrid.
// Advertisements, sample audio and "Direct Download" landing pages are ignored.
var AudioBookBaySource = {
  id: "audiobookbay",
  name: "AudioBookBay",
  version: "0.1.6-cinder",
  icon: "headset-outline",
  description: "Search audiobook releases and resolve their torrents through a connected debrid service.",
  language: "Multilingual",
  contentType: "audiobooks",
  contentTypes: ["audiobook"],
  excludeFromDefaultMetadataProviders: true,
  debridSupport: "required",
  debridDescription: "Requires a connected debrid service.",
  browser: { startUrl: "https://audiobookbay.lu/", userAgent: "desktop" },
  capabilities: { search: true, searchDownloads: true, discover: true, resolve: true, download: false, manga: false },
  downloadResults: { order: "source", limit: 40 },
  BASE: "https://audiobookbay.lu",
  _cache: [], _pending: {}, _browserTail: null, _browserPending: 0, _cooldownUntil: 0
};

AudioBookBaySource._text = function (value) { return String(value || "").replace(/\s+/g, " ").trim(); };
AudioBookBaySource._base = async function () {
  var value = cinder.store && typeof cinder.store.get === "function" ? await cinder.store.get("website") : null;
  if (!value) return this.BASE;
  value = this._text(value).replace(/\/$/, "");
  // Explicit user-selected HTTPS mirror only; never arbitrary/private hosts or paths.
  if (!/^https:\/\/(?:www\.)?audiobookbay\.[a-z]{2,12}$/i.test(value) || /\.(?:local|test|internal|localhost)$/i.test(value))
    throw new Error("Use an AudioBookBay HTTPS website address without a path, such as https://audiobookbay.lu.");
  return value.toLowerCase();
};
AudioBookBaySource._settings = function (base) {
  return [
    { id: "website", label: "Website", type: "text", defaultValue: this.BASE, placeholder: this.BASE,
      subtitle: "Change only if AudioBookBay announces a new website address." },
    { id: "verify", label: "Verify Website", type: "webview", url: base + "/",
      subtitle: "Complete a website check if needed, then return and retry." },
    { id: "download_info", label: "Connected Debrid Required", type: "label",
      subtitle: "Uses torrent magnets with your connected Cinder debrid service. Audiobook playback requires a Cinder build with audiobook support." }
  ];
};
AudioBookBaySource.getSettings = function () { return this._settings(this.BASE); };
AudioBookBaySource.getSettingsAsync = async function () { return this._settings(await this._base()); };
AudioBookBaySource.completeSettingAction = async function () { this._cache = []; this._cooldownUntil = 0; };

AudioBookBaySource._url = function (value, base) {
  var raw = String(value || "").trim().replace(/&amp;/g, "&");
  if (!raw || /[\u0000-\u0020\\]/.test(raw)) return "";
  var url = "";
  try {
    if (typeof cinder.resolveUrl === "function") url = cinder.resolveUrl(raw, base + "/");
    else if (/^https?:\/\//i.test(raw)) url = raw;
    else if (raw.indexOf("//") === 0) url = "https:" + raw;
    else if (raw.charAt(0) === "/") url = base + raw;
  } catch (_) { return ""; }
  return /^https?:\/\/[a-z0-9.-]+(?::\d+)?\/[^\s]*$/i.test(url) ? url : "";
};
AudioBookBaySource._path = function (value) {
  var raw = String(value || "").trim();
  if (/^https:\/\/(?:www\.)?audiobookbay\.[a-z]{2,12}\//i.test(raw)) raw = raw.replace(/^https:\/\/[^/]+/i, "");
  // No comment anchors, queries, ads, dot segments, or links to another website.
  var match = /^\/(?:abss|audio-books)\/([a-z0-9][a-z0-9%_-]{0,700})\/?(?:#.*)?$/i.exec(raw);
  if (!match || /%(?![a-f0-9]{2})|%(?:2f|5c|2e|00)/i.test(match[1])) return "";
  return raw.split("#")[0].replace(/\/?$/, "/");
};
AudioBookBaySource._remember = function (key, value, ttl) {
  this._cache = this._cache.filter(function (row) { return row.key !== key && row.until > Date.now(); });
  this._cache.push({ key: key, value: value, until: Date.now() + ttl });
  if (this._cache.length > 24) this._cache.shift();
  return value;
};
AudioBookBaySource._get = function (key) {
  for (var i = 0; i < this._cache.length; i++) if (this._cache[i].key === key && this._cache[i].until > Date.now()) return this._cache[i].value;
  return null;
};
AudioBookBaySource._single = function (key, work) {
  if (this._pending[key]) return this._pending[key];
  var self = this, result = Promise.resolve().then(work);
  this._pending[key] = result;
  return result.then(function (value) { delete self._pending[key]; return value; }, function (error) { delete self._pending[key]; throw error; });
};
AudioBookBaySource._headers = async function (url) {
  var headers = { Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" };
  if (typeof cinder.getBrowserSessionHeaders === "function") {
    // Public pages remain usable when an older/Expo cookie bridge is unavailable.
    try {
      var session = await cinder.getBrowserSessionHeaders(url);
      if (session && session.Cookie) headers.Cookie = session.Cookie;
    } catch (_) {}
  }
  return headers;
};
AudioBookBaySource._document = function (response, detail, search) {
  var html = response && typeof response.data === "string" ? response.data : "";
  if (html.length > 2000000) throw new Error("AudioBookBay returned an unusually large page. Try a narrower search.");
  if (!response || response.status < 200 || response.status >= 400 || !html) return null;
  var doc = cinder.parseHTML(html), main = doc.querySelector("#content");
  if (!main) return null;
  // A redirected homepage also contains .postTitle results. Search must have
  // the site's search heading before accepting or caching those posts.
  if (search && !main.querySelector(".archiveTitle")) return null;
  if (main.querySelector(detail ? ".postTitle h1" : ".postTitle h2 a")) return doc;
  if (!detail && main.querySelector(".archiveTitle") && /Please try again with another query/i.test(main.text())) return doc;
  return null;
};
AudioBookBaySource._browserPage = function (url, headers, detail, browse, search, deadline) {
  if (this._browserPending >= 4) return Promise.reject(new Error("AudioBookBay is busy. Retry shortly."));
  var self = this, previous = this._browserTail || Promise.resolve();
  this._browserPending++;
  var request = previous.catch(function () {}).then(async function () {
    if (self._cooldownUntil > Date.now()) throw new Error("AudioBookBay is limiting requests. Wait a moment, then retry.");
    var timeout = Math.min(browse ? 4000 : 6000, deadline - Date.now());
    if (timeout < 500) throw new Error("AudioBookBay browser search timed out. Retry shortly.");
    headers["X-Cinder-Suppress-Interactive"] = "1";
    headers["X-Cinder-Wait-For-Selector"] = detail ? "#content .postTitle h1" : search ? "#content .archiveTitle" : "#content .postTitle h2, #content .archiveTitle";
    headers["X-Cinder-Min-Wait-Ms"] = "300";
    headers["X-Cinder-Max-Wait-Ms"] = String(Math.max(300, timeout - 1000));
    headers["X-Cinder-Visible-Layout"] = "1";
    var response = await cinder.fetchBrowser(url, { browserUserAgent: "desktop", headers: headers, timeout: timeout });
    if (response && response.status === 429) self._cooldownUntil = Date.now() + 30000;
    return response;
  });
  this._browserTail = request;
  return request.then(function (response) {
    self._browserPending--; if (self._browserTail === request) self._browserTail = null;
    return response;
  }, function (error) {
    self._browserPending--; if (self._browserTail === request) self._browserTail = null;
    throw error;
  });
};
AudioBookBaySource._page = async function (url, detail, browse, search) {
  if (this._cooldownUntil > Date.now()) throw new Error("AudioBookBay is limiting requests. Wait a moment, then retry.");
  var deadline = Date.now() + (browse ? 8500 : 13500);
  var headers = await this._headers(url), response = null;
  try { response = await cinder.fetch(url, { headers: headers, timeout: browse ? 4000 : 5500 }); } catch (_) {}
  if (response && response.status === 429) {
    this._cooldownUntil = Date.now() + 30000;
    throw new Error("AudioBookBay is limiting requests. Wait 30 seconds, then retry.");
  }
  if (detail && response && response.status === 404) throw new Error("This AudioBookBay release is no longer available.");
  var doc = this._document(response, detail, search);
  if (doc) return doc;
  // One bounded hidden-browser fallback; manual verification remains an explicit setting.
  if (typeof cinder.fetchBrowser === "function") {
    try {
      response = await this._browserPage(url, headers, detail, browse, search, deadline);
    } catch (_) { response = null; }
    if (this._cooldownUntil > Date.now()) throw new Error("AudioBookBay is limiting requests. Wait a moment, then retry.");
    doc = this._document(response, detail, search);
    if (doc) return doc;
  }
  throw new Error("AudioBookBay did not return a readable page. Open extension settings > Verify Website, complete any website check, then retry.");
};

AudioBookBaySource._item = function (post, base, path) {
  var heading = post.querySelector(".postTitle h2 a") || post.querySelector(".postTitle h1");
  if (!heading) return null;
  var id = path || this._path(heading.attr("href"));
  var label = this._text(heading.text());
  if (!id || !label) return null;
  var split = label.lastIndexOf(" - "), author = post.querySelector(".desc .author");
  var image = post.querySelector(".postContent .center img"), info = post.querySelector(".postInfo"), body = post.querySelector(".postContent");
  var bodyText = body ? this._text(body.text()) : "", infoText = info ? this._text(info.text()) : "";
  var formatNode = post.querySelector(".desc .format");
  var formatMatch = /Format:\s*([^/\s]+)\s*(?:\/|Bitrate:)/i.exec(bodyText);
  var format = this._text(formatNode ? formatNode.text() : formatMatch ? formatMatch[1] : "").toLowerCase();
  var size = /(?:Combined )?File Size:\s*([\d.,]+)\s*([KMGT]?B)s?\b/i.exec(bodyText);
  var language = /Language:\s*(.*?)(?:Keywords:|$)/i.exec(infoText);
  var cover = image ? this._url(image.attr("data-src") || image.attr("src"), base) : "";
  var result = { id: id, url: base + id, title: split > 0 ? label.slice(0, split).trim() : label,
    author: author ? this._text(author.text()) : split > 0 ? label.slice(split + 3).trim() : undefined,
    cover: cover || undefined, format: /^(?:m4b|mp3|m4a|flac|ogg|opus|aac|wav|zip|rar|7z)$/.test(format) ? format : "audiobook",
    size: size ? size[1] + " " + size[2].toUpperCase() : undefined,
    language: language ? language[1].trim() : undefined,
    contentType: "audiobooks", contentTypes: ["audiobook"], source: this.name,
    availabilityLabel: "Seeders",
    extra: { releaseTitle: label, debridRequired: true } };
  // Only explicit release-statistic cells count. Missing does not mean zero;
  // comments, tracker lists, downloads and prose are not availability counts.
  var stats = post.querySelectorAll(".postContent table tr");
  for (var s = 0; s < stats.length; s++) {
    var cells = stats[s].querySelectorAll("td");
    if (cells.length !== 2 || !/^(?:seeders|seeds):?$/i.test(this._text(cells[0].text()))) continue;
    var countText = this._text(cells[1].text());
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(countText)) continue;
    var count = Number(countText.replace(/,/g, ""));
    if (count <= 9007199254740991) { result.availability = count; result.seeders = count; break; }
  }
  var narrator = post.querySelector(".desc .narrator"), bitrate = post.querySelector(".desc .bitrate");
  if (narrator) result.extra.narrator = this._text(narrator.text());
  if (bitrate) result.extra.bitrate = this._text(bitrate.text());
  var genres = post.querySelectorAll('.postInfo a[rel~="category"]');
  if (genres.length) result.genres = genres.map(function (entry) { return entry.text().trim(); }).filter(Boolean);
  var desc = post.querySelector(".desc");
  if (desc) {
    var paragraphs = desc.querySelectorAll("p"), parts = [];
    for (var i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].querySelector(".author, .narrator, .format")) continue;
      var text = this._text(paragraphs[i].text());
      if (text) parts.push(text);
    }
    if (parts.length) result.description = parts.join("\n\n").slice(0, 20000);
  }
  return result;
};
AudioBookBaySource._listing = function (doc, base) {
  var posts = doc.querySelectorAll("#content .post"), result = [], seen = {};
  for (var i = 0; i < posts.length && result.length < 40; i++) {
    var item = this._item(posts[i], base);
    if (item && !seen[item.id]) { seen[item.id] = true; result.push(item); }
  }
  return result;
};
AudioBookBaySource._list = async function (query, page, category, browse) {
  // The website redirects capitalized query values to its homepage. Normalize
  // only the request/cache key; leave release titles and stable IDs untouched.
  var self = this, base = await this._base(), q = this._text(query).toLowerCase().slice(0, 50);
  var number = Number(page), n = isFinite(number) && number > 1 ? Math.min(500, Math.floor(number)) : 1;
  var path = category ? "/audio-books/type/" + category + "/" : "/";
  if (n > 1) path += "page/" + n + "/";
  var url = base + path + (q ? "?s=" + encodeURIComponent(q) : ""), key = "list:" + url;
  var cached = this._get(key);
  if (cached) return JSON.parse(JSON.stringify(cached));
  var results = await this._single(key, async function () {
    return self._remember(key, self._listing(await self._page(url, false, browse, !!q), base), 30000);
  });
  return JSON.parse(JSON.stringify(results));
};
AudioBookBaySource.search = function (query, page) { return this._list(cinderAudiobookCatalogQuery(query), page, "", false); };
AudioBookBaySource.getDiscoverSections = async function () {
  return [{ id: "latest", title: "Latest Audiobooks", type: "latest" },
    { id: "general-fiction", title: "Fiction", type: "genres" }, { id: "fantasy", title: "Fantasy", type: "genres" },
    { id: "mystery", title: "Mystery", type: "genres" }, { id: "sci-fi", title: "Science Fiction", type: "genres" }];
};
AudioBookBaySource.getDiscoverItems = function (section, page) {
  if (["latest", "general-fiction", "fantasy", "mystery", "sci-fi"].indexOf(section) < 0) return Promise.resolve([]);
  return this._list("", page, section === "latest" ? "" : section, true);
};
AudioBookBaySource._hash = function (value) {
  var hash = this._text(value);
  if (/^[a-f0-9]{40}$/i.test(hash)) return /^0{40}$/.test(hash) ? "" : hash.toLowerCase();
  if (!/^[a-z2-7]{32}$/i.test(hash)) return "";
  // Canonicalize the two encodings before comparing a table hash with a magnet.
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", bits = 0, buffer = 0, hex = "";
  for (var i = 0; i < hash.length; i++) {
    buffer = (buffer << 5) | alphabet.indexOf(hash[i].toUpperCase()); bits += 5;
    if (bits >= 8) { bits -= 8; hex += ("0" + ((buffer >> bits) & 255).toString(16)).slice(-2); buffer &= (1 << bits) - 1; }
  }
  return /^0{40}$/.test(hex) ? "" : hex;
};
AudioBookBaySource._torrent = function (post, item) {
  var rows = post.querySelectorAll(".postContent table tr"), hashes = [], trackers = [], size;
  for (var i = 0; i < rows.length; i++) {
    var cells = rows[i].querySelectorAll("td");
    if (cells.length < 2) continue;
    var name = this._text(cells[0].text()).replace(/:$/, "").toLowerCase(), value = this._text(cells[1].text());
    if (name === "info hash") {
      var hash = this._hash(value);
      if (!hash) throw new Error("AudioBookBay returned an invalid torrent identity. No download was started.");
      if (hashes.indexOf(hash) < 0) hashes.push(hash);
    }
    if (name === "tracker" || name === "announce url") {
      if (/^(?:udp|https?):\/\/[a-z0-9.-]+(?::\d+)?\/[^\s<>"']{1,1000}$/i.test(value) && trackers.indexOf(value) < 0 && trackers.length < 12) trackers.push(value);
    }
    if (name === "combined file size") size = value;
  }
  // The hash table is available without the site's optional magnet-click/login script.
  // If only an explicit magnet exists, accept its validated identity, not unrelated links.
  var anchors = post.querySelectorAll('a[href^="magnet:"]');
  for (var a = 0; a < anchors.length; a++) {
    var magnet = anchors[a].attr("href") || "", match = /[?&]xt=urn(?::|%3A)btih(?::|%3A)([a-z0-9]+)(?:&|$)/i.exec(magnet);
    var candidate = match ? this._hash(match[1]) : "";
    if (candidate && hashes.indexOf(candidate) < 0) hashes.push(candidate);
  }
  if (!hashes.length) throw new Error("This release has no valid torrent link. Open Verify Website and retry; direct-download advertisements are not audiobook files.");
  if (hashes.length !== 1) throw new Error("AudioBookBay returned conflicting torrent identities. Open the release on its website to check it before downloading.");
  var link = "magnet:?xt=urn:btih:" + hashes[0] + "&dn=" + encodeURIComponent(item.extra.releaseTitle);
  for (var t = 0; t < trackers.length; t++) link += "&tr=" + encodeURIComponent(trackers[t]);
  var sizeMatch = /^([\d.]+)\s*([KMGT]?B)s?$/i.exec((size || "").replace(/,/g, "")), bytes;
  if (sizeMatch) {
    bytes = Math.round(Number(sizeMatch[1]) * Math.pow(1024, ["B", "KB", "MB", "GB", "TB"].indexOf(sizeMatch[2].toUpperCase())));
    if (!(bytes > 0 && bytes <= 9007199254740991)) bytes = undefined;
  }
  // Omit url/fileName: neither HTML nor a fabricated single-track file is downloadable.
  return { debridLink: link, fileSize: bytes };
};
AudioBookBaySource._detail = async function (id) {
  var self = this, path = this._path(id);
  if (!path) throw new Error("Invalid AudioBookBay release. Search again and select the release.");
  var base = await this._base(), key = "detail:" + base + path, cached = this._get(key);
  if (cached) return cached;
  return this._single(key, async function () {
    var doc = await self._page(base + path, true, false), post = doc.querySelector("#content .post");
    var item = post && self._item(post, base, path);
    if (!item) throw new Error("AudioBookBay returned no readable release details.");
    // Details may display even when a torrent has been removed; resolution reports that separately.
    var resolved = null, resolveError = "";
    try { resolved = self._torrent(post, item); } catch (error) { resolveError = error.message; }
    return self._remember(key, { item: item, resolved: resolved, resolveError: resolveError }, 60000);
  });
};
AudioBookBaySource.getBookDetails = async function (id) {
  var value = await this._detail(id);
  return JSON.parse(JSON.stringify(value.item));
};
AudioBookBaySource.resolve = async function (item) {
  var value = await this._detail(item && (item.id || item.url));
  if (!value.resolved) throw new Error(value.resolveError);
  return JSON.parse(JSON.stringify(value.resolved));
};
__cinderExport = AudioBookBaySource;
