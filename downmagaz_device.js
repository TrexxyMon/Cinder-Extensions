// DownMagaz device-side extension for Cinder
// Rewritten to avoid the proxy-backed manga/PDF-page flow.
// This version searches and resolves issue links on device and lets Cinder
// download/open the resulting PDF or file-host URL with the normal reader path.

var DownMagazSource = {};

DownMagazSource.id = "downmagaz";
DownMagazSource.name = "DownMagaz";
DownMagazSource.version = "4.0.10";
DownMagazSource.icon = "\uD83D\uDCF0";
DownMagazSource.description =
  "Search and browse DownMagaz on device, then resolve issue links for PDF download.";
DownMagazSource.contentType = "books";

DownMagazSource.capabilities = {
  search: true,
  discover: true,
  download: true,
  resolve: true,
  manga: false,
};

DownMagazSource.BASE_URL = "https://downmagaz.net";

DownMagazSource.CATEGORIES = [
  { id: "comics_magazine", title: "Comics" },
  { id: "computer_magazine", title: "Computer" },
  { id: "science_magazine", title: "Science" },
  { id: "sport_magazine", title: "Sports" },
  { id: "news_magazine", title: "News & Weekly" },
  { id: "film_magazine", title: "Films & TV" },
  { id: "aviation_magazine_space", title: "Aviation & Space" },
  { id: "health_magazine", title: "Health" },
  { id: "food_magazine", title: "Food & Cooking" },
  { id: "car_magazine_moto", title: "Car & Motorcycle" },
  { id: "art_magazine_graphics", title: "Art & Graphic" },
  { id: "business_magazine_economics", title: "Business & Economics" },
  { id: "military_magazine", title: "Military & Arms" },
  { id: "home_magazine_interior_design", title: "Home & Interior" },
  { id: "fashion_magazine_women", title: "Fashion" },
  { id: "fitness_magazine", title: "Fitness" },
  { id: "game_magazine", title: "Games" },
  { id: "travel_magazine", title: "Travel" },
  { id: "music_mag", title: "Music" },
  { id: "hobbies_leisure_magazine", title: "Hobbies & Leisure" },
  { id: "family_magazine", title: "Family & Kids" },
  { id: "women_magazine", title: "For Women" },
  { id: "men_magazine", title: "For Men" },
  { id: "photo_magazine_video", title: "Photo & Video" },
  { id: "digital_magazine", title: "Digital & Tech" },
  { id: "fantasy_magazine", title: "Fantasy" },
  { id: "fishing_magazine_hunting", title: "Fishing & Hunting" },
  { id: "garden_magazine", title: "Garden & Farming" },
  { id: "architecture_magazine_bulding", title: "Architecture" },
  { id: "animals", title: "Animals" },
  { id: "knitting_magazine_sewing", title: "Knitting & Sewing" },
  { id: "craft_and_handmade_magazine", title: "Craft & Handmade" },
  { id: "newspapers", title: "Newspapers" },
  { id: "magazine", title: "Lifestyle & Other" }
];

DownMagazSource._headers = function() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": this.BASE_URL + "/"
  };
};

DownMagazSource._fetchText = async function(url) {
  var headers = this._headers();
  var res = await cinder.fetch(url, { headers: headers, timeout: 20000 });
  if (
    res &&
    res.status === 200 &&
    res.data &&
    res.data.indexOf("<html") >= 0 &&
    (
      res.data.indexOf('class="story shortstory"') >= 0 ||
      res.data.indexOf('class="fullstory"') >= 0 ||
      res.data.indexOf('id="dle-content"') >= 0
    )
  ) {
    return res.data;
  }

  cinder.log("Falling back to fetchBrowser for", url, "status:", res ? res.status : 0);
  var browserRes = await cinder.fetchBrowser(url, { headers: headers, timeout: 30000 });
  if (!browserRes || browserRes.status !== 200 || !browserRes.data) {
    throw new Error("Failed to load page: HTTP " + (browserRes ? browserRes.status : 0));
  }
  return browserRes.data;
};

DownMagazSource._decode = function(text) {
  if (!text) return "";
  return cinder.normalizeText(
    String(text)
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#8211;/g, "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ")
      .replace(/&#8212;/g, "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â")
  );
};

DownMagazSource._slugToFileName = function(title, fallbackExt) {
  var safe = String(title || "download")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!safe) safe = "download";
  return safe + "." + (fallbackExt || "pdf");
};

