# Cinder Extensions

Community extension repository for the Cinder ebook reader.

## What Are Extensions?

Extensions are JavaScript plugins that add content sources to Cinder. They run in a sandboxed runtime and can:

- Search for books, comics, manga, and other content.
- Browse/discover sections such as popular, latest, or categories.
- Resolve direct downloads or debrid links for books/files.
- Stream manga/comic chapters page-by-page.
- Package chaptered text sources into EPUB when supported by the app.

## Available Extensions

| Extension | Type | Description |
|---|---|---|
| **Asura Scans** | Manga | Read manga, manhwa, and manhua from Asura Scans. |
| **Atsumaru** | Manga | Read manga, manhwa, manhua, and OEL from Atsumaru. |
| **MangaDex** | Manga | Search manga from MangaDex.org, a free community-run manga platform. |
| **OPDS Catalog** | Books | Connect to your OPDS-compatible server, including Komga, Kavita, Calibre-web, and COPS. |
| **Anna's Archive** | Books | Direct downloader powered entirely by your device; no backend infrastructure. |
| **LibGen** | Books | Direct download-source extension with on-device link resolution. |
| **OceanofPDF** | Books | Download-source extension with separate EPUB/PDF results and POST form downloads. |
| **ReadComicsOnline** | Comics | Search, read, and download comics from ReadComicsOnline. |
| **WeebCentral** | Manga | Search, read, and download manga from WeebCentral. Credit to Theoenogo for building this extension. |
| **DownMagaz** | Magazines | Search, read, and download magazines from downmagaz.net. Credit to Tonynks for building much of this extension. |
| **GoComics** | Comics | Read daily comic strips from GoComics, Comics Kingdom, ComicsRSS, and more. Credit to Tonynks for the source extension. |
| **ComicHubFree** | Comics | Search and read western comics from ComicHubFree. |
| **BBato** | Manga | Read manga, manhwa, and manhua from BBato. |

## How To Install

1. Open Cinder -> Settings -> Extensions.
2. Tap + / Add Repository.
3. Enter this repository URL:
   ```text
   https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/repo.json
   ```
4. Browse and install extensions from the repository.

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
  url: "https://example.com/file.epub",
  size: "12 MB",
  format: "epub",
  source: "My Source",
  extra: { any: "metadata needed later" }
}
```

Use stable IDs. Cinder stores IDs for library entries, downloaded chapters, and resume behavior.

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
- Use absolute URLs in returned results and page lists.
- Include required image/download headers, especially `Referer`.
- Keep IDs stable across searches and updates.
- Return `[]` for no results; throw only for real failures that should surface to the user.
- Avoid long synchronous loops; extension calls are timeout-protected.
- Test search, chapter loading, page streaming, downloads, and cover art before publishing.

## License

Extensions in this repository are provided as-is for educational purposes.

