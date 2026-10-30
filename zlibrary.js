// Z-Library account extension, originally created by Stick.
// Automatic API mirror fallback and optional session-key sign-in are informed by
// https://github.com/imprisonedmind/cinder-zlib (Unlicense).
// All network/source behavior stays in this extension; no app changes required.

var Zlibrary = {};

Zlibrary.id = "zlibrary";
Zlibrary.name = "Z-Library";
Zlibrary.version = "1.3.1";
Zlibrary.icon = "book-outline";
Zlibrary.description = "Search, discover, and download ebooks through your Z-Library account.";

// Ce champ ROUTE l'ouverture d'un resultat : avec "manga", Cinder part vers le lecteur de
// chapitres et n'appelle jamais resolve(). Les sources de telechargement font "books".
Zlibrary.contentType = "books";
Zlibrary.contentTypes = ["ebook"];

Zlibrary.capabilities = {
  search: true,
  discover: true,
  // Pas d'URL directe dans les resultats : le lien s'obtient en deux temps.
  download: false,
  resolve: true,
  searchDownloads: true,
  bookChapters: false,
  manga: false,
};

Zlibrary.getSettings = function () {
  var candidates = this._settingsBase || "https://z-library.ec";
  return [
    {
      // Preserve the existing user-selected origin and storage key.
      id: "domaine",
      label: "Z-Library Domain",
      type: "select",
      defaultValue: "",
      options: this._domainOptions(),
      subtitle: "Auto remembers a working mirror. Existing domain selections are preserved.",
    },
    { id: "custom_domain", label: "Custom Domain (optional)", type: "text",
      placeholder: "Used only when Custom is selected" },
    {
      id: "langues",
      label: "Preferred Languages",
      type: "text",
      placeholder: "french, english - blank means all languages",
    },
    { id: "email", label: "Email Address", type: "text", placeholder: "you@example.com" },
    { id: "motdepasse", label: "Password", type: "password", placeholder: "Your Z-Library password" },
    { id: "automatic_mirrors", label: "Automatic Mirror Fallback", type: "toggle", defaultValue: true,
      subtitle: "Try other mirrors when a specific domain is selected. Auto always uses fallback." },
    { id: "preferred_format", label: "Preferred Format", type: "select", defaultValue: "", options: [
      { label: "Any", value: "" }, { label: "EPUB", value: "epub" }, { label: "PDF", value: "pdf" },
      { label: "MOBI", value: "mobi" }, { label: "AZW3", value: "azw3" },
    ] },
    { id: "remix_userid", label: "Remix User ID (optional)", type: "text", placeholder: "From your signed-in browser" },
    { id: "remix_userkey", label: "Remix User Key (optional)", type: "password", placeholder: "From your signed-in browser",
      subtitle: "Use both session keys instead of email and password." },
    { id: "verify_website", label: "Verify Website", type: "webview", url: candidates,
      userAgent: this.UA, subtitle: "Complete any required browser check, then return and retry." },
  ];
};

Zlibrary.UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";


// Mirror strategy informed by imprisonedmind/cinder-zlib (Unlicense) and
// ZlibraryKO/zlibrary.koplugin. Existing settings/session/result keys stay stable.
Zlibrary._MIRROR_SOURCE = "https://raw.githubusercontent.com/ZlibraryKO/zlibrary.koplugin/main/assets/domains.json";
Zlibrary._MIRROR_TTL = 7 * 24 * 60 * 60 * 1000;
Zlibrary._SEEDS = ["z-library.ec", "librella.fi", "lexlib.fi", "bookabooki.fi", "article.sk", "1lib.sk", "z-lib.gd", "z-lib.gl", "z-library.sk"];
Zlibrary._mirrorRefresh = null;
Zlibrary._mirrorRefreshAt = 0;
Zlibrary._browserTask = null;
Zlibrary._warmupTask = null;
Zlibrary._loginTask = null;

Zlibrary._domainOptions = function () {
  var options = [{ label: "Auto (recommended)", value: "" }], known = [], self = this;
  function add(value) {
    var base = self._normalizeBase(value);
    if (!base || known.indexOf(base) >= 0) return;
    known.push(base); options.push({ label: base.slice(8), value: base.slice(8) });
  }
  this._SEEDS.forEach(add);
  (this._settingsDomains || []).forEach(add);
  // Saved URLs can include https:// or a trailing /eapi. Include the exact
  // stored value so the existing setting remains selected without migration.
  if (this._savedDomain && this._savedDomain !== "custom" && !options.some(function (item) { return item.value === self._savedDomain; })) {
    var saved = this._normalizeBase(this._savedDomain);
    if (saved) options.push({ label: saved.slice(8) + " (saved)", value: this._savedDomain });
  }
  options.push({ label: "Custom", value: "custom" });
  return options;
};

