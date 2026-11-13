# Cinder Reader Extensions

Community extension repository for the Cinder ebook reader.

## What Are Extensions?

Extensions are JavaScript plugins that add content sources to Cinder. They run in a sandboxed runtime and can:

- Search for books, audiobooks, comics, manga, and other content.
- Browse/discover sections such as popular, latest, or categories.
- Resolve direct downloads or debrid links for books/files.
- Stream manga/comic chapters page-by-page.
- Package chaptered text sources into EPUB when supported by the app.

## Available Extensions

| Extension | Type | Description |
|---|---|---|
| **[GoldenAudiobooks](docs/goldenaudiobooks.md)** | Audiobooks | **No debrid required.** On-device browsing/search with ordered direct audio downloads for offline listening. |
| **[AudioBookBay](docs/audiobookbay.md)** | Audiobooks | On-device search, release details and optional discovery shelves; **Debrid required** for downloads. |
| **[Knaben Audiobooks](docs/knaben-audiobooks.md)** | Audiobooks | Audiobook-only API search, optional discovery shelves, and release availability counts; **Debrid required** for downloads. |
| **[The Pirate Bay Audiobooks](docs/thepiratebay-audiobooks.md)** | Audiobooks | Audiobook-only search with release sizes and availability counts; **Debrid required** for downloads. |
| **Asura Scans** | Manga | Read manga, manhwa, and manhua from Asura Scans. |
| **Atsumaru** | Manga | Read manga, manhwa, manhua, and OEL from Atsumaru. |
| **MangaDex** | Manga | Search manga from MangaDex.org, a free community-run manga platform. |
| **MangaK** | Manga | Read manga, manhwa, and manhua from MangaK. No debrid required. |
| **MangaKakalot** | Manga | Read manga, manhwa, and manhua from MangaKakalot. No debrid required. |
| **OPDS Catalog** | Books | Connect to your OPDS-compatible server, including Komga, Kavita, Calibre-web, and COPS. |
| **Anna's Archive** | Books | On-device search and direct downloads, with optional TorBox resolution without a supporter key. |
| **Z-Library** | Books | Anonymous search and account downloads with automatic API mirror fallback, optional session keys, language/format preferences, and discovery shelves. Created by Stick. |
| **Bookracy** | Books | Search and download ebooks, comics, and manga from Bookracy's open library API. |
| **LibGen** | Books | Direct download-source extension with on-device link resolution. |
| **Mayberry** | Books | Search and download books from the federated Mayberry library network, with covers, metadata, and New Releases, New Arrivals, and Top Reads discovery shelves. |
| **ElScione Server** | Web & Light Novels/Manga | Search an h5ai ebook and manga server for EPUB, PDF, CBZ, and CBR files. |
| **OceanofPDF** | Books | OceanofPDF-first search with EPUB/PDF results, browser checks when possible, Verify Website for required interactive checks, signed downloads with matching browser identity and scoped clearance, and ReadRobe as a fallback only. |
| **Royal Road** | Webnovels | Search chaptered fiction from Royal Road and package it into EPUB for reading in Cinder. |
| **ReadNovelEU** | Web & Light Novels | Search and read chaptered web novels from the current WuxiaWorld destination. |
| **NovelBin** | Web & Light Novels | Search public chaptered web novels and build EPUBs on device. No debrid required. |
| **Novel Fire** | Web & Light Novels | Search public chaptered web novels and build EPUBs on device. No debrid required. |
| **WebNovel** | Web & Light Novels | Search and read public chaptered web novels from WebNovel; locked chapters are not bypassed. |
| **Witch Cult Translations** | Web & Light Novels | Read public chaptered Re:Zero web novel fan translations and package arcs into EPUB on device. |
| **Luminare Translations** | Books/Webnovels | Search public light novels, load rich metadata and covers, and build available chapters with illustrations into EPUB. No debrid required. |
| **BronsTL** | Books/Webnovels | Search public light novels, load metadata and covers, and build available chapters with illustrations into EPUB. No debrid required. |
| **Literotica** | Webnovels | Search adult fiction and build public stories into EPUB on device. No debrid required. |
| **ReadComicsOnline** | Comics | Search, read, and download comics from ReadComicsOnline. |
| **ReadAllComics** | Comics | Search and read western comics with chaptered image pages. No debrid required. |
| **WeebCentral** | Manga | Search, read, and download manga from WeebCentral. Credit to Theoenogo for building this extension. |
| **ComicK Fanmade** | Manga | Read manga, manhwa, and manhua from ComicK Fanmade. No debrid required. |
| **WEBTOON** | Manga/Comics | Search public WEBTOON Originals and Canvas titles and read web-visible episodes as long-strip chapters. |
| **FreeMagazines.top** | Magazines | Search and browse PDF magazines with on-device link resolution and preserved title and cover metadata. No debrid required. |
| **DownMagaz** | Magazines | Search, read, and download magazines from downmagaz.net. Credit to Tonynks for building much of this extension. |
| **GoComics** | Comics | Read daily comic strips from GoComics, Comics Kingdom, ComicsRSS, and more. Credit to Tonynks for the source extension. |
| **ComicHubFree** | Comics | Search and read western comics from ComicHubFree. |
| **BatCave** | Comics | Search and discover western comics, browse issue lists, and stream chapter pages. No debrid required. |
| **Sway Translations** | Web & Light Novels | Search WordPress novel pages for EPUB/PDF downloads. |
| **BBato** | Manga | Read manga, manhwa, and manhua from BBato. |

