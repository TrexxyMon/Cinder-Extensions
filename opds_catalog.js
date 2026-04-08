// ─── OPDS Catalog Extension for Cinder ──────────────────────
//
// Connects to any OPDS-compatible book/comic server, such as:
// Komga, Kavita, Calibre-web, COPS, Ubooquity, etc.
// Requires authenticating via your Cinder Extension Settings.
//
// This is a SAMPLE EXTENSION for testing/development.

__cinderExport = {
	id: "opds-catalog",
	name: "OPDS Catalog",
	version: "1.0.3",
	icon: "🌐",
	description: "Connect to your OPDS-compatible server (Komga, Kavita, Calibre-web, COPS)",
	contentType: "books",

	capabilities: {
		search: true,
		discover: true,
		download: true,
		resolve: false,
		manga: false,
	},

	// ── Helpers ──────────────────────────────────────

	async _fetchOPDS(url) {
		const defs = this.getSettings();
		const settings = {};
		for (const def of defs) {
			const val = await cinder.store.get(def.id);
			settings[def.id] = val ?? def.defaultValue;
		}

		const headers = { "Accept": "application/atom+xml, application/xml" };

		if (settings.username && settings.password) {
			const auth = btoa(`${settings.username}:${settings.password}`);
			headers["Authorization"] = `Basic ${auth}`;
		}

		if (!url) {
			url = settings.server_url;
			if (!url) return null; // Signal "not configured" without throwing
		}

		const res = await cinder.fetch(url, { headers });
		if (res.status === 401) throw new Error("Authentication failed. Check your username/password.");
		if (res.status !== 200) throw new Error(`Server returned status ${res.status}`);

		return cinder.parseXML(res.data);
	},

	_parseEntry(entryParams, baseUrl) {
		const entry = Array.isArray(entryParams) ? entryParams[0] : entryParams;
		if (!entry) return null;

		const title = entry.querySelector("title")?.text() || "Untitled";
		const id = entry.querySelector("id")?.text() || title;
		const author = entry.querySelector("author > name")?.text() || "Unknown Author";
		const description = entry.querySelector("content")?.text() || entry.querySelector("summary")?.text() || "";

		// Find cover
		let cover;
		const coverLinks = entry.querySelectorAll("link[rel*='thumbnail'], link[rel*='image']");
		if (coverLinks.length > 0) {
			const href = coverLinks[0].attr("href");
			if (href) cover = new URL(href, baseUrl).toString();
		}

		// Find download (ePub preference)
		let downloadUrl;
		const acqLinks = entry.querySelectorAll("link[rel*='acquisition']");
		let bestLink = null;

		for (const link of acqLinks) {
			const type = link.attr("type") || "";
			if (type.includes("epub")) {
				bestLink = link.attr("href");
				break;
			}
			if (!bestLink) bestLink = link.attr("href");
		}

		if (bestLink) {
			downloadUrl = new URL(bestLink, baseUrl).toString();
		}

		let format = "books";
		if (downloadUrl) {
			if (downloadUrl.toLowerCase().includes(".cbz") || downloadUrl.toLowerCase().includes(".cbr")) {
				format = "comics";
			} else if (downloadUrl.toLowerCase().includes(".epub")) {
				format = "books";
			}
		}

		return {
			id,
			title,
			author,
			cover,
			url: downloadUrl || id,
			format,
			extra: { description },
		};
	},

	// ── Discover ─────────────────────────────────────

	async getDiscoverSections() {
		return [
			{ id: "root", title: "Catalog Root", icon: "📁" }
		];
	},

	async getDiscoverItems(sectionId, page = 0) {
		const xml = await this._fetchOPDS(null);
		const items = [];

		const navigationLinks = xml.querySelectorAll("link[type*='navigation']");
		const acquisitionLinks = xml.querySelectorAll("entry");

		for (const link of navigationLinks) {
			const title = link.attr("title") || "Folder";
			const href = link.attr("href");
			if (!href) continue;

			items.push({
				id: href,
				title,
				author: "Folder",
				url: href,
				format: "books",
			});
		}

		const baseUrl = await cinder.store.get("server_url");

		for (const entry of acquisitionLinks) {
			const parsed = this._parseEntry(entry, baseUrl);
			if (parsed) items.push(parsed);
		}

		return items;
	},

	// ── Search ───────────────────────────────────────

	async search(query, page = 0) {
		const rootXml = await this._fetchOPDS(null);
		if (!rootXml) return []; // Server URL not configured — skip silently
		const searchLink = rootXml.querySelector("link[rel='search'][type='application/atom+xml']");

		let searchUrl;
		const baseUrl = await cinder.store.get("server_url");

		if (searchLink) {
			const href = searchLink.attr("href");
			searchUrl = new URL(href, baseUrl).toString();
		} else {
			searchUrl = `${baseUrl}?search=${encodeURIComponent(query)}`;
		}

		searchUrl = searchUrl.replace("{searchTerms}", encodeURIComponent(query));

		const xml = await this._fetchOPDS(searchUrl);
		const items = [];
		const entries = xml.querySelectorAll("entry");

		for (const entry of entries) {
			const parsed = this._parseEntry(entry, baseUrl);
			if (parsed) items.push(parsed);
		}

		return items;
	},

	// ── Download ─────────────────────────────────────

	async resolve(item) {
		const defs = this.getSettings();
		const settings = {};
		for (const def of defs) {
			const val = await cinder.store.get(def.id);
			settings[def.id] = val ?? def.defaultValue;
		}

		const headers = {};

		if (settings.username && settings.password) {
			const auth = btoa(`${settings.username}:${settings.password}`);
			headers["Authorization"] = `Basic ${auth}`;
		}

		return {
			url: item.url,
			headers,
		};
	},

	// ── Settings ──────────────────────────────────────

	getSettings() {
		return [
			{
				id: "server_url",
				label: "OPDS Server URL",
				type: "text",
				placeholder: "https://komga.my-server.com/opds/v1.2",
				defaultValue: "",
			},
			{
				id: "username",
				label: "Username",
				type: "text",
				placeholder: "admin",
				defaultValue: "",
			},
			{
				id: "password",
				label: "Password",
				type: "password",
				placeholder: "••••••••",
				defaultValue: "",
			},
		];
	}
};
