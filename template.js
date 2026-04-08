// ─── Cinder Extension Template ────────────────────────────────
//
// This is a minimal template for creating a Cinder extension.
// It is fully documented with all available capabilities and APIs.
//
// Extensions run in an isolated JavaScript sandbox. They DO NOT
// have access to typical Node.js or browser globals. You must
// use the `cinder` object for all operations.

__cinderExport = {
	// ── Required Properties ─────────────────────────
	id: "my-source-id",           // Unique identifier (lowercase, dashes ok)
	name: "My Source",            // Display name
	version: "1.0.0",            // Semver version
	icon: "📚",                   // Emoji or icon URL
	description: "A short description of what this extension does",

	// Content type: "books" | "comics" | "manga" | "audiobooks"
	contentType: "books",

	// Declare what this extension can do
	capabilities: {
		search: true,              // Can search for content
		discover: false,           // Has browse/discover sections
		download: true,            // Has direct download URLs in search results
		resolve: true,             // Can resolve a search result to a download URL
		manga: false,              // Has getChapters() and getPages() for manga reading
	},

	// ── Search ──────────────────────────────────────
	// Required if capabilities.search = true

	async search(query, page = 0) {
		const url = `https://api.example.com/search?q=${encodeURIComponent(query)}&page=${page}`;

		// Using the cinder.fetch API
		const response = await cinder.fetch(url, {
			headers: { "User-Agent": "Cinder-Extension" },
		});

		if (response.status !== 200) {
			cinder.warn("Search failed with status", response.status);
			return [];
		}

		// Use cinder.parseHTML for scraping (jQuery-like API based on cheerio)
		const doc = cinder.parseHTML(response.data);
		const results = [];

		doc.querySelectorAll(".book-item").forEach((item) => {
			const id = item.querySelector("a")?.attr("href");
			const title = item.querySelector("h2")?.text();

			if (id && title) {
				results.push({
					id: id,
					title: title,
					author: item.querySelector(".author")?.text(),
					cover: item.querySelector("img")?.attr("src"),

					// If you have the direct download URL right away (capabilities.download = true)
					url: `https://example.com/download/${id}.epub`,
					format: "books",

					// Any additional metadata you want to display
					extra: {
						description: item.querySelector(".desc")?.text(),
						status: "completed",
					},
				});
			}
		});

		return results;
	},

	// ── Discover (Home Page) ─────────────────────────
	// Required if capabilities.discover = true

	async getDiscoverSections() {
		return [
			{ id: "popular", title: "Popular Books", icon: "🔥" },
			{ id: "new", title: "New Releases", icon: "✨" },
		];
	},

	async getDiscoverItems(sectionId, page = 0) {
		if (sectionId === "popular") {
			return await this.search("popular", page);
		}
		return []; // Return array of items same as search()
	},

	// ── Resolve Download ────────────────────────────
	// Required if capabilities.resolve = true
	// Use this if your search gives you a detail page URL, but you
	// need to do another fetch to extract the actual .epub / .cbz download URL.

	async resolve(item) {
		const response = await cinder.fetch(item.id);
		const doc = cinder.parseHTML(response.data);
		const downloadLink = doc.querySelector(".download-btn")?.attr("href");

		if (!downloadLink) throw new Error("Could not find download link");

		return {
			url: downloadLink,
			headers: {
				"Referer": item.id,
			},
		};
	},

	// ── Extension Config ────────────────────────────
	// Optional. If provided, users will see a ⚙️ icon to configure settings.

	getSettings() {
		return [
			{
				id: "api_key",
				label: "API Key",
				type: "password",
				defaultValue: "",
				placeholder: "Paste your API key here", // Optional
			},
			{
				id: "preferred_format",
				label: "Preferred Format",
				type: "select",
				defaultValue: "epub",
				options: [
					{ label: "EPUB", value: "epub" },
					{ label: "PDF", value: "pdf" },
				],
			},
			{
				id: "nsfw",
				label: "Show NSFW Content",
				type: "toggle",
				defaultValue: "false", // Must be string "true" or "false"
			},
		];
	}
};