### Audiobook extensions

GoldenAudiobooks offers direct audio downloads for offline listening: **no debrid
account is required**. Downloads need an audiobook-capable Cinder build (manifest
minimum `1.2.4`). Version `0.1.2-cinder` disables online Listen in Cinder builds
that support the optional `audioStreaming` capability. Older builds ignore that
flag; use Download there. Availability depends on the website's audio hosts.

AudioBookBay, Knaben Audiobooks, and The Pirate Bay Audiobooks require an
audiobook-capable Cinder build (manifest minimum `1.2.4`) and a connected debrid
provider supporting magnet releases. Cinder handles provider selection, remote
preparation, track selection, downloads, and playback. These extensions do not
need their own debrid API keys. An uncached release depends on source availability
and the selected provider; a result is not a guarantee of a completed download.

All four audiobook extensions moved from the private testing repository on November 11,
2026. Add this repository, refresh both catalogs, and update the installed
extensions without uninstalling. Their existing extension IDs, release IDs, and
settings keys remain unchanged. The previous private scripts are retained for
older cached manifests; new updates are published here.

The three debrid audiobook extensions also normalize explicit catalog queries
such as `Work: Series: Book 2 (Unabridged)` before searching, using the existing
Cinder API. Update them to receive this compatibility fix. Older app versions can
still filter out some correct short release titles; the accompanying Cinder fix
corrects that ranking and sends the clean work title first. Source titles and
download identities remain unchanged.

### Anna's Archive download method

Version `2.1.15` improves automatic search recovery. It tries the three official
mirrors within one deadline, runs the website's browser check automatically when
needed, and reuses the working browser session. Overlapping searches share that
check. Manual **Verify Website** remains a fallback if the site requires human
interaction or refuses the automatic attempt. See [search reliability](docs/annas-archive.md)
for behavior, validation, and limitations. No new Cinder build is needed.

Direct download remains the default. Set **Download Method → TorBox (no supporter
key needed)** in the extension's settings to let the TorBox account connected in
Cinder resolve the book's Anna's Archive page. A personal AA supporter key is not
required or read in TorBox mode. The optional supporter key still works separately
for fast **Direct** downloads. No TorBox key is entered in the extension.

Search and browser verification still happen on your device. TorBox mode requires
a connected TorBox account with WebDL access and depends on TorBox's host support.
It does not silently switch providers or download the book's HTML page as a file.
If unavailable, switch back to **Direct**. Existing app routing fields are reused;
ordinary Direct downloads and users who leave the setting off are unchanged.

