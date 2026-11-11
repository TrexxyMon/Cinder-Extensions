// Knaben API v2, queried on-device. Remote preparation/downloads belong to Cinder.
var KnabenAudiobooks = {
  id: "knaben-audiobooks", name: "Knaben Audiobooks", version: "0.1.2-cinder",
  icon: "headset-outline", language: "Multilingual",
  description: "Search audiobook releases using Knaben and your connected debrid service.",
  contentType: "audiobooks", contentTypes: ["audiobook"],
  excludeFromDefaultMetadataProviders: true, debridSupport: "required",
  capabilities: { search: true, searchDownloads: true, discover: true, resolve: true, download: false, manga: false },
  downloadResults: { order: "source", limit: 40 },
  _cache: [], _pending: {}, _nextRequest: 0, _cooldownUntil: 0,
  API: "https://api.knaben.org/v2", CATEGORY: 1003000, PAGE_SIZE: 40
};
KnabenAudiobooks._text = function (value) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim() : "";
};
KnabenAudiobooks._count = function (value) {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value))) return undefined;
  var n = Number(value);
  return isFinite(n) && n >= 0 && Math.floor(n) === n && n <= 9007199254740991 ? n : undefined;
};
KnabenAudiobooks._hash = function (value) {
  if (typeof value !== "string") return "";
  if (/^[a-f0-9]{40}$/i.test(value)) return /^0{40}$/.test(value) ? "" : value.toLowerCase();
  if (!/^[a-z2-7]{32}$/i.test(value)) return "";
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", bits = 0, buffer = 0, hex = "";
  for (var i = 0; i < value.length; i++) {
    buffer = (buffer << 5) | alphabet.indexOf(value[i].toUpperCase()); bits += 5;
    if (bits >= 8) { bits -= 8; hex += ("0" + ((buffer >> bits) & 255).toString(16)).slice(-2); buffer &= (1 << bits) - 1; }
  }
  return /^0{40}$/.test(hex) ? "" : hex;
};
KnabenAudiobooks._identity = function (row) {
  var declared = row.hash == null ? "" : this._hash(row.hash), hashes = [], trackers = [];
  if (row.hash != null && !declared) return null;
  if (declared) hashes.push(declared);
  if (row.magnetUrl != null && row.magnetUrl !== "") {
    if (typeof row.magnetUrl !== "string" || row.magnetUrl.length > 20000 || !/^magnet:\?/i.test(row.magnetUrl)) return null;
    var parts = row.magnetUrl.slice(8).split("&");
    try {
      for (var i = 0; i < parts.length; i++) {
        var index = parts[i].indexOf("="), key = decodeURIComponent(parts[i].slice(0, index)).toLowerCase();
        var value = decodeURIComponent(parts[i].slice(index + 1));
        if (key === "xt" && /^urn:btih:/i.test(value)) {
          var hash = this._hash(value.slice(9)); if (!hash) return null;
          if (hashes.indexOf(hash) < 0) hashes.push(hash);
        }
        if (key === "tr" && trackers.length < 12 && /^(?:udp|https?):\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s<>"'\\]*)?$/i.test(value) && trackers.indexOf(value) < 0) trackers.push(value);
      }
    } catch (_) { return null; }
  }
  return hashes.length === 1 ? { hash: hashes[0], trackers: trackers } : null;
};
KnabenAudiobooks._item = function (row) {
  if (!row || !Array.isArray(row.categoryId) || !row.categoryId.some(function (id) { return Number(id) === 1003000; })) return null;
  var title = this._text(row.title).slice(0, 1000), identity = this._identity(row);
  if (!title || !identity) return null;
  var count = this._count(row.liveSeeders); if (count === undefined) count = this._count(row.seeders);
  var bytes = this._count(row.bytes), size;
  if (bytes > 0) {
    var power = Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024)));
    size = (bytes / Math.pow(1024, power)).toFixed(power ? 1 : 0) + " " + ["B", "KB", "MB", "GB", "TB"][power];
  }
  var magnet = "magnet:?xt=urn:btih:" + identity.hash + "&dn=" + encodeURIComponent(title.replace(/[\ud800-\udfff]/g, ""));
  identity.trackers.forEach(function (tracker) { magnet += "&tr=" + encodeURIComponent(tracker); });
  var description = this._text(row.description).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<[^>]*>/g, " ").slice(0, 12000);
  var formats = title.toLowerCase().match(/\b(?:m4b|mp3|m4a|flac|ogg|opus|aac|wav|zip|rar|7z)\b/g) || [];
  formats = formats.filter(function (f, i) { return formats.indexOf(f) === i; });
  var result = { id: identity.hash, url: identity.hash, title: title, size: size,
    format: formats.length === 1 ? formats[0] : "audiobook", description: description || undefined,
    date: typeof row.date === "string" && isFinite(Date.parse(row.date)) ? row.date : undefined,
    source: this._text(row.tracker) || this.name, contentType: "audiobooks", contentTypes: ["audiobook"],
    availabilityLabel: "Seeders", extra: { magnet: magnet, bytes: bytes > 0 ? bytes : undefined } };
  if (count !== undefined) { result.availability = count; result.seeders = count; }
  return result;
};
KnabenAudiobooks._remember = function (key, items) {
  this._cache = this._cache.filter(function (entry) { return entry.key !== key && entry.until > Date.now(); });
  this._cache.push({ key: key, items: items, until: Date.now() + 60000 });
  if (this._cache.length > 12) this._cache.shift();
  return items;
};
KnabenAudiobooks._get = function (key) {
  for (var i = 0; i < this._cache.length; i++) if (this._cache[i].key === key && this._cache[i].until > Date.now()) return this._cache[i].items;
  return null;
};
KnabenAudiobooks._request = function (query, page, order, hashSearch) {
  var self = this, q = this._text(query).slice(0, 200), n = Number(page);
  n = isFinite(n) && n >= 1 ? Math.min(100, Math.floor(n)) : 1;
  var url = this.API + (q ? "/search?q=" + encodeURIComponent(q) + "&sf=" + (hashSearch ? "hash" : "title") + "&" : "/browse?")
    + "c=" + this.CATEGORY + "&s=" + this.PAGE_SIZE + "&f=" + ((n - 1) * this.PAGE_SIZE) + "&o=" + (order === "date" ? "date" : "seeders") + "&d=desc&dead";
  // A provider may already cache a release with no current peers. Include those
  // in search and exact-hash revalidation; availability is still shown honestly.
  var cached = this._get(url); if (cached) return Promise.resolve(JSON.parse(JSON.stringify(cached)));
  if (this._pending[url]) return this._pending[url].then(function (items) { return JSON.parse(JSON.stringify(items)); });
  var work = (async function () {
    if (self._cooldownUntil > Date.now()) throw new Error("Knaben is limiting requests. Wait a moment, then retry.");
    // First-party status currently asks for no more than one request per two seconds.
    // Bound queued work to remain inside Cinder's search/browse time budgets.
    var wait = Math.max(0, self._nextRequest - Date.now());
    if (wait > 4200) throw new Error("Knaben has another search in progress. Please retry shortly.");
    self._nextRequest = Date.now() + wait + 2100;
    if (wait) await new Promise(function (resolve) { setTimeout(resolve, wait); });
    if (self._cooldownUntil > Date.now()) throw new Error("Knaben is limiting requests. Wait a moment, then retry.");
    var response;
    try { response = await cinder.fetch(url, { headers: { Accept: "application/json" }, timeout: 5000 }); }
    catch (_) { throw new Error("Knaben could not be reached. Please retry shortly."); }
    if (response && response.status === 429) {
      var headers = response.headers || {}, raw = headers["retry-after"] || headers["Retry-After"], seconds = Number(raw);
      var delay = raw && isFinite(seconds) ? seconds * 1000 : Date.parse(String(raw)) - Date.now();
      self._cooldownUntil = Date.now() + Math.max(30000, isFinite(delay) ? Math.min(delay, 86400000) : 0);
      throw new Error("Knaben is limiting requests. Wait a moment, then retry.");
    }
    if (!response || response.status < 200 || response.status >= 300) throw new Error("Knaben returned an unavailable response. Please retry later.");
    var data = response.data;
    if (typeof data === "string") {
      if (data.length > 3000000) throw new Error("Knaben returned too much data. Try a narrower search.");
      try { data = JSON.parse(data); } catch (_) { throw new Error("Knaben did not return readable search data. Please retry later."); }
    }
    if (!data || !Array.isArray(data.hits) || data.hits.length > 300) throw new Error("Knaben returned an unsupported search response.");
    var items = [], seen = {};
    for (var i = 0; i < data.hits.length && items.length < self.PAGE_SIZE; i++) {
      var item = self._item(data.hits[i]);
      if (item && !seen[item.id]) { seen[item.id] = true; items.push(item); }
    }
    return self._remember(url, items);
  })();
  this._pending[url] = work;
  return work.then(function (items) { delete self._pending[url]; return JSON.parse(JSON.stringify(items)); }, function (error) { delete self._pending[url]; throw error; });
};
KnabenAudiobooks.search = function (query, page) { return this._request(query, page, "seeders", false); };
KnabenAudiobooks.getDiscoverSections = async function () {
  return [{ id: "latest", title: "Latest Audiobooks", type: "latest" }, { id: "available", title: "Popular Audiobooks", type: "popular" }];
};
KnabenAudiobooks.getDiscoverItems = function (section, page) {
  return section === "latest" || section === "available" ? this._request("", page, section === "latest" ? "date" : "seeders", false) : Promise.resolve([]);
};
KnabenAudiobooks._find = async function (id) {
  var hash = this._hash(id); if (!hash) throw new Error("Invalid Knaben audiobook. Search again and select a result.");
  for (var i = 0; i < this._cache.length; i++) if (this._cache[i].until > Date.now()) {
    var match = this._cache[i].items.find(function (item) { return item.id === hash; });
    if (match) return JSON.parse(JSON.stringify(match));
  }
  var items = await this._request(hash, 1, "seeders", true);
  var result = items.find(function (item) { return item.id === hash; });
  if (!result) throw new Error("This audiobook release is no longer available from Knaben. Search again.");
  return result;
};
KnabenAudiobooks.getBookDetails = function (id) { return this._find(id); };
KnabenAudiobooks.resolve = async function (item) {
  // Do not trust restored extra fields or accept a similarly named release.
  var fresh = await this._find(item && item.id);
  return { debridLink: fresh.extra.magnet, fileSize: fresh.extra.bytes };
};
KnabenAudiobooks.getSettings = function () {
  return [{ id: "service", label: "Connected Debrid Required", type: "label", subtitle: "Searches only audiobooks. A connected debrid service prepares the selected files for Cinder." }];
};
__cinderExport = KnabenAudiobooks;