Zlibrary._lire = async function (key, secret) {
  var value = await (secret ? cinder.secureStore : cinder.store).get(key);
  return value == null ? "" : String(value).trim();
};
Zlibrary._error = function (kind, message) {
  var error = new Error(message); error.kind = kind; return error;
};
Zlibrary._normalizeBase = function (value) {
  var host = String(value || "").trim().replace(/^https:\/\//i, "").replace(/\/+$/, "").replace(/\/eapi$/i, "").toLowerCase();
  // A mirror is an HTTPS origin, never a URL containing credentials, a port,
  // a path, or a private IP. Do not turn arbitrary feed strings into auth URLs.
  if (host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return "";
  return "https://" + host;
};
Zlibrary._base = async function () {
  var selected = await this._lire("domaine", false);
  this._savedDomain = selected;
  this._autoDomain = !selected;
  var value = selected === "custom" ? await this._lire("custom_domain", false) : selected || "z-library.ec";
  var base = this._normalizeBase(value);
  if (!base) throw this._error("config", "Enter a valid HTTPS Z-Library domain in the extension settings.");
  this._settingsBase = base;
  return base;
};
Zlibrary._form = function (fields) {
  return Object.keys(fields).filter(function (key) { return fields[key] !== undefined; }).map(function (key) {
    return encodeURIComponent(key) + "=" + encodeURIComponent(String(fields[key]));
  }).join("&");
};
Zlibrary._parseJson = function (value) {
  for (var unwrap = 0; unwrap < 3; unwrap++) {
    if (value && typeof value === "object") return Array.isArray(value) ? null : value;
    if (typeof value !== "string" || value.length > 4 * 1024 * 1024) return null;
    var text = value.replace(/^\uFEFF/, "").trim();
    if (!text || text.charAt(0) === "<") return null;
    try { value = JSON.parse(text); continue; } catch (_) { /* Bounded trailing-noise recovery below. */ }
    var start = text.indexOf("{"), depth = 0, quoted = false, escaped = false;
    if (start < 0) return null;
    for (var i = start; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quoted) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') quoted = false; continue; }
      if (ch === '"') quoted = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch (_) { return null; }
      }
    }
    return null;
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
};
Zlibrary._active = function (context) {
  if (context.signal && context.signal.aborted) throw this._error("cancel", "Z-Library request cancelled.");
  if (context.expired || Date.now() >= context.deadline) throw this._error("timeout", "Z-Library request timed out. Retry or choose another domain in extension settings.");
};
Zlibrary._wait = function (work, milliseconds, error) {
  return new Promise(function (resolve, reject) {
    var done = false, timer = setTimeout(function () { if (!done) { done = true; reject(error); } }, milliseconds);
    function finish(fn, value) {
      if (done) return; done = true;
      if (typeof clearTimeout === "function") clearTimeout(timer);
      fn(value);
    }
    Promise.resolve(work).then(function (value) { finish(resolve, value); }, function (err) { finish(reject, err); });
  });
};
Zlibrary._run = async function (budget, options, work) {
  var context = { deadline: Date.now() + budget, expired: false, signal: options && options.signal };
  try { this._active(context); return await this._wait(work(context), budget, this._error("timeout", "Z-Library request timed out. Retry or choose another domain in extension settings.")); }
  finally { context.expired = true; }
};
Zlibrary._storedJson = async function (key) { try { return this._parseJson(await cinder.store.get(key)); } catch (_) { return null; } };
Zlibrary._cache = async function (key, value) {
  try { await cinder.store.set(key, JSON.stringify(value)); } catch (_) { /* Optional cache must not fail a successful request. */ }
};
Zlibrary._refreshMirrors = function (cached) {
  var now = Date.now(), self = this;
  if (cached && cached.at <= now && now - cached.at < this._MIRROR_TTL) return;
  if (this._mirrorRefresh || (this._mirrorRefreshAt && now - this._mirrorRefreshAt < 60000)) return;
  this._mirrorRefreshAt = now;
  this._mirrorRefresh = Promise.resolve().then(async function () {
    var response = await self._wait(cinder.fetch(self._MIRROR_SOURCE, { headers: { Accept: "application/json" }, timeout: 3000 }), 3500, self._error("mirror", "Mirror list unavailable."));
    if (!response || Number(response.status) !== 200) return;
    var data = self._parseJson(response.data), domains = [];
    if (!data || Number(data.success) !== 1 || !Array.isArray(data.domains)) return;
    data.domains.slice(0, 100).forEach(function (entry) {
      var base = entry && entry.contentAvailable !== false && entry.isRedirector !== true && self._normalizeBase(entry.domain);
      if (base && domains.indexOf(base) < 0) domains.push(base);
    });
    if (domains.length) await self._cache("mirror_cache_v1", { at: Date.now(), domains: domains });
  }).catch(function () { /* Retain the last cached list on errors or offline devices. */ }).then(function () { self._mirrorRefresh = null; });
};
Zlibrary._candidates = async function () {
  var preferred = await this._base();
  var automatic = await cinder.store.get("automatic_mirrors");
  if (!this._autoDomain && (automatic === false || automatic === "false" || automatic === "0")) return { preferred: preferred, domains: [preferred] };
  var remembered = await this._storedJson("working_mirror_v1");
  var cached = await this._storedJson("mirror_cache_v1");
  var domains = [], self = this;
  function add(value) { var base = self._normalizeBase(value); if (base && domains.indexOf(base) < 0) domains.push(base); }
  if (remembered && remembered.preferred === preferred) add(remembered.base);
  add(preferred);
  this._SEEDS.forEach(add);
  if (cached && Array.isArray(cached.domains)) cached.domains.slice(0, 100).forEach(add);
  // Refresh alongside the first API request; never hold search up for this list.
  this._refreshMirrors(cached);
  return { preferred: preferred, domains: domains, remembered: remembered };
};
Zlibrary._remember = async function (candidates, base) {
  this._settingsBase = base;
  this._lastChallengeBase = null;
  if (candidates.remembered && candidates.remembered.preferred === candidates.preferred && candidates.remembered.base === base) return;
  await this._cache("working_mirror_v1", { preferred: candidates.preferred, base: base });
};
Zlibrary._withBrowserCookies = async function (base, headers, includeAnonymous) {
  if (!headers.Cookie && !includeAnonymous || typeof cinder.getBrowserSessionHeaders !== "function") return headers;
  try {
    var stored = await this._wait(cinder.getBrowserSessionHeaders(base), 700, this._error("mirror", "Browser session unavailable."));
    var value = stored && (stored.Cookie || stored.cookie);
    if (typeof value !== "string" || value.length > 16384 || /[\r\n\x00]/.test(value)) return headers;
    var pairs = String(headers.Cookie || "").split(";").map(function (pair) { return pair.trim(); }).filter(Boolean), names = pairs.map(function (pair) { return pair.split("=")[0]; });
    value.split(";").forEach(function (part) {
      var pair = part.trim(), at = pair.indexOf("="), name = pair.slice(0, at);
      // Explicit account keys always win over cookies from browser sign-in.
      if (at > 0 && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) && names.indexOf(name) < 0) { names.push(name); pairs.push(pair); }
    });
    return pairs.length ? Object.assign({}, headers, { Cookie: pairs.join("; ") }) : headers;
  } catch (_) { return headers; }
};
Zlibrary._isChallenge = function (data) {
  return typeof data === "string" && /<title[^>]*>\s*(?:Just a moment|Attention Required)|Checking your browser|Verifying your browser|cf[-_]challenge|challenge-platform|DiamWall|enable javascript and cookies/i.test(data);
};
Zlibrary._errorText = function (data) {
  var detail = data && (data.response && data.response.message || data.error || data.errors && data.errors[0] || data.message);
  return detail && typeof detail === "object" ? String(detail.message || detail.code || "") : String(detail || "");
};
Zlibrary._isRateLimited = function (data) {
  return /too many (?:logins|requests|attempts)|rate[ _-]?limit|login.{0,20}limit/i.test(this._errorText(data));
};
Zlibrary._isAuthError = function (data) {
  return /auth|session|unauthor|log.?in|sign.?in|user.{0,12}(?:invalid|expired|not found)/i.test(this._errorText(data));
};
Zlibrary._loginUser = function (data) {
  var user = data && (data.user || data.response), id = user && (user.id || user.user_id), key = user && (user.remix_userkey || user.user_key);
  if (!/^\d+$/.test(String(id || "")) || typeof key !== "string" || !key || /[\x00-\x20\x7f;,]/.test(key)) return null;
  return { id: String(id), remix_userkey: key };
};
Zlibrary._isQuota = function (data) {
  var message = this._errorText(data);
  return !!(data && (data.allowDownload === false || data.file && data.file.allowDownload === false)) || /daily.{0,25}limit|download.{0,25}limit|quota|limit.{0,25}(?:reached|exceeded)/i.test(message);
};
Zlibrary._response = function (response, operation) {
  if (!response) throw this._error("mirror", "Z-Library returned no response.");
  var status = Number(response.status), data = this._parseJson(response.data);
  if (this._isChallenge(response.data)) throw this._error("challenge", "Z-Library requires website verification. Open Verify Website in extension settings, then retry.");
  if (status === 429 || this._isRateLimited(data)) throw this._error("rate", "Z-Library is temporarily limiting requests or sign-ins. Please wait before retrying.");
  if (this._isQuota(data)) throw this._error("quota", "Your daily Z-Library download limit has been reached. Try again after it resets.");
  if (!status || status === 408 || status >= 500 || !data) throw this._error("mirror", "Z-Library did not return usable API data (" + operation + ").");
  // The API uses HTTP 400 for expired/missing sessions, not just malformed
  // input. Read that JSON reason before falling back to a generic HTTP error.
  if (status === 400 && this._isAuthError(data) && operation !== "sign in") throw this._error("auth", "Z-Library session expired or was rejected. Check your account settings.");
  if (operation === "sign in" && (status === 400 || status === 401 || status === 403)) throw this._error("credentials", "Z-Library rejected the sign-in. Check your credentials or use session keys in extension settings.");
  if (status === 401 || status === 403) throw this._error("auth", "Z-Library session expired or was rejected. Check your account settings.");
  if (status < 200 || status >= 300) throw this._error("api", "Z-Library returned HTTP " + status + " (" + operation + ").");
  return data;
};
Zlibrary._validate = function (data, operation) {
  if (this._isRateLimited(data)) throw this._error("rate", "Z-Library is temporarily limiting requests or sign-ins. Please wait before retrying.");
  if (this._isQuota(data)) {
    throw this._error("quota", "Your daily Z-Library download limit has been reached. Try again after it resets.");
  }
  if (operation === "sign in") {
    if (this._loginUser(data)) return data;
    throw this._error("credentials", "Z-Library rejected the sign-in. Check your credentials or use session keys in extension settings.");
  }
  if (data && (Number(data.success) === 0 || data.error)) {
    if (this._isAuthError(data)) throw this._error("auth", "Z-Library session expired or was rejected.");
    throw this._error("api", "Z-Library rejected the " + operation + " request.");
  }
  var valid = operation === "download link" ? Number(data.success) === 1 && data.file
    : Array.isArray(data.books) || Array.isArray(data.results) || data.exactMatch && Array.isArray(data.exactMatch.books);
  if (!valid) throw this._error("mirror", "Z-Library returned an unexpected API response (" + operation + ").");
  return data;
};
Zlibrary._requestAt = async function (base, path, options, operation, context, freshCookies) {
  this._active(context);
  var headers = await this._withBrowserCookies(base, Object.assign({}, options.headers || {}, { Referer: base + "/" }), freshCookies);
  if (options.method === "POST") headers.Origin = base;
  this._active(context);
  var timeout = Math.min(3000, Math.max(1, context.deadline - Date.now()));
  var response, request = Object.assign({}, options, { headers: headers, timeout: timeout, signal: context.signal });
  try { response = await this._wait(cinder.fetch(base + path, request), timeout, this._error("mirror", "Z-Library mirror timed out.")); }
  catch (err) { if (err && err.kind) throw err; throw this._error("mirror", "Z-Library mirror could not be reached."); }
  this._active(context);
  return this._validate(this._response(response, operation), operation);
};
Zlibrary._warmPostOrigin = async function (base, context) {
  this._active(context);
  var budget = Math.min(5000, context.deadline - Date.now() - 4000);
  if (context.warmed || budget < 1000 || typeof cinder.fetchBrowser !== "function") return false;
  context.warmed = true;
  var warm = this._warmupTask, self = this;
  // Share only an in-flight warm-up for this origin. Never queue behind a
  // different browser operation or create several hidden WebViews at once.
  if (!warm || warm.base !== base) {
    if (this._browserTask) return false;
    var headers = Object.assign(this._headers(null), {
      Accept: "text/html,application/xhtml+xml", Referer: base + "/",
      "X-Cinder-Suppress-Interactive": "1", "X-Cinder-Visible-Layout": "1",
      "X-Cinder-Max-Wait-Ms": String(Math.max(1000, budget - 500)),
    });
    // Only load the public home page. Credentials/search text never enter a
    // browser URL, header or POST here; the original API POST is retried below.
    var task = Promise.resolve().then(function () {
      self._active(context);
      return cinder.fetchBrowser(base + "/", { method: "GET", headers: headers, timeout: budget });
    });
    warm = { base: base, promise: task };
    this._warmupTask = warm;
    this._browserTask = task;
    var clear = function () {
      if (self._browserTask === task) self._browserTask = null;
      if (self._warmupTask === warm) self._warmupTask = null;
    };
    task.then(clear, clear);
  }
  try {
    var reply = await this._wait(warm.promise, budget, this._error("challenge", "Website verification is still required."));
    this._active(context);
    return !!(reply && Number(reply.status) >= 200 && Number(reply.status) < 300 && typeof reply.data === "string" && reply.data.trim() && !this._isChallenge(reply.data));
  } catch (_) { this._active(context); return false; }
};
Zlibrary._api = async function (path, options, operation, context) {
  this._active(context);
  var candidates = await this._candidates(), last, challenged;
  var canWarmPost = options.method === "POST" && typeof cinder.fetchBrowser === "function";
  for (var i = 0; i < candidates.domains.length && i < 12; i++) {
    this._active(context);
    // Leave time for one browser check plus the unchanged POST retry when
    // mirrors are challenged. Healthy mirrors still win without a WebView.
    if (challenged && canWarmPost && context.deadline - Date.now() < 8500) break;
    var base = candidates.domains[i];
    try {
      var data = await this._requestAt(base, path, options, operation, context);
      // Remember only validated API responses, including legitimate empty searches.
      this._active(context);
      await this._remember(candidates, base);
      return { data: data, base: base, domains: candidates.domains };
    } catch (err) {
      this._active(context);
      if (!err || (err.kind !== "mirror" && err.kind !== "challenge")) { if (err) err.base = base; throw err; }
      last = err;
      if (err.kind === "challenge" && !challenged) { challenged = base; this._lastChallengeBase = base; this._lastChallengePreferred = candidates.preferred; this._settingsBase = base; }
    }
  }
  if (challenged && canWarmPost && await this._warmPostOrigin(challenged, context)) {
    try {
      var retried = await this._requestAt(challenged, path, options, operation, context, true);
      this._active(context);
      await this._remember(candidates, challenged);
      return { data: retried, base: challenged, domains: candidates.domains };
    } catch (err) {
      this._active(context);
      if (!err || (err.kind !== "mirror" && err.kind !== "challenge")) { if (err) err.base = challenged; throw err; }
      last = err;
    }
  }
  // API mirrors are faster than a browser. Only a GET is safe to retry through
  // older hosts which may not preserve POST bodies. Never send login in a URL.
  if (challenged && (options.method || "GET") === "GET" && typeof cinder.fetchBrowser === "function" && !this._browserTask && context.deadline - Date.now() > 2000) {
    var remaining = Math.min(8000, context.deadline - Date.now());
    var task = cinder.fetchBrowser(challenged + path, { headers: Object.assign({}, options.headers || {}, {
      "X-Cinder-Suppress-Interactive": "1", "X-Cinder-Visible-Layout": "1", "X-Cinder-Max-Wait-Ms": String(Math.max(1000, remaining - 500)),
    }), timeout: remaining });
    this._browserTask = task;
    var self = this;
    Promise.resolve(task).then(function () { if (self._browserTask === task) self._browserTask = null; }, function () { if (self._browserTask === task) self._browserTask = null; });
    try {
      var browser = await this._wait(task, remaining, this._error("challenge", "Z-Library requires website verification. Open Verify Website in extension settings."));
      this._active(context);
      var body = browser && browser.data;
      if (typeof body === "string" && /^\s*</.test(body) && typeof cinder.parseHTML === "function" && !this._isChallenge(body)) {
        var pre = cinder.parseHTML(body).querySelector("pre"); if (pre) body = pre.text();
      }
      var result = this._validate(this._response({ status: browser && browser.status, data: body }, operation), operation);
      await this._remember(candidates, challenged);
      return { data: result, base: challenged, domains: candidates.domains };
    } catch (err) { this._active(context); if (err && err.kind !== "mirror" && err.kind !== "challenge") throw err; last = err; }
  }
  if (challenged) throw this._error("challenge", "Z-Library requires website verification. Open Verify Website in extension settings, then retry.");
  throw last || this._error("mirror", "Z-Library mirrors are unavailable. Retry or change the domain in extension settings.");
};
Zlibrary._manualSession = async function () {
  var id = await this._lire("remix_userid", false), key = await this._lire("remix_userkey", true);
  if (!id && !key) return null;
  if (!id || !key || !/^\d+$/.test(id) || /[\x00-\x20\x7f;,]/.test(key)) throw this._error("config", "Enter both a valid Remix User ID and Remix User Key, or clear both to use email and password.");
  return { id: id, cle: key, manual: true };
};
Zlibrary._sessionSiConnu = async function () {
  var manual = await this._manualSession(); if (manual) return manual;
  var account = await this._lire("session_email_v1", true);
  if (account && account !== await this._lire("email", false)) return null;
  var id = await this._lire("user_id", true), key = await this._lire("user_key", true);
  return id && key ? { id: id, cle: key } : null;
};
Zlibrary._headers = function (session) {
  var headers = { Accept: "application/json, text/javascript, */*; q=0.01", "Accept-Language": "en-US,en;q=0.9", "User-Agent": this.UA };
  if (session) headers.Cookie = "remix_userid=" + encodeURIComponent(session.id) + "; remix_userkey=" + encodeURIComponent(session.cle);
  return headers;
};
Zlibrary._enTetes = function (session, base) { return Object.assign(this._headers(session), { Referer: base + "/" }); };
Zlibrary._session = async function (force, context) {
  var manual = await this._manualSession();
  if (manual) { if (force) throw this._error("auth", "These Z-Library session keys were rejected. Update or clear them in extension settings."); return manual; }
  if (!force) { var saved = await this._sessionSiConnu(); if (saved) return saved; }
  var email = await this._lire("email", false), password = String(await cinder.secureStore.get("motdepasse") || "");
  if (!email || !password) throw this._error("config", "Enter your Z-Library email and password, or session keys, in extension settings.");
  // Share simultaneous login work; never persist the password in the normal store.
  var signature = email + "\n" + password, self = this;
  if (this._loginTask && this._loginTask.signature === signature) {
    var shared = await this._loginTask.promise; this._active(context); return shared;
  }
  var work = (async function () {
    var headers = self._headers(null); headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    headers["X-Requested-With"] = "XMLHttpRequest";
    var reply;
    try {
      reply = await self._api("/eapi/user/login", { method: "POST", headers: headers, body: self._form({ email: email, password: password }) }, "sign in", context);
    } catch (err) {
      // The website login has a different form/response contract. Try it once
      // on the same mirror after an API refusal, never after a login rate limit.
      var base = err && self._normalizeBase(err.base);
      if (!base || ["credentials", "auth", "api"].indexOf(err.kind) < 0) throw err;
      self._active(context);
      if (email !== await self._lire("email", false) || password !== String(await cinder.secureStore.get("motdepasse") || "") || await self._manualSession()) throw self._error("cancel", "Account settings changed. Please retry.");
      var options = { method: "POST", headers: headers, body: self._form({ isModal: "true", email: email, password: password, site_mode: "books", action: "login", gg_json_mode: "1", redirectUrl: base + "/" }) };
      var data;
      try { data = await self._requestAt(base, "/rpc.php", options, "sign in", context, true); }
      catch (rpcError) {
        if (!rpcError || rpcError.kind !== "challenge" || !await self._warmPostOrigin(base, context)) throw rpcError;
        data = await self._requestAt(base, "/rpc.php", options, "sign in", context, true);
      }
      reply = { data: data, base: base };
    }
    var user = self._loginUser(reply.data);
    if (!user) throw self._error("auth", "Z-Library did not return a usable sign-in session.");
    self._active(context);
    if (email !== await self._lire("email", false) || password !== String(await cinder.secureStore.get("motdepasse") || "") || await self._manualSession()) throw self._error("cancel", "Account settings changed. Please retry.");
    await cinder.secureStore.set("user_id", String(user.id));
    await cinder.secureStore.set("user_key", String(user.remix_userkey));
    await cinder.secureStore.set("session_email_v1", email);
    return { id: String(user.id), cle: String(user.remix_userkey) };
  })();
  this._loginTask = { signature: signature, promise: work };
  try { return await work; } finally { if (this._loginTask && this._loginTask.promise === work) this._loginTask = null; }
};
Zlibrary._avecSession = async function (work, context) {
  var session = await this._session(false, context);
  try { return await work(session); }
  catch (err) { if (!err || err.kind !== "auth") throw err; this._active(context); return work(await this._session(true, context)); }
};