DownMagazSource._parseListings = function(html) {
  var results = [];
  var seen = {};
  var doc = cinder.parseHTML(html);
  var cards = doc.querySelectorAll(".story.shortstory");

  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    var titleLink =
      card.querySelector(".stitle a") ||
      card.querySelector(".sheading a") ||
      card.querySelector("a[href*=\"downmagaz.net/\"]");
    if (!titleLink) continue;

    var href = titleLink.attr("href");
    if (!href) continue;
    var pageUrl = cinder.resolveUrl(href, this.BASE_URL + "/");
    var idM = pageUrl.match(/^https:\/\/downmagaz\.net\/([a-z_]+)\/([^\/?#]+\.html)$/i);
    if (!idM) continue;

    var id = idM[1] + "/" + idM[2];
    if (seen[id]) continue;
    seen[id] = true;

    var title = this._decode(titleLink.text());
    var imgEl = card.querySelector("img");
    var imgSrc = imgEl ? (imgEl.attr("src") || imgEl.attr("data-src") || "") : "";
    var cover = imgSrc ? cinder.resolveUrl(imgSrc, this.BASE_URL + "/") : "";

    var rawText = card.text ? card.text() : "";
    var sizeM = rawText.match(/(\d+(?:[.,]\d+)?)\s*(MB|GB|KB)/i);
    var formatM = rawText.match(/\b(True\s+)?(PDF|CBZ|CBR|EPUB)\b/i);

    results.push({
      id: id,
      title: title,
      author: "Magazine",
      cover: cover,
      url: pageUrl,
      format: formatM ? String(formatM[2]).toLowerCase() : "pdf",
      size: sizeM ? (sizeM[1] + " " + sizeM[2].toUpperCase()) : undefined,
      source: "DownMagaz",
      extra: {
        articleUrl: pageUrl,
        articleId: id
      }
    });
  }

  return results;
};

DownMagazSource._extractCandidateLinks = function(html, pageUrl) {
  var doc = cinder.parseHTML(html);
  var container =
    doc.querySelector(".fullstory") ||
    doc.querySelector(".maincont") ||
    doc.querySelector("#dle-content") ||
    doc;

  var anchors = container.querySelectorAll("a");
  var out = [];
  var seen = {};
  var i;

  function addLink(link) {
    if (!link || seen[link]) return;
    if (!/^https?:\/\//i.test(String(link))) return;
    seen[link] = true;
    out.push(link);
  }

  for (i = 0; i < anchors.length; i++) {
    var href = anchors[i].attr("href");
    if (!href) continue;
    var resolved = cinder.resolveUrl(href, pageUrl);
    if (!resolved) continue;

    if (resolved.indexOf(DownMagazSource.BASE_URL) === 0) continue;
    if (/\.jpg($|\?)/i.test(resolved) || /\.jpeg($|\?)/i.test(resolved) || /\.png($|\?)/i.test(resolved) || /\.webp($|\?)/i.test(resolved) || /\.gif($|\?)/i.test(resolved)) continue;
    addLink(resolved);
  }

  if (out.length > 0) return out;

  var fieldMatches = String(html || "").match(/data-field="([^"]+)"/gi) || [];
  var downMatches = String(html || "").match(/data-down="([^"]+)"/gi) || [];
  var limit = fieldMatches.length < downMatches.length ? fieldMatches.length : downMatches.length;

  for (i = 0; i < limit; i++) {
    var fieldM = fieldMatches[i].match(/data-field="([^"]+)"/i);
    var downM = downMatches[i].match(/data-down="([^"]+)"/i);
    if (!fieldM || !downM) continue;

    var downValue = parseInt(downM[1], 10);
    if (isNaN(downValue)) continue;

    addLink(
      this.BASE_URL +
        "/out.php?f=" +
        encodeURIComponent(fieldM[1]) +
        "&down=" +
        String(downValue * 25475)
    );
  }

  return out;
};

