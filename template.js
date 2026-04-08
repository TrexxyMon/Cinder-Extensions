// ─── Cinder Extension Template ──────────────────────────────
//
// Use this template to build your own Cinder extension.
// Extensions are plain JavaScript files that export a source
// object via __cinderExport.
//
// Available APIs (injected into the sandbox):
//
//   cinder.fetch(url, options?)    → Make HTTP requests
//     options: { method, headers, body, timeout }
//     returns: { status, data (string), headers }
//
//   cinder.parseHTML(html)         → Parse HTML into a queryable document
//     doc.querySelector(selector)  → CinderHTMLElement | null
//     doc.querySelectorAll(selector) → CinderHTMLElement[]
//     element.text()               → string
//     element.attr(name)           → string | undefined
//     element.html()               → string
//     element.querySelector(sel)   → CinderHTMLElement | null
//     element.querySelectorAll(sel)→ CinderHTMLElement[]
//
//   cinder.parseXML(xml)           → Same as parseHTML but for XML
//
//   cinder.store.get(key)          → Read persisted value (per-extension)
//   cinder.store.set(key, value)   → Write persisted value
//   cinder.store.delete(key)       → Delete persisted value
//
//   cinder.log(...)                → Console log (prefixed with extension name)
//   cinder.warn(...)               → Console warn
//   cinder.error(...)              → Console error
//
// Also available: JSON, console, setTimeout, parseInt, parseFloat,
//   encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
//   atob, btoa, Number, String, Array, Object, Map, Set, Promise,
//   Date, RegExp, Math, Error

class MySource {
	// ── Required Properties ─────────────────────────
	id = "my-source-id";           // Unique identifier (lowercase, dashes ok)
	name = "My Source";            // Display name
	version = "1.0.0";            // Semver version
	icon = "📚";                   // Emoji or icon URL
	description = "A short description of what this extension does";

	// Content type: "books" | "comics" | "manga" | "audiobooks"
	contentType = "books";

	// Declare what this extension can do
	capabilities = {
		search: true,              // Can search for content
		discover: false,           // Has browse/discover sections
		download: true,            // Has direct download URLs in search results
		resolve: true,             // Can resolve a search result to a download URL
		manga: false,              // Has getChapters() and getPages() for manga reading
	};

	// ── Search ──────────────────────────────────────
	// Required if capabilities.search = true
	//
	// Returns an array of SearchResult objects
	async search(query, page = 0) {
		const res = await cinder.fetch(
			`https://example.com/search?q=${encodeURIComponent(query)}&page=${page}`
		);

		// For JSON APIs:
		// const data = JSON.parse(res.data);
		// return data.results.map(item => ({ ... }));

		// For HTML scraping:
		const doc = cinder.parseHTML(res.data);
		return doc.querySelectorAll(".search-result").map(el => ({
			id: el.attr("data-id") || "",
			title: el.querySelector(".title")?.text() || "Unknown",
			author: el.querySelector(".author")?.text(),
			cover: el.querySelector("img")?.attr("src"),
			url: el.querySelector("a")?.attr("href"),          // Landing page URL
			format: "epub",                                     // epub, pdf, cbz, cbr, mobi, azw3, mp3, m4b
			size: el.querySelector(".size")?.text(),
			extra: {
				description: el.querySelector(".desc")?.text(),
			},
		}));
	}

	// ── Resolve ─────────────────────────────────────
	// Required if capabilities.resolve = true
	//
	// Takes a SearchResult and returns the actual download URL.
	// Use this for multi-step resolution (e.g., follow a landing
	// page to extract the real download link).
	async resolve(item) {
		const res = await cinder.fetch(item.url);
		const doc = cinder.parseHTML(res.data);
		const directUrl = doc.querySelector("a.download-btn")?.attr("href");

		return {
			url: directUrl,
			fileName: `${item.title}.${item.format || "epub"}`,
			headers: {},    // Optional: headers needed for the download request
			fileSize: null, // Optional: file size in bytes
		};
	}

	// ── Discover ────────────────────────────────────
	// Required if capabilities.discover = true
	//
	// Returns browse sections (e.g., "Popular", "New Releases")
	async getDiscoverSections() {
		return [
			{ id: "popular", title: "Popular", icon: "🔥" },
			{ id: "new", title: "New Releases", icon: "🆕" },
		];
	}

	// Returns items for a specific discover section
	async getDiscoverItems(sectionId, page = 0) {
		// Same return format as search()
		return [];
	}

	// ── Manga Methods ───────────────────────────────
	// Required if capabilities.manga = true

	// Returns detailed manga info
	async getMangaDetails(id) {
		return {
			id: id,
			title: "Manga Title",
			author: "Author Name",
			artist: "Artist Name",
			cover: "https://example.com/cover.jpg",
			description: "A description of this manga.",
			status: "ongoing",      // ongoing, completed, hiatus, cancelled
			genres: ["Action", "Adventure"],
		};
	}

	// Returns array of chapters for a manga
	async getChapters(mangaId) {
		return [
			{
				id: "chapter-1",
				title: "Chapter 1: The Beginning",
				chapterNumber: 1,
				volumeNumber: 1,        // Optional
				dateUploaded: "2024-01-01T00:00:00Z", // Optional ISO string
				scanlator: "Scanlation Group", // Optional
			},
		];
	}

	// Returns array of page image URLs for a chapter
	async getPages(chapterId) {
		return [
			{
				url: "https://example.com/pages/1.jpg",
				headers: {},    // Optional: headers needed to load the image (e.g., Referer)
			},
		];
	}

	// ── Settings ────────────────────────────────────
	// Optional: define user-configurable settings
	getSettings() {
		return [
			{
				id: "quality",
				label: "Image Quality",
				type: "select",
				defaultValue: "high",
				options: [
					{ label: "Low", value: "low" },
					{ label: "High", value: "high" },
				],
			},
			{
				id: "server_url",
				label: "Server URL",
				type: "text",
				defaultValue: "",
				placeholder: "https://my-server.com",
			},
		];
	}
}

// IMPORTANT: This line makes your extension available to Cinder
__cinderExport = new MySource();
