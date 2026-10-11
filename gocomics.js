// Comics Extension for Cinder (powered by ComicsRSS)
// ComicsRSS catalog + live public GoComics pages; existing comic/chapter IDs are retained.

__cinderExport = {
  id: "gocomics",
  name: "GoComics",
  version: "3.3.5",
  icon: "🗞️",
  description: "Read 600+ daily comic strips via ComicsRSS – GoComics, Comics Kingdom, Wumo, Life on Earth, and more.",
  contentType: "comics",
  contentTypes: ["comic"],
  contentSubtypes: ["comicStrip"],

  capabilities: {
    search: true,
    discover: true,
    download: false,
    resolve: false,
    manga: true,
  },

  BASE_URL: "https://www.gocomics.com",
  RSS_BASE: "https://www.comicsrss.com/rss",
  COMICS_RSS_INDEX: "https://www.comicsrss.com/",

  _comicsCache: null,
  _comicsLoading: null,
  _comicsExpires: 0,
  _feedCache: {},
  _feedLoading: {},
  _stripCache: {},
  _stripLoading: {},

  COMICS_FALLBACK: [
    { id: "calvinandhobbes",   title: "Calvin and Hobbes" },
    { id: "peanuts",           title: "Peanuts" },
    { id: "garfield",          title: "Garfield" },
    { id: "pickles",           title: "Pickles" },
    { id: "pearlsbeforeswine", title: "Pearls Before Swine" },
    { id: "babyblues",         title: "Baby Blues" },
    { id: "zits",              title: "Zits" },
    { id: "realitycheck",      title: "Reality Check" },
    { id: "wumo",              title: "Wumo" },
    { id: "life-on-earth",     title: "Life on Earth" },
    { id: "foxtrot",           title: "FoxTrot" },
    { id: "doonesbury",        title: "Doonesbury" },
    { id: "bloomcounty",       title: "Bloom County" },
    { id: "getfuzzy",          title: "Get Fuzzy" },
    { id: "mutts",             title: "Mutts" },
    { id: "nonsequitur",       title: "Non Sequitur" },
    { id: "xkcd",              title: "xkcd" },
  ],

  // -------------------------
  // Helpers
  // -------------------------

  _getSetting: function(key, fallback) {
    if (!cinder.secureStore || !cinder.secureStore.get) return Promise.resolve(fallback);
    return cinder.secureStore.get(key).then(function(value) {
      return value || fallback;
    }).catch(function() {
      return fallback;
    });
  },

  _headers: function() {
    return Promise.all([
      this._getSetting("session_token_0", ""),
      this._getSetting("session_token_1", ""),
    ]).then(function(tokens) {
    var token0 = tokens[0];
    var token1 = tokens[1];
    var cookieParts = [];
    if (token0) cookieParts.push("__Secure-next-auth.session-token.0=" + token0);
    if (token1) cookieParts.push("__Secure-next-auth.session-token.1=" + token1);
    var h = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.google.com/",
      "Upgrade-Insecure-Requests": "1",
    };
    if (cookieParts.length > 0) h["Cookie"] = cookieParts.join("; ");
    return h;
    });
  },

  _comicToResult: function(c) {
    var description = "Daily comic strip.";
    return {
      id: c.id,
      title: c.title,
      author: c.author || undefined,
      cover: "https://avatar.gocomics.com/" + c.id + "/avatar_256.jpg",
      url: this.RSS_BASE + "/" + c.id + ".rss",
      format: "manga",
      description: description,
      extra: { description: description },
    };
  },

  _isBlocked: function(h) {
    // GoComics includes /.bunny-shield/bd/bunnyprint.js on successful comic
    // pages too. That script name is not evidence of an active challenge.
    return !h || h.indexOf("shield-challenge") !== -1 ||
      h.indexOf("Establishing a secure connection") !== -1 || h.indexOf("data-pow=") !== -1;
  },

  _decode: function(value) {
    function codePoint(number) {
      return isFinite(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "\ufffd";
    }
    return String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"').replace(/&apos;|&#0*39;/gi, "'")
      .replace(/&#x([0-9a-f]+);/gi, function(_, n) { return codePoint(parseInt(n, 16)); })
      .replace(/&#([0-9]+);/g, function(_, n) { return codePoint(Number(n)); })
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&");
  },

  _text: function(value) {
    return this._decode(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  },

  _searchKey: function(value) {
    var text = this._text(value).toLowerCase().replace(/&/g, "and");
    if (text.normalize) text = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    return text.replace(/[^a-z0-9]/g, "");
  },

  _validSlug: function(slug) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(String(slug || ""))) throw new Error("Invalid comic ID.");
    return String(slug).toLowerCase();
  },

  _datePath: function(value) {
    var text = String(value || "");
    var match = text.match(/\b(\d{4})[/-](\d{2})[/-](\d{2})\b/);
    // JSON-LD uses a calendar date such as "October 10, 2026", not an
    // instant in the device's time zone. Parse it explicitly: free-form Date
    // parsing differs between JS engines and shifts to yesterday east of UTC.
    var named = !match && text.trim().match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (named) {
      var month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
        .findIndex(function(name) { return name === named[1].toLowerCase() || name.slice(0, 3) === named[1].toLowerCase(); });
      if (month === -1) return "";
      match = [named[0], named[3], String(month + 1).padStart(2, "0"), named[2].padStart(2, "0")];
    }
    var date = match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])) : new Date(value);
    if (!isFinite(date.getTime())) return "";
    var result = date.toISOString().slice(0, 10).replace(/-/g, "/");
    return match && result !== match[1] + "/" + match[2] + "/" + match[3] ? "" : result;
  },

  _remember: function(cache, key, value) {
    cache[key] = { value: value, expires: Date.now() + 5 * 60 * 1000 };
    var keys = Object.keys(cache);
    if (keys.length > 24) {
      keys.sort(function(a, b) { return cache[a].expires - cache[b].expires; });
      delete cache[keys[0]];
    }
    return value;
  },

  // Convert slug to readable title
  // "life-on-earth" -> "Life on Earth"
  // Keeps small words lowercase unless first word
  _slugToTitle: function(slug) {
    var small = { "a":1,"an":1,"and":1,"at":1,"but":1,"by":1,"for":1,"in":1,"nor":1,"of":1,"on":1,"or":1,"so":1,"the":1,"to":1,"up":1,"yet":1 };
    return slug.split("-").map(function(w, i) {
      if (i > 0 && small[w.toLowerCase()]) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(" ");
  },

  // -------------------------
  // Parse ComicsRSS index
  // Simply extract every unique slug from any .rss URL on the page.
  // No title parsing — title is derived from slug instead.
  // This means nothing gets dropped due to regex failures.
  // -------------------------

  _parseComicsRssIndex: function(text) {
    var seen = {};
    var comics = [];
    // The catalog provides proper titles/authors. Slug-only titles made spaced
    // searches such as "Calvin and Hobbes" fail on a freshly loaded catalog.
    var cardRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    var card;
    while ((card = cardRe.exec(text)) !== null) {
      var rss = card[1].match(/\/rss\/([a-z0-9][a-z0-9._-]*)\.rss/i);
      var label = card[1].match(/<div\b[^>]*class=["'][^"']*\bellipsis\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      if (!rss || !label || seen[rss[1].toLowerCase()]) continue;
      var author = (label[1].match(/<small\b[^>]*>([\s\S]*?)<\/small>/i) || [])[1];
      var id = rss[1].toLowerCase();
      var title = this._text(label[1].replace(/<small\b[^>]*>[\s\S]*?<\/small>/gi, ""));
      if (!title) continue;
      seen[id] = true;
      comics.push({ id: id, title: title, author: this._text(author).replace(/^by\s+/i, "") });
    }

    // Match any occurrence of /rss/SLUG.rss in the page
    var re = /\/rss\/([a-z0-9][a-z0-9._-]*[a-z0-9])\.rss/gi;
    var m;
    while ((m = re.exec(text)) !== null) {
      var id = m[1].toLowerCase().trim();
      // Skip empty or placeholder slugs
      if (!id || id === "." || id.length < 2) continue;
      if (!seen[id]) {
        seen[id] = true;
        var known = this.COMICS_FALLBACK.find(function(c) { return c.id === id; });
        comics.push({ id: id, title: known ? known.title : this._slugToTitle(id) });
      }
    }

    return comics.sort(function(a, b) {
      return a.title.localeCompare(b.title);
    });
  },

  // -------------------------
  // Dynamic comic list loader
  // -------------------------

  _loadComics: function() {
    var self = this;
    if (self._comicsCache && self._comicsExpires > Date.now()) return Promise.resolve(self._comicsCache);
    if (self._comicsLoading) return self._comicsLoading;

    self._comicsLoading = cinder.fetch(self.COMICS_RSS_INDEX, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html,*/*" },
      timeout: 10000,
    }).then(function(r) {
      if (r.status === 200 && r.data) {
        var comics = self._parseComicsRssIndex(r.data);
        if (comics.length) {
          // xkcd uses its own supported API and is no longer in ComicsRSS.
          // A successful catalog refresh must not hide it from search.
          if (!comics.some(function(comic) { return comic.id === "xkcd"; })) {
            comics.push({ id: "xkcd", title: "xkcd", author: "Randall Munroe" });
            comics.sort(function(a, b) { return a.title.localeCompare(b.title); });
          }
          return comics;
        }
      }
      return self.COMICS_FALLBACK;
    }).catch(function() {
      return self.COMICS_FALLBACK;
    }).then(function(result) {
      self._comicsCache = result;
      // A temporary Android/network failure must not lock this runtime to the
      // tiny fallback list until the app is restarted.
      self._comicsExpires = Date.now() + (result === self.COMICS_FALLBACK ? 30000 : 3600000);
      self._comicsLoading = null;
      return result;
    });

    return self._comicsLoading;
  },

  // -------------------------
  // Image extractors
  // -------------------------

  _imageUrl: function(value) {
    var url = this._decode(value).trim();
    return /^https?:\/\/[^\s<>"']+$/i.test(url) ? url.replace(/^http:\/\//i, "https://") : "";
  },

  _parseFeed: function(xml) {
    var self = this;
    function tag(block, name) {
      var match = block.match(new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
      return match ? self._decode(match[1]).trim() : "";
    }
    var channel = String(xml || "").split(/<item\b/i)[0];
    var entries = [], seen = {}, itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi, match;
    while ((match = itemRe.exec(xml)) !== null) {
      var item = match[1], link = tag(item, "link");
      var content = tag(item, "description");
      var image = (content.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (!image) image = (item.match(/<enclosure\b[^>]*\burl=["']([^"']+)["']/i) || [])[1];
      image = self._imageUrl(image);
      // Arcamax/Comics Kingdom use opaque story URLs, not /YYYY/MM/DD.
      var datePath = self._datePath((link.match(/\d{4}[/-]\d{2}[/-]\d{2}/) || [])[0] || tag(item, "pubDate"));
      if (!image || !datePath || seen[datePath]) continue;
      seen[datePath] = true;
      entries.push({ datePath: datePath, url: image, link: link, title: self._text(tag(item, "title")) });
    }
    entries.sort(function(a, b) { return b.datePath.localeCompare(a.datePath); });
    return { sourceUrl: tag(channel, "link"), entries: entries };
  },

  _extractImageFromRss: function(xml, datePath) {
    var entries = this._parseFeed(xml).entries;
    var entry = entries.find(function(item) { return !datePath || item.datePath === datePath; });
    return entry ? entry.url : null;
  },

  _loadFeed: function(slug) {
    var self = this, cached = self._feedCache[slug];
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
    if (self._feedLoading[slug]) return self._feedLoading[slug];
    var task = cinder.fetch(self.RSS_BASE + "/" + slug + ".rss", {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/rss+xml,application/xml,*/*" }, timeout: 8000,
    }).then(function(r) {
      if (!r || r.status !== 200 || !/<rss\b/i.test(r.data || "")) {
        throw new Error("ComicsRSS feed could not be loaded" + (r ? " (HTTP " + r.status + ")" : "") + ".");
      }
      return self._remember(self._feedCache, slug, self._parseFeed(r.data));
    });
    self._feedLoading[slug] = task.then(function(feed) { delete self._feedLoading[slug]; return feed; }, function(error) {
      delete self._feedLoading[slug]; throw error;
    });
    return self._feedLoading[slug];
  },

  _extractOfficialStrip: function(html, datePath) {
    // Current GoComics includes the main strip before recommendation strips in
    // JSON-LD. Never accept a random asset, social card, or a different date.
    var blocks = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi, match;
    while ((match = blocks.exec(html)) !== null) {
      var data;
      try { data = JSON.parse(match[1]); } catch (_) { continue; }
      if (!data || typeof data !== "object") continue;
      var nodes = Array.isArray(data) ? data : (Array.isArray(data["@graph"]) ? data["@graph"] : [data]);
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (!node || node["@type"] !== "ImageObject") continue;
        var url = this._imageUrl(node.contentUrl || node.url);
        if (!/^https:\/\/(?:featureassets\.gocomics\.com\/assets|assets\.amuniversal\.com)\/[a-f0-9]{20,}(?:\?|$)/i.test(url)) continue;
        var published = this._datePath(node.datePublished);
        if (!published || (datePath && published !== datePath)) return null;
        return { url: url, datePath: published };
      }
    }
    return null;
  },

  _extractImageUrl: function(html, datePath) {
    var strip = this._extractOfficialStrip(html, datePath);
    return strip ? strip.url : null;
  },

  _loadOfficialStrip: function(slug, datePath) {
    var self = this, key = slug + "|" + (datePath || "latest"), cached = self._stripCache[key];
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
    if (self._stripLoading[key]) return self._stripLoading[key];
    var url = self.BASE_URL + "/" + slug + (datePath ? "/" + datePath : "");
    var task = self._headers().then(async function(headers) {
      var response = null, strip = null;
      try { response = await cinder.fetch(url, { headers: headers, timeout: 8000 }); } catch (_) {}
      // A date-verified public strip is stronger evidence than incidental
      // security-script strings in the surrounding HTML.
      if (response && response.status === 200) strip = self._extractOfficialStrip(response.data, datePath);
      if (!strip && typeof cinder.fetchBrowser === "function") {
        // Use the device browser identity; don't impose an Android UA on iOS.
        var browserHeaders = {
          "Referer": self.BASE_URL + "/", "X-Cinder-Suppress-Interactive": "1",
          "X-Cinder-Wait-For-Selector": 'button[aria-label="Expand comic"] img',
          "X-Cinder-Max-Wait-Ms": "14000",
        };
        if (headers.Cookie) browserHeaders.Cookie = headers.Cookie;
        try { response = await cinder.fetchBrowser(url, { headers: browserHeaders, browserUserAgent: "desktop", timeout: 18000 }); } catch (_) { response = null; }
        if (response && response.status === 200) strip = self._extractOfficialStrip(response.data, datePath);
      }
      if (!strip) {
        if (!response || response.status === 403 || response.status === 429 || self._isBlocked(response.data)) {
          throw new Error("GoComics could not load the comic page (site verification or unavailable page). Please try again later or check access on the source website.");
        }
        throw new Error("GoComics did not provide a public strip for this date. It may be unavailable or require an account; a different strip will not be substituted.");
      }
      self._remember(self._stripCache, slug + "|" + strip.datePath, strip);
      return self._remember(self._stripCache, key, strip);
    });
    self._stripLoading[key] = task.then(function(strip) { delete self._stripLoading[key]; return strip; }, function(error) {
      delete self._stripLoading[key]; throw error;
    });
    return self._stripLoading[key];
  },

  // -------------------------
  // Search
  // -------------------------

  search: function(query, page) {
    var self = this;
    var q = self._searchKey(query);
    var start = Math.max(0, Math.floor(Number(page) || 0)) * 30;
    return self._loadComics().then(function(comics) {
      return comics
        .filter(function(c) {
          return self._searchKey(c.title + " " + (c.author || "")).indexOf(q) !== -1 || self._searchKey(c.id).indexOf(q) !== -1;
        })
        .slice(start, start + 30)
        .map(function(c) { return self._comicToResult(c); });
    });
  },

  // -------------------------
  // Discover
  // -------------------------

  getDiscoverSections: function() {
    return Promise.resolve([
      { id: "popular",  title: "Popular Comics", icon: "🔥" },
      { id: "classics", title: "Classic Comics",  icon: "📰" },
    ]);
  },

  getDiscoverItems: function(sectionId, page) {
    var self = this;
    if (Number(page) > 0 || (sectionId !== "popular" && sectionId !== "classics")) return Promise.resolve([]);
    var popularIds = [
      "peanuts", "garfield", "calvinandhobbes", "pickles", "pearlsbeforeswine",
      "babyblues", "zits", "foxtrot", "doonesbury", "bloomcounty",
      "getfuzzy", "mutts", "nonsequitur", "realitycheck", "wumo",
      "crankshaft", "luann", "maryworth", "sallyforth", "xkcd",
    ];
    var classicIds = [
      "calvinandhobbes", "peanuts", "garfield", "bloomcounty", "bc",
      "foxtrotclassics", "luann-againn", "nancy-classics", "zits-classics",
      "getfuzzy", "culdesac", "forbetterorforworse", "theboondocks",
      "doonesbury", "funky-winkerbean", "lil-abner", "little-nemo",
      "libertymeadows", "peanuts-begins", "stonesoupclassics",
    ];
    return self._loadComics().then(function(comics) {
      var ids = sectionId === "popular" ? popularIds : classicIds;
      var list = ids.map(function(id) {
        return comics.find(function(c) { return c.id === id; });
      }).filter(Boolean);
      if (list.length < 5) list = comics.slice(0, 20);
      return list.map(function(c) { return self._comicToResult(c); });
    });
  },

  // -------------------------
  // Comic Details
  // -------------------------

  getMangaDetails: function(slug) {
    var self = this;
    slug = self._validSlug(slug);
    return self._loadComics().then(function(comics) {
      var local = comics.find(function(c) { return c.id === slug; });
      return {
        id: slug,
        title: local ? local.title : self._slugToTitle(slug),
        author: local ? local.author : undefined,
        cover: slug === "xkcd"
          ? "https://xkcd.com/s/0b7742.png"
          : "https://avatar.gocomics.com/" + slug + "/avatar_256.jpg",
        description: "Daily comic strip.",
        status: "ongoing",
        genres: ["Comic Strip"],
      };
    });
  },

  // -------------------------
  // Chapters
  // -------------------------

  getChapters: function(slug) {
    var self = this;
    slug = self._validSlug(slug);
    if (slug === "xkcd") {
      return cinder.fetch("https://xkcd.com/info.0.json", {
        headers: { "Accept": "application/json" }, timeout: 10000,
      }).then(function(r) {
        var latest = 0;
        try { if (r.status === 200) latest = JSON.parse(r.data).num; } catch(e) {}
        if (!Number.isInteger(latest) || latest < 1) throw new Error("xkcd could not load its current comic list. Please try again.");
        var chapters = [];
        for (var i = latest; i >= Math.max(1, latest - 99); i--) {
          chapters.push({ id: "xkcd|" + i, title: "Comic #" + i, chapterNumber: i, dateUploaded: "" });
        }
        return chapters;
      });
    }

    return self._loadFeed(slug).then(function(feed) {
      if (/^https?:\/\/(?:www\.)?gocomics\.com\//i.test(feed.sourceUrl)) {
        // These RSS feeds stopped in June 2025. Restore the legacy date
        // calendar without fetching a strip first: site verification must
        // not prevent opening the chapter list. getPages still verifies the
        // selected date and never substitutes a different day's image.
        return self._calendarChapters(slug);
      }
      if (!feed.entries.length) throw new Error("This comic's RSS feed has no available strips.");
      return feed.entries.map(function(entry, i) {
        return { id: slug + "|" + entry.datePath, title: entry.title || entry.datePath,
          chapterNumber: feed.entries.length - i, dateUploaded: entry.datePath.replace(/\//g, "-") };
      });
    });
  },

  _calendarChapters: function(slug, latestDate) {
    var chapters = [];
    var now = new Date();
    // Start at the device's local calendar day as in the original listing,
    // then step in UTC so daylight-saving changes cannot skip/repeat dates.
    var today = latestDate ? new Date(latestDate.replace(/\//g, "-") + "T12:00:00Z")
      : new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
    for (var i = 0; i < 730; i++) {
      var d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      var year  = d.getUTCFullYear();
      var month = String(d.getUTCMonth() + 1).padStart(2, "0");
      var day   = String(d.getUTCDate()).padStart(2, "0");
      var dateStr = year + "/" + month + "/" + day;
      var display = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()] + " " + d.getUTCDate() + ", " + year;
      chapters.push({
        id: slug + "|" + dateStr,
        title: display,
        chapterNumber: 730 - i,
        dateUploaded: d.toISOString().split("T")[0],
      });
    }
    return chapters;
  },

  // -------------------------
  // Pages
  // -------------------------

  getPages: async function(chapterId) {
    var self = this;
    var parts = String(chapterId || "").split("|");
    if (parts.length !== 2) throw new Error("Invalid comic chapter ID.");
    var slug  = self._validSlug(parts[0]);
    var param = parts[1];

    if (slug === "xkcd") {
      if (!/^[1-9]\d*$/.test(param)) throw new Error("Invalid xkcd comic number.");
      return cinder.fetch("https://xkcd.com/" + param + "/info.0.json", {
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" }, timeout: 10000,
      }).then(function(r) {
        try {
          if (r.status === 200) {
            var d = JSON.parse(r.data);
            if (self._imageUrl(d.img)) return [{ url: self._imageUrl(d.img) }];
          }
        } catch(e) {}
        throw new Error("xkcd did not provide a page for this comic.");
      });
    }

    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(param) || self._datePath(param) !== param) throw new Error("Invalid comic date.");
    var cached = self._stripCache[slug + "|" + param];
    if (cached && cached.expires > Date.now()) return [{ url: cached.value.url }];
    var feed = null;
    try { feed = await self._loadFeed(slug); } catch (error) {
      // Never guess a different publisher when RSS is offline. A previously
      // verified feed may still identify this source safely for the fallback.
      var previous = self._feedCache[slug];
      if (!previous) throw error;
      feed = previous.value;
    }
    if (feed) {
      var entry = feed.entries.find(function(item) { return item.datePath === param; });
      if (entry) return [{ url: entry.url }];
      if (!/^https?:\/\/(?:www\.)?gocomics\.com\//i.test(feed.sourceUrl)) {
        throw new Error("This date is no longer available in the comic's RSS feed. Please choose one of its listed dates.");
      }
    }
    var strip = await self._loadOfficialStrip(slug, param);
    return [{ url: strip.url }];
  },

  // -------------------------
  // Settings
  // -------------------------

  getSettings: function() {
    return [
      {
        id: "session_token_0",
        label: "GoComics Session Token (part 0)",
        type: "password",
        defaultValue: "",
        description: "Optional: paste '__Secure-next-auth.session-token.0' from GoComics cookies.",
      },
      {
        id: "session_token_1",
        label: "GoComics Session Token (part 1)",
        type: "password",
        defaultValue: "",
        description: "Optional: paste '__Secure-next-auth.session-token.1' from GoComics cookies.",
      },
    ];
  },
};

// Older Cinder builds request getBookDetails() on detail screens.
__cinderExport.getBookDetails = __cinderExport.getMangaDetails;

