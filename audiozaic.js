// Audiozaic's public download flow. Only the site's explicit Download Parts
// controls supply files; the separate web player requires a different client.
const AZ = "https://audiozaic.com";
const AZ_DOWNLOAD = "https://surahsofquran.com";
const azResolutions = new Map();
const azSections = [
  { id: "latest", title: "Latest Audiobooks", type: "latest", category: "audiobook" },
  { id: "fantasy", title: "Fantasy", type: "genres", category: "fantasy" },
  { id: "mystery", title: "Mystery", type: "genres", category: "mystery" },
  { id: "romance", title: "Romance", type: "genres", category: "romance" },
  { id: "non-fiction", title: "Nonfiction", type: "genres", category: "non-fictional" }
];

function azText(node) {
  return node ? node.text().replace(/\s+/g, " ").trim() : "";
}

function azUrl(value, base) {
  if (typeof value !== "string" || !value || /[\u0000-\u001f\\]/.test(value)) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch (_) { return null; }
}

function azBookPath(value) {
  const url = azUrl(value, AZ);
  if (!url || url.origin !== AZ || url.search || url.hash || !/^\/[a-z0-9][a-z0-9-]*\/?$/i.test(url.pathname)) return "";
  return url.pathname.replace(/\/?$/, "/");
}

async function azPage(url, timeout, signal, allowMissing) {
  const response = await cinder.fetch(url, { timeout: timeout, signal: signal, headers: { Accept: "text/html" } });
  if (allowMissing && response.status === 404) return null;
  if (response.status !== 200) {
    const error = new Error(response.status ? "The audiobook source returned HTTP " + response.status + ". Try again later." :
      "The audiobook source could not be reached. Check the connection and retry.");
    error.status = response.status;
    throw error;
  }
  const expected = new URL(url);
  const final = azUrl(response.url || url, url);
  if (!final || final.origin !== expected.origin ||
      final.pathname.replace(/\/$/, "") !== expected.pathname.replace(/\/$/, "") ||
      final.searchParams.toString() !== expected.searchParams.toString()) {
    throw new Error("The audiobook source redirected to a different page. Please search again.");
  }
  if (typeof response.data !== "string" || !response.data || response.data.length > 3000000) {
    throw new Error("The audiobook source returned an unreadable page.");
  }
  return cinder.parseHTML(response.data);
}