Zlibrary._candidatesForSettings = async function () {
  var preferred;
  try { preferred = await this._base(); } catch (_) { return "https://z-library.ec"; }
  var automatic = await cinder.store.get("automatic_mirrors");
  if (!this._autoDomain && (automatic === false || automatic === "false" || automatic === "0")) return preferred;
  if (this._lastChallengeBase && this._lastChallengePreferred === preferred) return this._lastChallengeBase;
  var remembered = await this._storedJson("working_mirror_v1");
  return remembered && remembered.preferred === preferred && this._normalizeBase(remembered.base) || preferred;
};
Zlibrary.getSettingsAsync = async function () {
  this._settingsBase = await this._candidatesForSettings();
  var cached = await this._storedJson("mirror_cache_v1");
  this._settingsDomains = cached && Array.isArray(cached.domains) ? cached.domains.slice(0, 100) : [];
  return this.getSettings();
};

Zlibrary.LIMITE = 30;

/**
 * Convertit des livres de l'API en resultats Cinder.
 *
 * Partage par search() et par la decouverte : les quatre endpoints rendent la MEME forme
 * de livre, et deux conversions divergentes produiraient deux identites pour un meme
 * livre — ce que Cinder memorise pour la bibliotheque et la reprise.
 *
 * Un livre sans `hash` est ecarte : resolve() ne saurait pas le demander, et le laisser
 * passer donnerait une fiche qui echoue seulement au moment du telechargement.
 */
