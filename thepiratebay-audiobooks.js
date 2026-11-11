// Independent Cinder extension. Search and validation run on the device.
// Only category 102 (Audio books) is accepted; magnets go to Cinder's debrid flow.
var PirateBayAudiobooks = {
  id: "thepiratebay-audiobooks",
  name: "The Pirate Bay Audiobooks",
  version: "0.1.3-cinder",
  icon: "headset-outline",
  description: "Find audiobook releases and download them through your connected debrid service.",
  language: "Multilingual",
  contentType: "audiobooks",
  contentTypes: ["audiobook"],
  excludeFromDefaultMetadataProviders: true,
  debridSupport: "required",
  capabilities: { search: true, searchDownloads: true, resolve: true, discover: false, download: false, manga: false },
  downloadResults: { order: "popularity", limit: 50 },
  _cache: [], _pending: {}, _cooldownUntil: 0
};

PirateBayAudiobooks._text = function (value) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
};
PirateBayAudiobooks._number = function (value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return undefined;
  var n = Number(value);
  return isFinite(n) && n >= 0 && n <= 9007199254740991 && Math.floor(n) === n ? n : undefined;
};
PirateBayAudiobooks._identity = function (id) {
  var match = /^([1-9]\d{0,19}):([a-f0-9]{40})$/i.exec(String(id || ""));
  if (!match || /^0{40}$/.test(match[2])) throw new Error("This audiobook result has no valid download identity. Search again.");
  return { id: match[1], hash: match[2].toLowerCase() };
};
PirateBayAudiobooks._size = function (bytes) {
  if (bytes === undefined) return undefined;
  var units = ["B", "KiB", "MiB", "GiB", "TiB"], n = bytes, unit = 0;
  while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit++; }
  return (unit ? Math.round(n * 100) / 100 : n) + " " + units[unit];
};
PirateBayAudiobooks._error = function (message, status) {
  var error = new Error(message); error.stopSearch = true;
  if (status) error.status = status;
  return error;
};
PirateBayAudiobooks._json = async function (path) {
  if (this._cooldownUntil > Date.now()) throw this._error("The Pirate Bay is limiting requests. Wait a moment, then retry.", 429);
  var response;
  try { response = await cinder.fetch("https://apibay.org" + path, { headers: { Accept: "application/json" }, timeout: 12000 }); }
  catch (error) {
    throw this._error("The Pirate Bay search service could not be reached. Check your connection and retry.", error && (error.status || error.response && error.response.status));
  }
  if (!response) throw this._error("The Pirate Bay returned no response. Try again later.");
  if (response.status === 429 || response.status === 503) {
    var retry, headers = response.headers || {};
    Object.keys(headers).some(function (key) { if (key.toLowerCase() === "retry-after") { retry = String(headers[key]); return true; } return false; });
    var wait = /^\d+$/.test(retry || "") ? Number(retry) * 1000 : Date.parse(retry || "") - Date.now();
    this._cooldownUntil = Date.now() + Math.min(300000, Math.max(30000, isFinite(wait) ? wait : 30000));
    throw this._error("The Pirate Bay search service is busy. Wait a moment, then retry.", response.status);
  }
  if (response.status < 200 || response.status >= 300) throw this._error("The Pirate Bay search service returned HTTP " + response.status + ". Try again later.", response.status);
  var raw = response.data;
  if (typeof raw === "string") {
    if (raw.length > 2000000) throw this._error("The Pirate Bay returned too much data. Try a narrower search.");
    try { return JSON.parse(raw); } catch (_) { throw this._error("The Pirate Bay returned a webpage instead of search data. Try again later."); }
  }
  if (raw && typeof raw === "object") return raw;
  throw this._error("The Pirate Bay returned invalid search data. Try again later.");
};
PirateBayAudiobooks._item = function (row) {
  if (!row || String(row.category) !== "102" || !/^[1-9]\d{0,19}$/.test(String(row.id || ""))) return null;
  var hash = typeof row.info_hash === "string" ? row.info_hash.toLowerCase() : "";
  if (!/^[a-f0-9]{40}$/.test(hash) || /^0{40}$/.test(hash)) return null;
  var title = this._text(row.name);
  if (!title || title.length > 1000) return null;
  var count = this._number(row.seeders), size = this._number(row.size), added = this._number(row.added);
  var date = added && added <= 253402300799 ? new Date(added * 1000).toISOString() : undefined;
  var formats = title.match(/\b(?:m4b|mp3|m4a|flac|ogg|opus|aac|wav)\b/gi) || [];
  var unique = []; formats.forEach(function (f) { f = f.toLowerCase(); if (unique.indexOf(f) < 0) unique.push(f); });
  return {
    id: String(row.id) + ":" + hash,
    title: title,
    url: "magnet:?xt=urn:btih:" + hash + "&dn=" + encodeURIComponent(title),
    format: unique.length === 1 ? unique[0] : "audiobook",
    size: this._size(size), date: date,
    availability: count, availabilityLabel: "Seeders", seeders: count,
    contentType: "audiobooks", contentTypes: ["audiobook"], source: this.name,
    extra: { debridRequired: true, sizeBytes: size, fileCount: this._number(row.num_files) }
  };
};
PirateBayAudiobooks.search = async function (query, page) {
  // The upstream API returns one bounded result set, not independently paged results.
  // Cinder's download search starts at zero; its individual-source browser at one.
  if (Number(page) > 1) return [];
  var q = this._text(query).slice(0, 200);
  if (!q) return [];
  var self = this, key = "q:" + q, now = Date.now();
  this._cache = this._cache.filter(function (entry) { return entry.until > now; });
  for (var i = 0; i < this._cache.length; i++) if (this._cache[i].key === key) return JSON.parse(JSON.stringify(this._cache[i].items));
  if (!this._pending[key]) {
    this._pending[key] = (async function () {
      var rows = await self._json("/q.php?q=" + encodeURIComponent(q) + "&cat=102");
      if (!Array.isArray(rows) || rows.length > 1000) throw self._error("The Pirate Bay returned an invalid result list. Try again later.");
      var items = [], hashes = {};
      for (var j = 0; j < rows.length && items.length < 100; j++) {
        var item = self._item(rows[j]);
        if (!item) continue;
        var hash = self._identity(item.id).hash;
        if (hashes[hash]) continue;
        hashes[hash] = true; items.push(item);
      }
      self._cache.push({ key: key, items: items, until: Date.now() + 60000 });
      if (self._cache.length > 8) self._cache.shift();
      return items;
    })();
  }
  try { return JSON.parse(JSON.stringify(await this._pending[key])); }
  finally { delete this._pending[key]; }
};
PirateBayAudiobooks.resolve = async function (item) {
  var identity = this._identity(item && item.id), title = this._text(item && item.title).slice(0, 1000);
  // The immutable info hash comes from the validated result ID, never an ad URL
  // or another search hit. No extra detail fetch or on-device torrent client.
  var resolved = { debridLink: "magnet:?xt=urn:btih:" + identity.hash + (title ? "&dn=" + encodeURIComponent(title) : "") };
  var bytes = this._number(item && item.extra && item.extra.sizeBytes);
  if (bytes !== undefined && bytes > 0) resolved.fileSize = bytes;
  return resolved;
};
PirateBayAudiobooks.getSettings = function () {
  return [{ id: "download_info", label: "Connected Debrid Required", type: "label",
    subtitle: "Searches Audio books only. Downloads are handled by your connected Cinder debrid service. Zero seeders can still work when a service already has a cached copy." }];
};
__cinderExport = PirateBayAudiobooks;
