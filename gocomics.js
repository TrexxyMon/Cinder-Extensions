// Comics Extension for Cinder (powered by ComicsRSS)
// Version 3.3.0 – extracts all slugs from comicsrss.com, titles derived from slug

__cinderExport = {
  id: "gocomics",
  name: "GoComics",
  version: "3.3.0",
  icon: "🗞️",
  description: "Read 600+ daily comic strips via ComicsRSS – GoComics, Comics Kingdom, Wumo, Life on Earth, and more.",
  contentType: "manga",

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
    return {
      id: c.id,
      title: c.title,
      cover: "https://avatar.gocomics.com/" + c.id + "/avatar_256.jpg",
      url: this.RSS_BASE + "/" + c.id + ".rss",
      format: "manga",
    };
  },

  _isBlocked: function(h) {
    return !h || h.indexOf("bunny-shield") !== -1 || h.indexOf("shield-challenge") !== -1 ||
      h.indexOf("Establishing a secure connection") !== -1 || h.indexOf("data-pow=") !== -1;
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
    var slugs = [];

    // Match any occurrence of /rss/SLUG.rss in the page
    var re = /\/rss\/([a-z0-9][a-z0-9._-]*[a-z0-9])\.rss/gi;
    var m;
    while ((m = re.exec(text)) !== null) {
      var id = m[1].toLowerCase().trim();
      // Skip empty or placeholder slugs
      if (!id || id === "." || id.length < 2) continue;
      if (!seen[id]) {
        seen[id] = true;
        slugs.push(id);
      }
    }

    if (slugs.length < 10) return [];

    var self = this;
    return slugs.map(function(id) {
      return { id: id, title: self._slugToTitle(id) };
    }).sort(function(a, b) {
      return a.title.localeCompare(b.title);
    });
  },

  // -------------------------
  // Dynamic comic list loader
  // -------------------------

  _loadComics: function() {
    var self = this;
    if (self._comicsCache) return Promise.resolve(self._comicsCache);
    if (self._comicsLoading) return self._comicsLoading;

    self._comicsLoading = cinder.fetch(self.COMICS_RSS_INDEX, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html,*/*" },
    }).then(function(r) {
      if (r.status === 200 && r.data) {
        var comics = self._parseComicsRssIndex(r.data);
        if (comics.length > 50) return comics;
      }
      return self.COMICS_FALLBACK;
    }).catch(function() {
      return self.COMICS_FALLBACK;
    }).then(function(result) {
      self._comicsCache = result;
      self._comicsLoading = null;
      return result;
    });

    return self._comicsLoading;
  },

  // -------------------------
  // Image extractors
  // -------------------------

  _extractImageUrl: function(html) {
    var nd = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (nd) {
      try {
        var s = JSON.stringify(JSON.parse(nd[1]));
        var fa = s.match(/"(https:\\\/\\\/featureassets\.gocomics\.com\\\/assets\\\/[a-f0-9]{20,})"/i);
        if (fa) return fa[1].replace(/\\\//g, "/");
        var am = s.match(/"(https:\\\/\\\/assets\.amuniversal\.com\\\/[a-f0-9]{20,})"/i);
        if (am) return am[1].replace(/\\\//g, "/");
      } catch (e) {}
    }
    var og = html.match(/property=["']og:image["'][^>]*content=["'](https?:\/\/[^"'?]+(?:featureassets|amuniversal)[^"'?]*)/i)
           || html.match(/content=["'](https?:\/\/[^"'?]+(?:featureassets|amuniversal)[^"'?]*)[^>]*property=["']og:image["']/i);
    if (og) return og[1];
    var fa2 = html.match(/https:\/\/featureassets\.gocomics\.com\/assets\/([a-f0-9]{20,})/i);
    if (fa2) return "https://featureassets.gocomics.com/assets/" + fa2[1];
    var am2 = html.match(/https?:\/\/assets\.amuniversal\.com\/([a-f0-9]{20,})/i);
    if (am2) return "https://assets.amuniversal.com/" + am2[1];
    return null;
  },

  _extractImageFromRss: function(xml, datePath) {
    var items = xml.split(/<item[\s>]/i);
    for (var i = 1; i < items.length; i++) {
      var item = items[i];
      if (datePath) {
        var linkMatch = item.match(/<link[^>]*>\s*([^\s<]+)\s*<\/link>/i);
        if (!linkMatch || linkMatch[1].indexOf(datePath) === -1) continue;
      }
      var descMatch = item.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
      if (descMatch) {
        var content = descMatch[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
        var imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) return imgMatch[1];
        var urlMatch = content.match(/https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|gif|webp)[^\s"'<>]*/i);
        if (urlMatch) return urlMatch[0];
      }
      var encMatch = item.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
      if (encMatch) return encMatch[1];
    }
    return null;
  },

  // -------------------------
  // Search
  // -------------------------

  search: function(query, page) {
    var self = this;
    var q = query.toLowerCase().trim();
    return self._loadComics().then(function(comics) {
      return comics
        .filter(function(c) {
          return c.title.toLowerCase().indexOf(q) !== -1 || c.id.toLowerCase().indexOf(q) !== -1;
        })
        .slice(0, 30)
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
    return self._loadComics().then(function(comics) {
      var local = comics.find(function(c) { return c.id === slug; });
      return {
        id: slug,
        title: local ? local.title : self._slugToTitle(slug),
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
    if (slug === "xkcd") {
      return cinder.fetch("https://xkcd.com/info.0.json", {
        headers: { "Accept": "application/json" },
      }).then(function(r) {
        var latest = 3000;
        try { if (r.status === 200) latest = JSON.parse(r.data).num; } catch(e) {}
        var chapters = [];
        for (var i = latest; i >= Math.max(1, latest - 99); i--) {
          chapters.push({ id: "xkcd|" + i, title: "Comic #" + i, chapterNumber: i, dateUploaded: "" });
        }
        return chapters;
      }).catch(function() { return []; });
    }

    var chapters = [];
    var today = new Date();
    for (var i = 0; i < 730; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() - i);
      var year  = d.getFullYear();
      var month = String(d.getMonth() + 1).padStart(2, "0");
      var day   = String(d.getDate()).padStart(2, "0");
      var dateStr = year + "/" + month + "/" + day;
      var display = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      chapters.push({
        id: slug + "|" + dateStr,
        title: display,
        chapterNumber: 730 - i,
        dateUploaded: d.toISOString().split("T")[0],
      });
    }
    return Promise.resolve(chapters);
  },

  // -------------------------
  // Pages
  // -------------------------

  getPages: function(chapterId) {
    var self = this;
    var parts = chapterId.split("|");
    if (parts.length !== 2) return Promise.resolve([]);
    var slug  = parts[0];
    var param = parts[1];

    if (slug === "xkcd") {
      return cinder.fetch("https://xkcd.com/" + param + "/info.0.json", {
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
      }).then(function(r) {
        try {
          if (r.status === 200) {
            var d = JSON.parse(r.data);
            if (d.img) return [{ url: d.img }];
          }
        } catch(e) {}
        return [];
      }).catch(function() { return []; });
    }

    // TIER 1: ComicsRSS – slug IS the RSS filename, always exact
    return cinder.fetch(self.RSS_BASE + "/" + slug + ".rss", {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "*/*" },
    }).then(function(r) {
      if (r.status === 200 && r.data) {
        var imgUrl = self._extractImageFromRss(r.data, param);
        if (imgUrl) return [{ url: imgUrl }];
      }
      return null;
    }).catch(function() { return null; })

    // TIER 2: GoComics direct, no headers
    .then(function(result) {
      if (result) return result;
      return cinder.fetch(self.BASE_URL + "/" + slug + "/" + param, {
        headers: {},
      }).then(function(r) {
        if (r.status === 200 && !self._isBlocked(r.data)) {
          var url = self._extractImageUrl(r.data);
          if (url) return [{ url: url }];
        }
        return null;
      }).catch(function() { return null; });
    })

    // TIER 3: GoComics with spoofed headers
    .then(function(result) {
      if (result) return result;
      return self._headers().then(function(headers) {
        return cinder.fetch(self.BASE_URL + "/" + slug + "/" + param, {
          headers: headers,
        });
      }).then(function(r) {
        if (r.status === 200 && !self._isBlocked(r.data)) {
          var url = self._extractImageUrl(r.data);
          if (url) return [{ url: url }];
        }
        return null;
      }).catch(function() { return null; });
    })

    .then(function(result) { return result || []; });
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