Zlibrary.LANGUAGE_ALIASES = {
  fr: "french",
  francais: "french",
  "français": "french",
  en: "english",
  anglais: "english",
  es: "spanish",
  espagnol: "spanish",
  de: "german",
  allemand: "german",
  it: "italian",
  italien: "italian",
  pt: "portuguese",
  portugais: "portuguese",
  ru: "russian",
  russe: "russian",
  ja: "japanese",
  japonais: "japanese",
  zh: "chinese",
  chinois: "chinese",
};

Zlibrary._languages = async function () {
  var raw = await this._lire("langues", false);
  if (!raw) return [];
  var self = this;
  return raw.split(/[,;]/).map(function (value) {
    var normalized = value.trim().toLowerCase();
    return self.LANGUAGE_ALIASES[normalized] || normalized;
  }).filter(Boolean);
};

// Older Cinder builds group extension results by title. Keep editions visible there
// while newer builds use the stable result id and show these fields separately.
Zlibrary._distinctTitle = function (book) {
  var title = String(book.title || "Untitled").trim();
  var details = [];
  if (book.language) details.push(String(book.language).trim());
  if (book.extension) details.push(String(book.extension).toLowerCase().trim());
  if (book.filesizeString) details.push(String(book.filesizeString).trim());
  return details.length ? title + " — " + details.join(" · ") : title;
};