TorBox [announced its own Anna's Archive downloader](https://feedback.torbox.app/changelog/v70)
and [added .gl support](https://feedback.torbox.app/changelog/v84). As of October 22,
2026, its [live host list](https://api.torbox.app/v1/api/webdl/hosters) marks Anna's
Archive disabled due to CAPTCHA. This extension option cannot fix that upstream
outage or guarantee successful downloads while the host is disabled.

### Z-Library connection and fallback settings

Version 1.3.1 keeps existing saved domains, language preferences, credentials,
book IDs, and discovery sections. Search can still run without an account;
downloads require your account or session keys.

- **Z-Library Domain** offers **Auto (recommended)**, known mirrors, cached
  mirrors from the maintained list, and **Custom**. Auto needs no typed domain.
  Existing saved domain values remain selected; choose Auto to switch. Custom
  domains remain available through the optional Custom Domain field.
- **Automatic Mirror Fallback** applies when a specific mirror is selected.
  Auto always tries alternatives and remembers a working API mirror. Turning
  fallback off for a specific domain restricts requests to that domain.
- The maintained mirror list refreshes in the background at most weekly after
  a successful refresh. A failed refresh retains the cached list; searches do not
  wait for that refresh. Requests share a bounded deadline rather than stacking
  a full timeout for every mirror.
- **Preferred Format** optionally restricts search to EPUB, PDF, MOBI, or AZW3.
  Existing language preferences still apply.
- **Remix User ID / Remix User Key** optionally replace password sign-in. Supply
  both or leave both blank. Passwords and session secrets use Cinder's secure
  storage. With email/password, a refused API login gets one attempt through
  the website's login form on the same mirror. Its different session response is
  supported. HTTP 400 "Please login" refreshes a saved session once instead of
  failing as a generic HTTP error. Login rate limits and download quotas stop
  retries; credentials never enter request URLs or routine extension logs.
- After a search or sign-in browser challenge, fast API mirrors are tried
  first. If none succeeds, one bounded, silent public-homepage load can complete
  a noninteractive browser check. The original POST is then retried once with
  fresh same-origin cookies and its unchanged body. Credentials and search text
  are never put into the warm-up URL or headers. Healthy requests do not open a
  browser; simultaneous warm-ups for the same origin share the work.
- **Verify Website** remains available for required interactive checks. Browser
  GET fallback is also supported, but neither path solves a required checkbox
  or bypasses account limits. Browser features are optional on older Cinder
  versions; no new app API is required for API search/downloads.

Fallback design is informed by
[imprisonedmind/cinder-zlib](https://github.com/imprisonedmind/cinder-zlib)
(Unlicense). Mirror data comes from the maintained
[ZlibraryKO domain list](https://github.com/ZlibraryKO/zlibrary.koplugin/blob/main/assets/domains.json).
The separate private Z-Library Direct extension is unchanged.

## How To Install

1. Open Cinder -> Settings -> Extensions.
2. Tap + / Add Repository.
3. Enter this repository URL:
   ```text
   https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/repo.json
   ```
4. Browse and install extensions from the repository.

### Mayberry migration

Mayberry is now distributed from this public repository as `0.1.2-cinder`. It remains a multilingual **Books** extension with the same `mayberry` ID, search/download behavior, metadata, covers, and discovery shelves.

If you installed it from the testing repository, keep this public repository added, refresh your repositories, and update Mayberry. If an older Cinder version does not offer a cross-repository update, select Mayberry in this repository and install/update it without uninstalling first. The extension ID and book IDs are unchanged.

## Building Extensions

Start from `template.js` when creating a new source. Each extension is a single JavaScript file that assigns its source object or class instance to `__cinderExport`.

```js
var MySource = {};

MySource.id = "my-source";
MySource.name = "My Source";
MySource.version = "1.0.0";
MySource.icon = "library";
MySource.description = "Short description";
MySource.contentType = "manga"; // books | comics | manga | audiobooks

MySource.capabilities = {
  search: true,
  discover: false,
  download: false,
  resolve: false,
  searchDownloads: false,
  bookChapters: false,
  manga: true,
};

MySource.search = async function(query, page) {
  return [];
};

__cinderExport = MySource;
```

### Repository Manifest

Add the extension to `repo.json` so Cinder can discover and install it:

```json
{
  "id": "my-source",
  "name": "My Source",
  "version": "1.0.0",
  "description": "Short description",
  "language": "English",
  "contentType": "manga",
  "scriptUrl": "https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/my-source.js",
  "minCinderVersion": "2.0.0"
}
```

Bump the extension `version` whenever users need Cinder to detect an update.

### Capabilities

- `search`: The extension appears as a searchable source and implements `search(query, page)`.
- `discover`: The extension implements `getDiscoverSections()` and `getDiscoverItems(sectionId, page)`.
- `download`: Search results can include a direct `url` to download.
- `resolve`: The extension implements `resolve(item)` to turn a search result into a download URL, file payload, or debrid link.
- `searchDownloads`: The extension appears in Search Downloads on book detail pages.
- `bookChapters`: The extension supports chaptered text content via `getBookChapters(bookId)` and `getBookChapter(chapterId)`.
- `manga`: The extension supports manga/comic reading via `getChapters(mangaId)` and `getPages(chapterId)`.

### Search Results

`search()` returns an array like:

```js
{
  id: "stable-id-or-detail-url",
  title: "Result title",
  author: "Optional author",
  cover: "https://example.com/cover.jpg",
  coverHeaders: { Referer: "https://example.com/" },
  description: "Optional synopsis or description",
  url: "https://example.com/file.epub",
  size: "12 MB",
  format: "epub",
  source: "My Source",
  extra: {
    description: "Optional synopsis or description",
    any: "metadata needed later"
  }
}
```

Use stable IDs. Cinder stores IDs for library entries, downloaded chapters, and resume behavior.
When search or browse already includes a synopsis, publish it in both `description` and `extra.description`. Current Cinder uses the first-class field, while older APKs continue reading the legacy field. Do not remove `extra.description` from an existing extension while supported older APKs remain in use. If a fuller synopsis requires a detail-page request, also implement `getBookDetails(bookId)` or `getMangaDetails(mangaId)`; current Cinder loads it lazily only after the user selects that title.

### Downloads

If `capabilities.resolve = true`, implement `resolve(item)` and return one of these forms:

```js
return {
  url: "https://example.com/file.epub",
  fileName: "Book.epub",
  fileSize: 123456,
  headers: { Referer: "https://example.com/" }
};
```

```js
return {
  debridLink: "magnet:?xt=urn:btih:...",
  debridProvider: "torbox" // torbox | realdebrid | debridlink
};
```

```js
return {
  debridLinks: ["https://host/one", "https://host/two"],
  debridProvider: "realdebrid"
};
```

### Manga And Comics

For manga/comic sources, set `capabilities.manga = true` and implement:

```js
MySource.getChapters = async function(mangaId) {
  return [
    {
      id: "chapter-id-or-url",
      title: "Chapter 1",
      chapterNumber: 1,
      dateUploaded: "2026-01-01",
      scanlator: "Optional group"
    }
  ];
};

MySource.getPages = async function(chapterId) {
  return [
    {
      url: "https://example.com/page1.jpg",
      headers: { Referer: "https://example.com/" }
    }
  ];
};
```

`getPages()` may also be an async generator yielding page chunks. This is useful for sources where pages can be streamed incrementally.

### Discovery

If `capabilities.discover = true`:

```js
MySource.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Popular", icon: "flame" }
  ];
};

MySource.getDiscoverItems = async function(sectionId, page) {
  return this.search(sectionId, page || 0);
};
```

### Settings

Extensions can expose settings in Cinder:

```js
MySource.getSettings = function() {
  return [
    { id: "api_key", label: "API Key", type: "password", placeholder: "Paste API key" },
    { id: "enabled", label: "Enabled", type: "toggle", defaultValue: true },
    {
      id: "format",
      label: "Preferred Format",
      type: "select",
      defaultValue: "epub",
      options: [
        { label: "EPUB", value: "epub" },
        { label: "PDF", value: "pdf" }
      ]
    }
  ];
};
```

Regular settings are stored through `cinder.store`; password settings are stored securely by the app and can be read through `cinder.secureStore` when needed.

### Cinder Sandbox APIs

Extensions cannot use `require`, React Native APIs, raw `fetch`, or Node globals. Use the injected `cinder` object:

```js
cinder.fetch(url, options)            // Text HTTP request
cinder.fetchBase64(url, options)      // Binary request as base64
cinder.fetchBrowser(url, options)     // WebView-backed page fetch for difficult sites
cinder.fetchBrowserCaptured(url)      // WebView-backed fetch with captured rendered output
cinder.fetchBrowserBinary(url)        // WebView-backed binary fetch as base64
cinder.parseHTML(html)                // HTML parsing helper
cinder.parseXML(xml)                  // XML parsing helper
cinder.resolveUrl(url, baseUrl)       // Resolve relative URLs
cinder.normalizeText(text)            // Strip tags/entities and normalize whitespace
cinder.extractJsonLd(html)            // Extract JSON-LD blocks
cinder.store.get/set/delete(key)      // Extension-scoped storage
cinder.secureStore.get/set/delete(key)// Extension-scoped secure storage
cinder.log/warn/error(...)            // Extension logging
```

`cinder.fetch()` returns `{ status, data, headers }`. Always check `status` and return an empty result array when a source cannot be reached.

### Practical Rules

- Keep source-specific scraping logic inside the extension, not the app.
- Declare a `language` in every repository manifest entry. Use `"Multilingual"` only when the extension actually returns content in multiple languages.
- Use absolute URLs in returned results and page lists.
- Include required image/download headers, especially `Referer`.
- Keep IDs stable across searches and updates.
- Return `[]` for no results; throw only for real failures that should surface to the user.
- Avoid long synchronous loops; extension calls are timeout-protected.
- Test search, chapter loading, page streaming, downloads, and cover art before publishing.

## License

Extensions in this repository are provided as-is for educational purposes.



### External source categories

`repo.json` may include optional `categoryAnnotations` for third-party sources. Each entry uses `runtime`, `upstreamId`, the exact HTTPS `scriptUrl`, and `contentTypes`. Cinder uses these only when the upstream manifest does not declare a category; a user override takes priority. Older Cinder versions ignore this optional field. The initial annotation classifies Suwatte BatCave as comics without putting site-specific rules in the app. Source scripts and download behavior are unchanged.