function azMetadata(post, heading, id, cover) {
  const label = (heading.attr("title") || azText(heading)).replace(/^(?:\s*\[[^\]]{1,16}\])+\s*/, "").trim();
  const names = /^(.*)\s+(?:[-–—]\s*)?by\s+(.+?)\.?$/i.exec(label);
  const title = (names ? names[1] : label).replace(/\s+[-–—]\s*$/, "")
    .replace(/\s+Audiobook(?:\s+Free)?\b/i, "").replace(/[“”"]/g, "").trim();
  const image = azUrl(cover, AZ);
  return { id: id, url: AZ + id, title: title || label, author: names ? names[2].trim() : undefined,
    cover: image && image.origin === AZ ? image.href : undefined,
    genres: post.querySelectorAll(".meta-category a").map(azText).filter(label => label && label.toLowerCase() !== "audiobook"),
    language: "English", contentType: "audiobooks", contentTypes: ["audiobook"], format: "audiobook", source: "Audiozaic" };
}

async function azList(query, page, category, signal) {
  const number = Math.max(1, Math.floor(Number(page) || 1));
  const path = (category ? "/category/" + category + "/" : "/") + (number > 1 ? "page/" + number + "/" : "");
  const doc = await azPage(AZ + path + (query ? "?s=" + encodeURIComponent(query) : ""), 8500, signal, number > 1);
  if (!doc) return [];
  const scope = doc.querySelector("#primary");
  if (!scope) throw new Error("Audiozaic's catalog could not be read.");
  const seen = new Set(), items = [];
  for (const post of scope.querySelectorAll("article.post")) {
    const link = post.querySelector("h2.entry-title a");
    const id = link && azBookPath(link.attr("href"));
    if (!id || seen.has(id)) continue;
    const img = post.querySelector(".meta-image img");
    seen.add(id);
    items.push(azMetadata(post, link, id, img && (img.attr("data-src") || img.attr("src"))));
  }
  if (!items.length && !scope.querySelector("#post-0, .vce-loop-wrap") && !doc.querySelector("body.search-no-results")) {
    throw new Error("Audiozaic's catalog layout could not be recognized.");
  }
  return items;
}

async function azDetails(id) {
  const path = azBookPath(id);
  if (!path) throw new Error("Invalid Audiozaic book. Search for it again.");
  const doc = await azPage(AZ + path, 10000);
  const post = doc.querySelector("article.vce-single.post");
  const heading = post && post.querySelector("h1.entry-title");
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (!heading || (canonical && azBookPath(canonical.attr("href")) !== path)) throw new Error("Audiozaic returned a different book or an unreadable detail page.");
  const image = doc.querySelector('meta[property="og:image"]');
  const item = azMetadata(post, heading, path, image && image.attr("content"));
  item.description = azText(post.querySelector(".entry-content > p")) || undefined;
  return { item: item, post: post };
}

function azPlayer(post) {
  const button = post.querySelector("#listen-button"), count = post.querySelector("#countdown-number");
  const handler = button && /^\s*window\.open\(\s*(['"])([^'"]+)\1\s*(?:,\s*['"]_blank['"]\s*)?\)\s*;?\s*$/.exec(button.attr("onclick") || "");
  const url = handler && azUrl(handler[2], AZ);
  const seconds = azText(count);
  const postId = /\bpost-(\d+)\b/.exec(post.attr("class") || "");
  if (!url || url.origin !== AZ || !/^\/file-audio\/?$/.test(url.pathname) || !/^\?slug32=\d+$/.test(url.search) ||
      (postId && url.searchParams.get("slug32") !== postId[1]) || !/^\d{1,3}$/.test(seconds)) {
    throw new Error("This Audiozaic edition has no recognized audiobook button.");
  }
  return { url: url.href, delay: Number(seconds) * 1000 };
}

function azMedia(value) {
  const url = azUrl(value);
  if (!url || !/^(?:audio\d*|free2)\.audiobookslab\.com$/.test(url.hostname) || !/\.mp3$/i.test(url.pathname)) return "";
  return url.href;
}

function azFileLink(value, base, final) {
  const url = azUrl(value, base);
  if (!url || url.origin !== AZ_DOWNLOAD || url.hash ||
      (final ? url.pathname !== "/" || url.searchParams.get("fd_download") !== "1" : !/^\/download\/?$/.test(url.pathname))) return null;
  const files = url.searchParams.getAll("file");
  const media = files.length === 1 && azMedia(files[0]);
  return media ? { url: url.href, media: media } : null;
}

function azPlayerMediaKey(value) {
  const media = azMedia(value);
  if (!media) return "";
  // WordPress appends a numeric player-instance parameter to the playback URL.
  // Ignore only that parameter for comparison; preserve the actual download URL.
  const url = new URL(media);
  const query = url.search.slice(1).split("&").filter(field => field && !/^_=\d+$/.test(field)).join("&");
  return url.origin + url.pathname + (query ? "?" + query : "");
}

function azTracks(doc) {
  const buttons = doc.querySelectorAll(".rp-download-grid a.rp-download-btn");
  if (!buttons.length) throw new Error("This Audiozaic edition has no Download Parts option.");
  const media = new Set();
  const tracks = buttons.map(button => {
    const caption = azText(button.querySelector(".rp-download-label")) || azText(button);
    const match = /^(Part|Chapter)\s+(\d+)$/i.exec(caption);
    const link = azFileLink(button.attr("href"), AZ, false);
    if (!match) throw new Error("Audiozaic returned an unrecognized chapter or part label.");
    const kind = match[1].toLowerCase() === "chapter" ? "Chapter" : "Part";
    const number = Number(match[2]);
    if (!link) throw new Error("Audiozaic returned an unsupported download link for " + kind + " " + number + ".");
    const key = azPlayerMediaKey(link.media);
    if (media.has(key)) throw new Error("Audiozaic listed the same audio twice at " + kind + " " + number + ".");
    media.add(key);
    return { number: number, kind: kind, link: link };
  }).sort((a, b) => a.number - b.number);
  if (tracks.some((track, i) => track.number !== i + 1)) throw new Error("Audiozaic's download list has missing or duplicate parts.");
  const players = doc.querySelectorAll("audio");
  if (players.length) {
    const playerMedia = new Set(players.map(player => {
      const source = player.querySelector("source[src]");
      return azPlayerMediaKey(player.attr("src") || (source && source.attr("src")));
    }));
    if (players.length !== tracks.length || playerMedia.size !== media.size || Array.from(media).some(key => !playerMedia.has(key))) {
      throw new Error("Audiozaic's download parts do not match the complete player track list.");
    }
  }
  return tracks;
}

function azReadyFile(doc, track) {
  const start = doc.querySelector("#fd-start-btn");
  const button = doc.querySelector("#fd-step-4 a.fd-btn-download");
  const target = button && azFileLink(button.attr("href"), AZ_DOWNLOAD, true);
  if (!start || !/^\s*fdStartProcess\(\s*\)\s*;?\s*$/.test(start.attr("onclick") || "") || !target || target.media !== track.link.media) {
    throw new Error("Audiozaic's download page did not offer the selected part. Try opening it on the website.");
  }
  // Read the two durations actually used by the page. Its initial static label
  // can disagree with the running timer. An unknown flow needs a source update.
  const script = doc.querySelectorAll("script").map(node => node.html()).find(text => /\bvar\s+fdDuration\s*=/.test(text) && /\bvar\s+dlSecs\s*=/.test(text));
  const preparation = script && /\bvar\s+fdDuration\s*=\s*(\d+)\s*;/.exec(script);
  const countdown = script && /\bvar\s+dlSecs\s*=\s*(\d+)\s*;/.exec(script);
  if (!preparation || !countdown) throw new Error("Audiozaic changed its download countdown. The file could not be prepared.");
  return { readyAt: Date.now() + Number(preparation[1]) + Number(countdown[1]) * 1000,
    file: { url: target.url, name: track.kind + " " + String(track.number).padStart(3, "0") + ".mp3", title: track.kind + " " + track.number } };
}

function azTimeLeft(deadline) {
  const left = deadline - Date.now();
  if (left <= 0) throw new Error("Audiozaic took too long to prepare this audiobook. Please retry.");
  return left;
}

async function azWait(until, deadline) {
  if (until >= deadline) throw new Error("This edition's download preparation exceeds Cinder's time limit.");
  while (Date.now() < until) {
    const delay = Math.min(30000, until - Date.now(), azTimeLeft(deadline));
    await new Promise(done => setTimeout(done, delay));
  }
  azTimeLeft(deadline);
}

async function azResolve(id) {
  const deadline = Date.now() + 115000;
  const detail = await azDetails(id);
  const player = azPlayer(detail.post);
  await azWait(Date.now() + player.delay, deadline);
  const tracks = azTracks(await azPage(player.url, Math.min(12000, azTimeLeft(deadline))));
  const ready = new Array(tracks.length);
  let next = 0, stopped = false;
  async function worker() {
    try {
      while (!stopped && next < tracks.length) {
        const index = next++;
        const track = tracks[index];
        const doc = await azPage(track.link.url, Math.min(12000, azTimeLeft(deadline)));
        ready[index] = azReadyFile(doc, track);
        if (ready[index].readyAt >= deadline) throw new Error("This edition's download preparation exceeds Cinder's time limit.");
      }
    } catch (error) { stopped = true; throw error; }
  }
  // A loaded part's countdown runs while other pages load. Bound network work,
  // then wait for the last scheduled part so the import is complete or fails.
  await Promise.all(Array.from({ length: Math.min(3, tracks.length) }, worker));
  await azWait(ready.reduce((last, part) => Math.max(last, part.readyAt), 0), deadline);
  return { audioFiles: ready.map(part => part.file) };
}

const Audiozaic = {
  id: "audiozaic", name: "Audiozaic", version: "0.1.2-cinder", icon: "headset-outline",
  description: "Find audiobooks and download their available MP3 parts as one book.",
  language: "English", contentType: "audiobooks", contentTypes: ["audiobook"], debridSupport: "none",
  excludeFromDefaultMetadataProviders: true, browser: { startUrl: AZ + "/" },
  capabilities: { search: true, searchDownloads: true, resolve: true, resolveOnDownload: true, audioStreaming: false, discover: true, download: false, manga: false },
  async search(query, page, selection, context) {
    const text = String(query || "").trim();
    return text ? azList(text, page, "", context && context.signal) : azList("", page, "audiobook", context && context.signal);
  },
  async getDiscoverSections() {
    return azSections.map(({ id, title, type }) => ({ id, title, type }));
  },
  async getDiscoverItems(sectionId, page) {
    const section = azSections.find(row => row.id === sectionId);
    return section ? azList("", page, section.category) : [];
  },
  async getBookDetails(id) { return (await azDetails(id)).item; },
  async resolve(item) {
    const id = azBookPath(item && (item.id || item.url));
    if (!id) throw new Error("Invalid Audiozaic book. Search for it again.");
    if (azResolutions.has(id)) return azResolutions.get(id);
    const pending = azResolve(id);
    azResolutions.set(id, pending);
    try { return await pending; }
    finally { azResolutions.delete(id); }
  }
};
__cinderExport = Audiozaic;