Zlibrary._versResultats = function (livres) {
  return (livres || []).filter(function (b) { return b && b.id && b.hash; }).map(function (b) {
    return {
      // Identite STABLE : Cinder la memorise pour la bibliotheque et la reprise.
      id: "zlibrary:" + b.id,
      title: Zlibrary._distinctTitle(b),
      author: String(b.author || "").trim() || undefined,
      cover: b.cover || undefined,
      description: b.description || undefined,
      format: String(b.extension || "").toLowerCase() || undefined,
      size: b.filesizeString || undefined,
      source: Zlibrary.name,
      extra: {
        livreId: String(b.id),
        hash: String(b.hash || ""),
        language: b.language ? String(b.language).trim() : undefined,
        description: b.description || undefined,
      },
    };
  });
};

Zlibrary.SECTIONS = [
  { id: "populaires", title: "Popular", icon: "flame", compte: false, chemin: "/eapi/book/most-popular", pagine: false },
  { id: "recommandes", title: "Recommended for You", icon: "sparkles", compte: true, chemin: "/eapi/user/book/recommended", pagine: false },
  { id: "enregistres", title: "My Z-Library", icon: "bookmark", compte: true, chemin: "/eapi/user/book/saved", pagine: true },
  { id: "telecharges", title: "Already Downloaded", icon: "download", compte: true, chemin: "/eapi/user/book/downloaded", pagine: true },
];