DownMagazSource._looksLikeDirectFileUrl = function(url) {
  if (!url) return false;
  return /\.(pdf|epub|cbz|cbr)(?:$|[?#])/i.test(String(url));
};

DownMagazSource._probeDirectFileUrl = async function(url, referer) {
  if (!url) return false;
  try {
    var res = await cinder.fetch(url, {
      method: "HEAD",
      headers: {
        "Referer": referer || this.BASE_URL + "/"
      },
      timeout: 20000
    });

    var headers = (res && res.headers) || {};
    var contentType = String(headers["content-type"] || headers["Content-Type"] || "").toLowerCase();
    var disposition = String(headers["content-disposition"] || headers["Content-Disposition"] || "").toLowerCase();

    if (disposition.indexOf("filename=") >= 0 || disposition.indexOf("attachment") >= 0) {
      return true;
    }
    if (contentType && contentType.indexOf("text/html") >= 0) {
      return false;
    }
    if (/application\/(pdf|epub\+zip|octet-stream|zip|x-cbr|x-cbz|x-rar-compressed)/i.test(contentType)) {
      return true;
    }
  } catch (e) {
    cinder.warn("direct file probe failed:", String(e));
  }
  return false;
};
DownMagazSource._rankLinks = function(links) {
  if (!links || links.length === 0) return [];
  function score(link) {
    var lower = String(link || "").toLowerCase();
    var score = 0;

    if (lower.indexOf("downup.me") >= 0) score += 1000;
    if (lower.indexOf("pixeldrain") >= 0) score += 300;
    if (lower.indexOf("mediafire") >= 0) score += 250;
    if (lower.indexOf("gofile") >= 0) score += 220;
    if (lower.indexOf("mega.nz") >= 0) score += 200;
    if (lower.indexOf("1fichier") >= 0) score += 180;

    if (DownMagazSource._looksLikeDirectFileUrl(lower)) score += 150;
    if (lower.indexOf("download") >= 0) score += 40;

    if (lower.indexOf("novafile") >= 0 || lower.indexOf("nfile.cc") >= 0) score -= 500;
    if (lower.indexOf("turbobit") >= 0 || lower.indexOf("turb.to") >= 0) score -= 400;

    return score;
  }

  return links.slice().sort(function(a, b) {
    return score(b) - score(a);
  });
};

DownMagazSource._debridLinkCandidates = function(links) {
  var ranked = this._rankLinks(links).filter(function(link) {
    return /^https?:\/\//i.test(String(link || ""));
  });
  var downup = ranked.filter(function(link) {
    return String(link || "").toLowerCase().indexOf("downup.me") >= 0;
  });
  if (downup.length > 0) return downup;
  return ranked.filter(function(link) {
    var lower = String(link || "").toLowerCase();
    return lower.indexOf("javascript:") < 0 &&
      lower.indexOf("addcomplaint") < 0 &&
      lower.indexOf("nfile.cc") < 0 &&
      lower.indexOf("novafile") < 0;
  });
};

DownMagazSource._pickBestLink = function(links) {
  var sorted = this._rankLinks(links);
  return sorted[0] || "";
};

DownMagazSource.search = async function(query, page) {
  try {
    var url =
      this.BASE_URL +
      "/?do=search&subaction=search&story=" +
      encodeURIComponent(query || "");
    var html = await this._fetchText(url);
    return this._parseListings(html);
  } catch (e) {
    cinder.warn("search failed:", String(e));
    return [];
  }
};

DownMagazSource.getDiscoverSections = async function() {
  return this.CATEGORIES.map(function(c) {
    return { id: c.id, title: c.title, icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€šÃ‚Â°" };
  });
};

DownMagazSource.getDiscoverItems = async function(sectionId, page) {
  var p = (page || 0) + 1;
  try {
    var url = this.BASE_URL + "/" + sectionId + "/page/" + p + "/";
    var html = await this._fetchText(url);
    return this._parseListings(html);
  } catch (e) {
    cinder.warn("getDiscoverItems failed:", String(e));
    return [];
  }
};

DownMagazSource.resolve = async function(item) {
  var pageUrl =
    (item && item.extra && item.extra.articleUrl) ||
    (item && item.url) ||
    "";

  if (!pageUrl) {
    throw new Error("No article URL available for this issue.");
  }

  var html = await this._fetchText(pageUrl);
  var links = this._extractCandidateLinks(html, pageUrl);
  var rankedLinks = this._debridLinkCandidates(links);
  cinder.log("DownMagaz candidates:", rankedLinks.slice(0, 8).join(" | "));
  var chosen = rankedLinks[0] || "";

  if (!chosen) {
    throw new Error("No downloadable link found on the issue page.");
  }

  var lower = chosen.toLowerCase();
  var ext = "pdf";
  if (lower.indexOf(".cbz") >= 0) ext = "cbz";
  else if (lower.indexOf(".cbr") >= 0) ext = "cbr";
  else if (lower.indexOf(".epub") >= 0) ext = "epub";

  var directUrl = "";
  if (this._looksLikeDirectFileUrl(chosen)) {
    directUrl = chosen;
  } else if (await this._probeDirectFileUrl(chosen, pageUrl)) {
    directUrl = chosen;
  }

  return {
    url: directUrl || undefined,
    debridLink: chosen,
    debridLinks: rankedLinks,
    debridProvider: "debridlink",
    fileName: this._slugToFileName(item && item.title, ext)
  };
};

__cinderExport = DownMagazSource;
