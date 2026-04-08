// ─── OPDS Catalog Extension for Cinder ──────────────────────
//
// Connects to any OPDS-compatible server (Komga, Kavita,
// Calibre-web, COPS, etc.) to browse and download books.
//
// OPDS is an open standard (Atom/XML feeds) used by self-hosted
// book servers. This extension lets users connect to their own
// server — 100% legal, no third-party content.
//
// This is a SAMPLE EXTENSION for testing/development.

class OPDSSource {
	constructor() {
		this.id = "opds-catalog";
		this.name = "OPDS Catalog";
		this.version = "1.0.0";
		this.icon = "📡";
		this.description = "Connect to your OPDS-compatible server (Komga, Kavita, Calibre-web, COPS)";
		this.contentType = "books";

		this.capabilities = {
			search: true,
			discover: true,
			download: true,
			resolve: false,
			manga: false,
		};
	}

	// ── Helpers ──────────────────────────────────────

	async _getServerUrl() {
		const url = await cinder.store.get("server_url");
		if (!url) throw new Error("No server URL configured. Go to extension settings.");
		return url.replace(/\/+$/, "");
	}

	async _getAuthHeaders() {
		const username = await cinder.store.get("username");
		const password = await cinder.store.get("password");
		const headers = { "Accept": "application/atom+xml, application/xml, text/xml" };
		if (username && password) {
			headers["Authorization"] = "Basic " + btoa(username + ":" + password);
		}
		return headers;
	}

	async _fetchFeed(path) {
		const baseUrl = await this._getServerUrl();
		const headers = await this._getAuthHeaders();
		const url = path.startsWith("http") ? path : baseUrl + path;

		const res = await cinder.fetch(url, { headers });
		if (res.status === 401) throw new Error("Authentication failed. Check username/password.");
		if (res.status !== 200) throw new Error(`Server returned ${res.status}`);

		return cinder.parseXML(res.data);
	}

	_parseEntry(entry) {
		const title = entry.querySelector("title")?.text() || "Unknown";
		const authorEl = entry.querySelector("author name");
		const author = authorEl ? authorEl.text() : "Unknown";
		const id = entry.querySelector("id")?.text() || "";
		const summary = entry.querySelector("summary")?.text() ||
			entry.querySelector("content")?.text() || "";

		// Find cover image
		let cover = undefined;
		const links = entry.querySelectorAll("link");
		for (const link of links) {
			const rel = link.attr("rel") || "";
			const type = link.attr("type") || "";
			if (rel.includes("image") || rel.includes("thumbnail") ||
				type.startsWith("image/")) {
				cover = link.attr("href");
				break;
			}
		}

		// Find download links
		let downloadUrl = undefined;
		let format = "epub";
		for (const link of links) {
			const rel = link.attr("rel") || "";
			const type = link.attr("type") || "";
			const href = link.attr("href") || "";

			if (rel.includes("acquisition") || type.includes("epub") ||
				type.includes("pdf") || type.includes("application/")) {
				downloadUrl = href;
				if (type.includes("epub")) format = "epub";
				else if (type.includes("pdf")) format = "pdf";
				else if (type.includes("cbz")) format = "cbz";
				else if (type.includes("mobi")) format = "mobi";
				break;
			}
		}

		// Find navigation/subsection link
		let navUrl = undefined;
		for (const link of links) {
			const rel = link.attr("rel") || "";
			const type = link.attr("type") || "";
			if (type.includes("atom") || type.includes("opds") ||
				rel === "subsection" || rel === "alternate") {
				navUrl = link.attr("href");
				break;
			}
		}

		return { title, author, id, summary, cover, downloadUrl, format, navUrl };
	}

	_makeAbsolute(url, baseUrl) {
		if (!url) return undefined;
		if (url.startsWith("http")) return url;
		if (url.startsWith("/")) return baseUrl + url;
		return baseUrl + "/" + url;
	}

	// ── Search ───────────────────────────────────────

	async search(query, page = 0) {
		const baseUrl = await this._getServerUrl();

		// OPDS search: try opensearch descriptor first, then common patterns
		const searchPaths = [
			`/opds/search?query=${encodeURIComponent(query)}`,
			`/search?query=${encodeURIComponent(query)}`,
			`/opds/search/${encodeURIComponent(query)}`,
			`/search/${encodeURIComponent(query)}`,
		];

		let doc = null;
		for (const path of searchPaths) {
			try {
				doc = await this._fetchFeed(path);
				break;
			} catch (_e) {
				continue;
			}
		}

		if (!doc) {
			cinder.warn("Could not find a working search endpoint");
			return [];
		}

		const entries = doc.querySelectorAll("entry");
		const results = [];

		for (const entry of entries) {
			const parsed = this._parseEntry(entry);
			results.push({
				id: parsed.id,
				title: parsed.title,
				author: parsed.author,
				cover: this._makeAbsolute(parsed.cover, baseUrl),
				url: this._makeAbsolute(parsed.downloadUrl, baseUrl),
				format: parsed.format,
				extra: { description: parsed.summary },
			});
		}

		return results;
	}

	// ── Discover ─────────────────────────────────────

	async getDiscoverSections() {
		try {
			const doc = await this._fetchFeed("/opds");
			const entries = doc.querySelectorAll("entry");
			const sections = [];

			for (const entry of entries) {
				const title = entry.querySelector("title")?.text();
				const id = entry.querySelector("id")?.text();
				const links = entry.querySelectorAll("link");

				let href = null;
				for (const link of links) {
					const type = link.attr("type") || "";
					if (type.includes("atom") || type.includes("opds") || type.includes("xml")) {
						href = link.attr("href");
						break;
					}
				}

				if (title && href) {
					sections.push({
						id: href, // Store the full href as the section ID
						title: title,
						icon: "📂",
					});
				}
			}

			return sections.length > 0 ? sections : [
				{ id: "/opds", title: "Root Catalog", icon: "📚" },
			];
		} catch (_e) {
			return [{ id: "/opds", title: "Root Catalog", icon: "📚" }];
		}
	}

	async getDiscoverItems(sectionId, page = 0) {
		const baseUrl = await this._getServerUrl();

		try {
			const doc = await this._fetchFeed(sectionId);
			const entries = doc.querySelectorAll("entry");
			const results = [];

			for (const entry of entries) {
				const parsed = this._parseEntry(entry);
				results.push({
					id: parsed.id,
					title: parsed.title,
					author: parsed.author,
					cover: this._makeAbsolute(parsed.cover, baseUrl),
					url: this._makeAbsolute(parsed.downloadUrl || parsed.navUrl, baseUrl),
					format: parsed.format,
					extra: { description: parsed.summary },
				});
			}

			return results;
		} catch (e) {
			cinder.error("Failed to fetch section:", e);
			return [];
		}
	}

	// ── Settings ──────────────────────────────────────

	getSettings() {
		return [
			{
				id: "server_url",
				label: "Server URL",
				type: "text",
				defaultValue: "",
				placeholder: "https://my-server.com",
			},
			{
				id: "username",
				label: "Username",
				type: "text",
				defaultValue: "",
				placeholder: "Optional",
			},
			{
				id: "password",
				label: "Password",
				type: "password",
				defaultValue: "",
				placeholder: "Optional",
			},
		];
	}
}

__cinderExport = new OPDSSource();