Zlibrary._books = function (data) {
  var arrays = [data.books, data.exactMatch && data.exactMatch.books, data.results];
  for (var i = 0; i < arrays.length; i++) if (Array.isArray(arrays[i]) && arrays[i].length) return arrays[i];
  return [];
};
Zlibrary._livres = async function (path, label, session, context) {
  var reply = await this._api(path, { method: "GET", headers: this._headers(session) }, label, context);
  return this._versResultats(this._books(reply.data));
};
Zlibrary.search = function (query, page, selections, options) {
  var self = this, q = String(query || "").trim();
  if (!q) return Promise.resolve([]);
  return this._run(13500, options, async function (context) {
    var session = await self._sessionSiConnu(), fields = { message: q, page: page && page > 1 ? page : 1, limit: self.LIMITE };
    var languages = await self._languages();
    for (var i = 0; i < languages.length; i++) fields["languages[" + i + "]"] = languages[i];
    var format = (await self._lire("preferred_format", false)).toLowerCase();
    if (["epub", "pdf", "mobi", "azw3"].indexOf(format) >= 0) fields["extensions[]"] = format;
    var body = self._form(fields);
    async function search(activeSession) {
      var headers = self._headers(activeSession); headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
      return self._api("/eapi/book/search", { method: "POST", headers: headers, body: body }, "search", context);
    }
    var reply;
    try { reply = await search(session); }
    catch (err) {
      // Public search works without an account. An expired saved session must
      // not turn it into a login or make the user lose anonymous search.
      if (!session || !err || err.kind !== "auth") throw err;
      reply = await search(null);
    }
    return self._versResultats(self._books(reply.data));
  });
};

