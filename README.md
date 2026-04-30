# Cinder Extensions

Community extension repository for the [Cinder](https://github.com/TrexxyMon/Cinder) ebook reader.

## What are Extensions?

Extensions are JavaScript plugins that add content sources to Cinder. They run in a sandboxed environment and can:

- 🔍 **Search** — Find books, comics, and manga from various sources
- 📚 **Browse** — Discover sections like "Popular", "New Releases"
- 📥 **Download** — Resolve download links for books
- 📖 **Read** — Stream manga chapters page-by-page

## Available Extensions

| Extension | Type | Description |
|---|---|---|
| **MangaDex** | Manga | Search manga from MangaDex.org — free, community-run manga platform |
| **OPDS Catalog** | Books | Connect to your OPDS-compatible server (Komga, Kavita, Calibre-web, COPS) |
| **ReadComicsOnline** | Comics | Search, read, and download comics from ReadComicsOnline |
| **WeebCentral** | Manga | Search, read, and download manga from WeebCentral (credit to Theonogo for building this extension) |
## How to Install

1. Open Cinder → **Settings** → **Extensions**
2. Tap **+** (Add Repository)
3. Enter this URL:
   ```
   https://raw.githubusercontent.com/TrexxyMon/cinder-extensions/main/repo.json
   ```
4. Browse and install extensions from the repository

## Building Your Own Extension

See [`template.js`](template.js) for a fully documented extension template with all available APIs.

### Available APIs

Extensions receive a `cinder` object with these methods:

```js
cinder.fetch(url, options?)    // HTTP requests
cinder.parseHTML(html)         // jQuery-like HTML parsing
cinder.parseXML(xml)           // XML parsing
cinder.store.get/set/delete()  // Persistent storage
cinder.log/warn/error()        // Logging
```

### Extension Structure

```js
class MySource {
  id = "my-source";
  name = "My Source";
  version = "1.0.0";
  contentType = "books"; // books | comics | manga | audiobooks

  async search(query, page) { /* ... */ }
  async resolve(item) { /* ... */ }
  // ... see template.js for all methods
}

__cinderExport = new MySource();
```

## License

Extensions in this repository are provided as-is for educational purposes.