Zlibrary.getDiscoverSections = async function () {
  var connected = false;
  try { connected = Boolean(await this._sessionSiConnu()); } catch (_) { /* Partial settings must not break discovery inspection. */ }
  return this.SECTIONS.filter(function (section) { return connected || !section.compte; })
    .map(function (section) { return { id: section.id, title: section.title, icon: section.icon }; });
};
Zlibrary.getDiscoverItems = function (sectionId, page) {
  var section = this.SECTIONS.filter(function (item) { return item.id === sectionId; })[0];
  var p = page && page > 1 ? page : 1, self = this;
  if (!section || !section.pagine && p > 1) return Promise.resolve([]);
  return this._run(13500, null, async function (context) {
    if (!section.compte) {
      var session = await self._sessionSiConnu();
      try { return await self._livres(section.chemin, section.title, session, context); }
      catch (err) { if (!session || !err || err.kind !== "auth") throw err; return self._livres(section.chemin, section.title, null, context); }
    }
    return self._avecSession(function (session) {
      return self._livres(section.chemin + "?page=" + p + "&limit=" + self.LIMITE, section.title, session, context);
    }, context);
  });
};

Zlibrary.resolve = function (item) {
  var e = item && item.extra || {}, self = this;
  if (!e.livreId || !e.hash) return Promise.reject(new Error("This result does not include a book identifier."));
  return this._run(60000, null, function (context) {
    return self._avecSession(async function (session) {
      var reply = await self._api("/eapi/book/" + encodeURIComponent(e.livreId) + "/" + encodeURIComponent(e.hash) + "/file",
        { method: "GET", headers: self._headers(session) }, "download link", context);
      var file = reply.data.file, link = file.downloadLink || file.downloadUrl;
      if (!link) throw self._error("api", "Z-Library did not return a download link for this book.");
      link = String(link);
      if (link.indexOf("//") === 0) link = "https:" + link;
      else if (link.charAt(0) === "/") link = reply.base + link;
      var url = link.match(/^https:\/\/([^/?#]+)(?:[/?#]|$)/i);
      var origin = url && self._normalizeBase(url[1]);
      if (!origin || /[\x00-\x20\x7f]/.test(link)) throw self._error("api", "Z-Library returned an invalid download link.");
      var ext = String(file.extension || item.format || "epub").toLowerCase();
      if (!/^[a-z0-9]{2,8}$/.test(ext)) throw self._error("api", "Z-Library returned an invalid file format.");
      var name = String(item.title || "book").replace(/[\x00-\x1f\\/:*?"<>|]+/g, " ").trim() || "book";
      // Signed third-party links do not need account cookies. Preserve them for
      // this mirror and its file subdomains, where direct downloads require auth.
      var baseHost = reply.base.slice(8), fileHost = origin.slice(8);
      var sameSite = fileHost === baseHost || fileHost.slice(-(baseHost.length + 1)) === "." + baseHost || reply.domains.indexOf(origin) >= 0;
      var headers = self._enTetes(sameSite ? session : null, reply.base);
      if (sameSite) headers = await self._withBrowserCookies(origin, headers);
      self._active(context);
      return { url: link, fileName: name + "." + ext, headers: headers };
    }, context);
  });
};

__cinderExport = Zlibrary;
