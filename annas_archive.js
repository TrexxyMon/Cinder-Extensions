// Anna's Archive Direct Download Extension
//
// Device-only direct downloader for Anna's Archive.
// Uses Anna's Archive download pages from the device; no backend infrastructure.

__cinderExport = {
	id: "annas-archive-slow",
	name: "Anna's Archive",
	version: "2.1.9",
	icon: "📚",
	description: "Anna's Archive direct downloader powered entirely by your device, with no backend infrastructure.",
	contentType: "books",
	contentTypes: ["ebook"],
	excludeFromDefaultMetadataProviders: true,

	capabilities: {
		search: true,
		discover: false,
		download: false,
		resolve: true,
		searchDownloads: true,
		manga: false,
	},

	getSettings: function() {
		return [
			{
				id: "aa_supporter_key",
				label: "AA Supporter Key (Optional)",
				type: "password",
				defaultValue: "",
				placeholder: "Paste your supporter secret key",
				description: "From annas-archive.se/account. Used on-device for Anna's Archive direct download pages. Stored in device Keychain.",
			},
			{
				id: "preferred_format",
				label: "Preferred Format",
				type: "select",
				defaultValue: "epub",
				options: [
					{ label: "EPUB", value: "epub" },
					{ label: "PDF", value: "pdf" },
					{ label: "Any", value: "" },
				],
			},
			{
				id: "preferred_domain",
				label: "Preferred Domain",
				type: "select",
				defaultValue: "annas-archive.gd",
				options: [
					{ label: "annas-archive.gd", value: "annas-archive.gd" },
					{ label: "annas-archive.gs", value: "annas-archive.gs" },
					{ label: "annas-archive.se", value: "annas-archive.se" },
					{ label: "annas-archive.li", value: "annas-archive.li" },
				],
			},
			{
				id: "enable_libgen",
				label: "Try Libgen CDN First",
				type: "select",
				defaultValue: "true",
				options: [
					{ label: "Enabled", value: "true" },
					{ label: "Disabled", value: "false" },
				],
			},
			{
				id: "enable_mirror_race",
				label: "Parallel Mirror Racing",
				type: "select",
				defaultValue: "true",
				options: [
					{ label: "Enabled", value: "true" },
					{ label: "Disabled", value: "false" },
				],
			},
		];
	},

	// ── Internals ──

	_BASE_DOMAINS: [
		"annas-archive.gd",
		"annas-archive.gs",
		"annas-archive.se",
		"annas-archive.li",
	],

	_SUPPORTED_FORMATS: ["epub", "pdf"],

	// Domains to skip when filtering URLs from page text
	_JUNK_DOMAINS: [
		"annas-archive", "cloudflare", "ddos-guard", "apple.com", "google.com",
		"facebook.com", "t.me", "telegram", "github.com", "twitter.com",
		"reddit.com", "wikipedia.org", "mozilla.org", "darkreader", "motrix",
		"readera", "calibre", "printfriendly", "cloudconvert", "w3.org",
		"schema.org", "jsdelivr", "cdnjs", "matrix.to", "open-slum",
		"archivecommunication", "translate.annas", "software.annas",
		"torrentfreak", "covers.z-lib", "jdownloader",
	],

	_getBaseUrl: async function() {
		var pref = await cinder.store.get("preferred_domain");
		if (pref) return "https://" + pref;
		return "https://" + this._BASE_DOMAINS[0];
	},

	_smartFetch: async function(url) {
		try {
			var resp = await cinder.fetch(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en-US,en;q=0.5",
				},
			});

			if (resp.status === 403 || (resp.data && resp.data.indexOf("cf-challenge") !== -1) || (resp.data && resp.data.length < 500 && resp.data.indexOf("challenge") !== -1)) {
				cinder.log("[AA] Cloudflare detected, falling back to browser fetch for: " + url);
				return await cinder.fetchBrowser(url, { headers: { "X-Cinder-Suppress-Interactive": "1" } });
			}

			if (resp.status === 200 && resp.data && resp.data.length > 500) {
				return resp;
			}

			cinder.warn("[AA] Unexpected status " + resp.status + " for: " + url);
			return await cinder.fetchBrowser(url, { headers: { "X-Cinder-Suppress-Interactive": "1" } });
		} catch (err) {
			cinder.warn("[AA] fetch failed, trying browser: " + err);
			return await cinder.fetchBrowser(url, { headers: { "X-Cinder-Suppress-Interactive": "1" } });
		}
	},

	_fetchWithFallback: async function(path) {
		var pref = await cinder.store.get("preferred_domain");
		var domains = this._BASE_DOMAINS.slice();

		if (pref) {
			domains = domains.filter(function(d) { return d !== pref; });
			domains.unshift(pref);
		}

		var lastErr = null;
		for (var i = 0; i < domains.length; i++) {
			var url = "https://" + domains[i] + path;
			try {
				cinder.log("[AA] Trying: " + url);
				var resp = await this._smartFetch(url);
				if (resp.status === 200 && resp.data && resp.data.length > 500) {
					return resp;
				}
				cinder.warn("[AA] " + domains[i] + " returned status " + resp.status);
			} catch (err) {
				cinder.warn("[AA] " + domains[i] + " failed: " + err);
				lastErr = err;
			}
		}
		throw lastErr || new Error("All domains failed for path: " + path);
	},

	// Check if a URL is a junk/social link
	_isJunkUrl: function(url) {
		var lower = url.toLowerCase();
		for (var i = 0; i < this._JUNK_DOMAINS.length; i++) {
			if (lower.indexOf(this._JUNK_DOMAINS[i]) !== -1) return true;
		}
		return false;
	},

	_decodeHtml: function(value) {
		return String(value || "")
			.replace(/&nbsp;/gi, " ")
			.replace(/&amp;/gi, "&")
			.replace(/&quot;/gi, '"')
			.replace(/&#39;|&apos;/gi, "'")
			.replace(/&lt;/gi, "<")
			.replace(/&gt;/gi, ">");
	},

	_extractResultAuthor: function(rawBlock) {
		var raw = String(rawBlock || "");
		var match = raw.match(/<a[^>]+href="\/search\?q=[^"]+"[^>]*>\s*<span[^>]*icon-\[mdi--user-edit\][\s\S]*?<\/span>\s*([\s\S]*?)<\/a>/i);
		if (!match) {
			match = raw.match(/<div[^>]*text-amber-900[^>]*data-content="([^"]+)"/i)
				|| raw.match(/<div[^>]*data-content="([^"]+)"[^>]*text-amber-900/i);
		}
		if (!match) return "";
		return this._decodeHtml(match[1].replace(/<[^>]+>/g, " "))
			.replace(/\s+/g, " ")
			.trim();
	},

	_cleanHtmlText: function(value) {
		return this._decodeHtml(String(value || "").replace(/<[^>]+>/g, " "))
			.replace(/\s+/g, " ")
			.trim();
	},

	_cleanResultTitle: function(value) {
		return this._cleanHtmlText(value)
			.replace(/\b(epub|pdf|mobi|azw3|cbz|cbr|fb2|djvu)\b/gi, "")
			.replace(/\d+\.?\d*\s*[KMG]B/gi, "")
			.replace(/\s+/g, " ")
			.trim();
	},

	_extractResultFileMeta: function(rawBlock) {
		var cleanText = this._cleanHtmlText(rawBlock);
		var formatMatch = cleanText.match(/\b(epub|pdf|mobi|azw3|cbz|cbr|fb2|djvu)\b/i);
		var sizeMatch = cleanText.match(/(\d+\.?\d*\s*[KMGi]i?B)/i);
		return {
			format: formatMatch ? formatMatch[1].toLowerCase() : "",
			size: sizeMatch ? sizeMatch[1].replace(/\s+/g, "") : "",
		};
	},

	_extractNearbyCover: function(html, anchorIndex) {
		var start = Math.max(0, anchorIndex - 2200);
		var before = html.substring(start, anchorIndex);
		var matches = before.match(/<img[^>]+src="([^"]+)"/gi);
		if (!matches || matches.length === 0) return "";
		var last = matches[matches.length - 1].match(/src="([^"]+)"/i);
		return last && last[1] ? this._decodeHtml(last[1]) : "";
	},

	_parseSearchResultsFromHtml: function(html) {
		var results = [];
		var seen = {};
		var titleLinkRe = /<a href="\/md5\/([a-f0-9]+)"[^>]*font-semibold[^>]*>([\s\S]*?)<\/a>/gi;
		var match;
		while ((match = titleLinkRe.exec(html)) && results.length < 100) {
			var md5 = match[1];
			if (!md5 || seen[md5]) continue;
			seen[md5] = true;

			var rawBlock = html.substring(match.index, Math.min(html.length, match.index + 4000));
			var title = this._cleanResultTitle(match[2]);
			if (!title) continue;

			var meta = this._extractResultFileMeta(rawBlock);
			if (meta.format && this._SUPPORTED_FORMATS.indexOf(meta.format) === -1) continue;

			results.push({
				id: md5,
				title: title,
				author: this._extractResultAuthor(rawBlock),
				cover: this._extractNearbyCover(html, match.index),
				format: meta.format || "epub",
				size: meta.size,
				url: md5,
				source: "Anna's Archive",
			});
		}
		return results;
	},

	// ── Search ──

	search: async function(query, page) {
		if (!page) page = 0;

		var format = await cinder.store.get("preferred_format");
		var extParam = format ? "&ext=" + format : "";
		var searchPath = "/search?q=" + encodeURIComponent(query) + extParam
			+ "&page=" + (page + 1) + "&sort=&lang=en";

		var resp = await this._fetchWithFallback(searchPath);
		var parsedResults = this._parseSearchResultsFromHtml(resp.data);
		if (parsedResults.length > 0) {
			cinder.log("[AA] Parsed " + parsedResults.length + " results from result cards (epub/pdf only)");
			return parsedResults;
		}

		var doc = cinder.parseHTML(resp.data);
		var results = [];

		var items = doc.querySelectorAll("a[href*='/md5/']");
		cinder.log("[AA] Found " + items.length + " result links");

		for (var i = 0; i < items.length; i++) {
			try {
				var link = items[i];
				var href = link.attr("href") || "";
				if (!href || href.indexOf("/md5/") === -1) continue;

				var md5Match = href.match(/\/md5\/([a-f0-9]+)/i);
				if (!md5Match) continue;
				var md5 = md5Match[1];

				var fullText = link.text() || "";
				var lines = fullText.split("\n").map(function(l) { return l.trim(); }).filter(function(l) { return l; });

				var title = "";
				var author = "";
				var fileFormat = "";
				var size = "";

				var titleLinkStr = '<a href="/md5/' + md5 + '"';
				var idx = resp.data.indexOf(titleLinkStr);
				idx = resp.data.indexOf(titleLinkStr, idx + 10);
				
				if (idx !== -1) {
					var rawBlock = resp.data.substring(idx, idx + 4000);
					var cleanText = rawBlock.replace(/<[^>]+>/g, ' ');
					var authorCandidate = this._extractResultAuthor(rawBlock);
					if (authorCandidate) author = authorCandidate;
					
					var metaLineMatch = cleanText.match(/([^\n·]+·[^\n·]+·[^\n·]*(?:MB|KB|GB|KiB|MiB)[^\n]*)/i);
					var searchTarget = metaLineMatch ? metaLineMatch[1] : cleanText;

					var formatMatch = searchTarget.match(/\b(epub|pdf|mobi|azw3|cbz|cbr|fb2|djvu)\b/i);
					if (formatMatch) fileFormat = formatMatch[1].toLowerCase();
					
					var sizeMatch = searchTarget.match(/(\d+\.?\d*\s*[KMGi]i?B)/i);
					if (sizeMatch) size = sizeMatch[1].replace(/\s+/g, "");
				}

				if (lines.length > 0) title = lines[0];
				title = this._cleanResultTitle(title);
				if (!author && lines.length > 1) author = lines[1];

				var coverImg = link.querySelector("img");
				var cover = coverImg ? (coverImg.attr("src") || "") : "";

				if (title) {
					var supported = this._SUPPORTED_FORMATS;
					if (fileFormat && supported.indexOf(fileFormat) === -1) continue;
					results.push({
						id: md5,
						title: title,
						author: author,
						cover: cover,
						format: fileFormat || "epub",
						size: size,
						url: md5,
						source: "Anna's Archive",
					});
				}
			} catch (parseErr) {
				cinder.warn("[AA] Failed to parse result " + i + ": " + parseErr);
			}
		}

		cinder.log("[AA] Parsed " + results.length + " results (epub/pdf only)");
		return results;
	},

	// ═══════════════════════════════════════════════════════════
	// ── Resolve: device-only direct downloader ──
	// ═══════════════════════════════════════════════════════════

	resolve: async function(item) {
		var md5 = item.url || item.id;
		cinder.log("[AA] Resolving md5: " + md5);

		var debridLink = "https://annas-archive.gl/md5/" + md5;

		// ── Strategy 1: AA Supporter Key (fast_download) ──
		try {
			var supporterKey = await cinder.secureStore.get("aa_supporter_key");
			if (supporterKey && supporterKey.trim()) {
				supporterKey = supporterKey.trim();
				cinder.log("[AA] 🔑 Trying fast_download with supporter key...");
				var baseUrl = await this._getBaseUrl();

				var fastUrl = baseUrl + "/fast_download/" + md5 + "/0/2?secret=" + encodeURIComponent(supporterKey);
				var fastResp = await this._smartFetch(fastUrl);

				if (fastResp.status === 200 && fastResp.data && fastResp.data.length > 500) {
					var downloadUrl = this._extractDownloadUrl(fastResp.data);
					if (downloadUrl) {
						cinder.log("[AA] 🚀 Supporter download resolved: " + downloadUrl.substring(0, 80));
						return {
							url: downloadUrl,
							headers: {
								"Referer": fastUrl,
								"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
							},
						};
					}
				}
				cinder.warn("[AA] Supporter download failed (status " + fastResp.status + "), falling through");
			}
		} catch (fastErr) {
			cinder.warn("[AA] Supporter download error: " + fastErr);
		}

		// ── Strategy 2+3: Libgen CDN + Detail Page IN PARALLEL ──
		// Don't wait for Libgen to fail before loading the detail page.
		// Fire both at once and use whichever resolves first.
		var enableLibgen = await cinder.store.get("enable_libgen");
		var baseUrl = await this._getBaseUrl();

		var libgenPromise = (enableLibgen !== "false")
			? this._tryLibgenCDN(md5).catch(function() { return null; })
			: Promise.resolve(null);

		var detailPromise = this._fetchWithFallback("/md5/" + md5).catch(function() { return null; });

		// Race: if Libgen CDN wins fast, we skip detail page entirely
		var libgenResult = null;
		var detailResp = null;

		try {
			// Give Libgen a 4s head start race against detail page
			libgenResult = await Promise.race([
				libgenPromise,
				new Promise(function(resolve) { setTimeout(function() { resolve(null); }, 4000); }),
			]);
		} catch (e) {
			libgenResult = null;
		}

		if (libgenResult) {
			cinder.log("[AA] 🚀 Libgen CDN resolved in <4s: " + libgenResult.substring(0, 80));
			return {
				url: libgenResult,
				headers: {
					"Referer": "https://library.lol/",
					"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
				},
			};
		}

		// Libgen didn't win the race — wait for detail page (it was already loading in parallel)
		cinder.log("[AA] Libgen CDN didn't win race, waiting for detail page...");
		detailResp = await detailPromise;

		// Meanwhile, Libgen might still finish — keep its promise alive
		// We'll check it again after parsing the detail page
		var pendingLibgen = libgenPromise;

		// Parse slow download links from detail page
		var slowLinks = [];
		if (detailResp && detailResp.data) {
			var detailDoc = cinder.parseHTML(detailResp.data);
			var allLinks = detailDoc.querySelectorAll("a[href*='/slow_download/']");
			for (var i = 0; i < allLinks.length; i++) {
				var href = allLinks[i].attr("href");
				if (href) slowLinks.push(href);
			}
		}
		cinder.log("[AA] Found " + slowLinks.length + " slow download links");

		if (slowLinks.length === 0) {
			for (var idx = 0; idx < 8; idx++) {
				slowLinks.push("/slow_download/" + md5 + "/0/" + idx);
			}
		}

		// Order: HTTPS anchors (6,8) first, then copy-paste (5,7), then waitlist (0-4)
		var httpsAnchors = [];
		var copyPaste = [];
		var waitlist = [];
		for (var j = 0; j < slowLinks.length; j++) {
			var indexMatch = slowLinks[j].match(/\/(\d+)$/);
			var linkIndex = indexMatch ? parseInt(indexMatch[1]) : j;
			if (linkIndex === 6 || linkIndex === 8) {
				httpsAnchors.push(slowLinks[j]);
			} else if (linkIndex === 5 || linkIndex === 7) {
				copyPaste.push(slowLinks[j]);
			} else {
				waitlist.push(slowLinks[j]);
			}
		}
		var orderedLinks = httpsAnchors.concat(copyPaste).concat(waitlist);

		// ── Strategy 3: Parallel Mirror Race (REAL first-one-wins) ──
		var enableRace = await cinder.store.get("enable_mirror_race");
		if (enableRace !== "false" && httpsAnchors.length >= 1) {
			try {
				cinder.log("[AA] Racing " + httpsAnchors.length + " HTTPS mirrors + pending Libgen...");
				var raceResult = await this._raceMirrors(httpsAnchors, baseUrl, pendingLibgen);
				if (raceResult) {
					cinder.log("[AA] 🚀 Race winner: " + raceResult.url.substring(0, 80));
					return {
						url: raceResult.url,
						headers: {
							"Referer": raceResult.referer || "https://annas-archive.gd/",
							"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
						},
					};
				}
			} catch (raceErr) {
				cinder.warn("[AA] Mirror race failed: " + raceErr);
			}
		}

		// ── Strategy 4: Sequential Slow Download (fallback) ──
		cinder.log("[AA] 🐢 Sequential fallback with " + orderedLinks.length + " links...");
		var lastError = null;

		for (var k = 0; k < Math.min(orderedLinks.length, 4); k++) {
			try {
				var slowPath = orderedLinks[k];
				var slowUrl = slowPath.indexOf("http") === 0 ? slowPath : baseUrl + slowPath;
				cinder.log("[AA] Trying link " + (k+1) + ": " + slowUrl);

				// Try fast fetch first, fall back to browser only if CF blocks
				var slowResp = null;
				try {
					slowResp = await cinder.fetch(slowUrl, {
						headers: {
							"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
							"Accept": "text/html,application/xhtml+xml",
						},
						timeout: 6000,
					});
					if (slowResp.status === 403 || !slowResp.data || slowResp.data.length < 500 ||
						(slowResp.data.indexOf("cf-challenge") !== -1)) {
						cinder.log("[AA] CF blocked on fetch, trying browser...");
						slowResp = await cinder.fetchBrowser(slowUrl, { headers: { "X-Cinder-Suppress-Interactive": "1" } });
					}
				} catch (fetchErr) {
					slowResp = await cinder.fetchBrowser(slowUrl, { headers: { "X-Cinder-Suppress-Interactive": "1" } });
				}

				if (!slowResp || !slowResp.data || slowResp.data.length < 200) continue;
				if (slowResp.data.indexOf("DDoS-Guard") !== -1 && slowResp.data.indexOf("Download") === -1) continue;

				var downloadUrl = this._extractDownloadUrl(slowResp.data);
				if (!downloadUrl) continue;

				// Validate
				if (downloadUrl.indexOf("http://") === 0) continue;
				var decodedUrl = decodeURIComponent(downloadUrl).toLowerCase();
				var extMatch = decodedUrl.match(/\.(epub|pdf|fb2|mobi|azw3?|djvu|cbz|cbr|txt)(?:\?|$)/);
				if (extMatch && this._SUPPORTED_FORMATS.indexOf(extMatch[1]) === -1) continue;

				cinder.log("[AA] ✅ Resolved: " + downloadUrl);
				return {
					url: downloadUrl,
					headers: {
						"Referer": slowUrl,
						"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
					},
				};
			} catch (err) {
				cinder.warn("[AA] Link " + (k+1) + " failed: " + err);
				lastError = err;
			}
		}

		throw lastError || new Error("Could not resolve download. The book may not have free download mirrors available.");
	},

	// ═══════════════════════════════════════════════════════════
	// ── Strategy Helpers ──
	// ═══════════════════════════════════════════════════════════

	/**
	 * Strategy 2: Try Libgen CDN using the MD5 hash.
	 * Returns the direct download URL or null.
	 * NO PROBE — just return the URL; DownloadManager validates during download.
	 */
	_tryLibgenCDN: async function(md5) {
		// Library.lol serves as a redirect page with the actual download link
		var libUrl = "https://library.lol/main/" + md5;
		try {
			var resp = await cinder.fetch(libUrl, {
				headers: {
					"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
					"Accept": "text/html",
				},
				timeout: 6000,
			});

			if (resp.status === 200 && resp.data && resp.data.length > 200) {
				// Library.lol page has a download link like: <a href="https://download.library.lol/main/...">
				var dlMatch = resp.data.match(/href="(https?:\/\/download\.library\.lol\/[^"]+)"/i);
				if (dlMatch && dlMatch[1]) {
					cinder.log("[AA] Libgen CDN URL found (no probe): " + dlMatch[1].substring(0, 60));
					return dlMatch[1];
				}

				// Also try cloudflare-ipfs or other CDN links on the page
				var cdnMatch = resp.data.match(/href="(https?:\/\/[^"]*(?:cloudflare-ipfs|ipfs\.io|pinata)[^"]+)"/i);
				if (cdnMatch && cdnMatch[1]) {
					cinder.log("[AA] Found IPFS CDN link: " + cdnMatch[1].substring(0, 60));
					return cdnMatch[1];
				}
			}
		} catch (err) {
			cinder.warn("[AA] Library.lol fetch failed: " + err);
		}

		// Try libgen.li as alternate
		try {
			var altUrl = "https://libgen.li/ads.php?md5=" + md5;
			var altResp = await cinder.fetch(altUrl, {
				headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" },
				timeout: 5000,
			});
			if (altResp.status === 200 && altResp.data) {
				var altMatch = altResp.data.match(/href="(https?:\/\/[^"]*(?:get|download)[^"]+)"/i);
				if (altMatch && altMatch[1] && altMatch[1].indexOf("libgen") !== -1) {
					return altMatch[1];
				}
			}
		} catch (err2) {
			cinder.warn("[AA] libgen.li fallback failed: " + err2);
		}

		return null;
	},

	/**
	 * Strategy 3: Race multiple slow download mirrors + pending Libgen.
	 * Uses REAL first-one-wins: resolves the instant ANY mirror returns a download URL.
	 */
	_raceMirrors: async function(mirrorPaths, baseUrl, pendingLibgen) {
		var self = this;

		// Build an array of race entries
		var entries = [];

		// Include pending Libgen result if still in flight
		if (pendingLibgen) {
			entries.push(
				pendingLibgen.then(function(libgenUrl) {
					if (libgenUrl) {
						cinder.log("[AA] 🏆 Libgen CDN finished during race!");
						return { url: libgenUrl, referer: "https://library.lol/" };
					}
					return null;
				}).catch(function() { return null; })
			);
		}

		// Add mirror entries — try fetch first, fetchBrowser as fallback
		for (var i = 0; i < mirrorPaths.length; i++) {
			(function(path, index) {
				var slowUrl = path.indexOf("http") === 0 ? path : baseUrl + path;
				entries.push(
					(async function() {
						var resp = null;
						// Try fast fetch first
						try {
							resp = await cinder.fetch(slowUrl, {
								headers: {
									"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
									"Accept": "text/html,application/xhtml+xml",
								},
								timeout: 6000,
							});
							if (resp.status === 403 || !resp.data || resp.data.length < 500 ||
								(resp.data.indexOf("cf-challenge") !== -1)) {
								resp = await cinder.fetchBrowser(slowUrl, { headers: { "X-Cinder-Suppress-Interactive": "1" } });
							}
						} catch (e) {
							resp = await cinder.fetchBrowser(slowUrl, { headers: { "X-Cinder-Suppress-Interactive": "1" } });
						}

						if (!resp || !resp.data || resp.data.length < 200) return null;
						if (resp.data.indexOf("DDoS-Guard") !== -1 && resp.data.indexOf("Download") === -1) return null;

						var downloadUrl = self._extractDownloadUrl(resp.data);
						if (!downloadUrl) return null;
						if (downloadUrl.indexOf("http://") === 0) return null;

						var decoded = decodeURIComponent(downloadUrl).toLowerCase();
						var extMatch = decoded.match(/\.(epub|pdf|fb2|mobi|azw3?|djvu|cbz|cbr|txt)(?:\?|$)/);
						if (extMatch && self._SUPPORTED_FORMATS.indexOf(extMatch[1]) === -1) return null;

						cinder.log("[AA] 🏆 Mirror " + (index + 1) + " won!");
						return { url: downloadUrl, referer: slowUrl };
					})().catch(function(err) {
						cinder.warn("[AA] Mirror " + (index + 1) + " failed: " + err);
						return null;
					})
				);
			})(mirrorPaths[i], i);
		}

		// REAL first-one-wins: resolve as soon as ANY entry returns non-null
		return new Promise(function(resolve) {
			var settled = false;
			var remaining = entries.length;

			entries.forEach(function(p) {
				p.then(function(result) {
					if (result && !settled) {
						settled = true;
						resolve(result);
					}
					remaining--;
					if (remaining === 0 && !settled) {
						resolve(null);
					}
				}).catch(function() {
					remaining--;
					if (remaining === 0 && !settled) {
						resolve(null);
					}
				});
			});

			// Safety timeout — don't wait forever
			setTimeout(function() {
				if (!settled) {
					settled = true;
					resolve(null);
				}
			}, 15000);
		});
	},

	/**
	 * Extract a download URL from an AA slow_download or fast_download HTML page.
	 * Consolidates all extraction strategies into one reusable function.
	 */
	_extractDownloadUrl: function(html) {
		var downloadUrl = null;

		// Strategy 0: Regex for "Download now" anchor (most reliable)
		var dnMatch = html.match(/href="(https?:\/\/[^"]+)"[^>]*>[^<]*Download now/i);
		if (dnMatch && dnMatch[1] && dnMatch[1].indexOf("annas-archive") === -1) {
			downloadUrl = dnMatch[1];
			cinder.log("[AA] Found via 'Download now' regex");
			return downloadUrl;
		}

		// Strategy 0.5: clipboard.writeText URL extraction
		var clipMatches = html.match(/clipboard\.writeText\(['"]([^'"]+)['"]\)/g);
		if (clipMatches) {
			var httpsClip = null;
			var httpClip = null;
			for (var cm = 0; cm < clipMatches.length; cm++) {
				var clipInner = clipMatches[cm].match(/clipboard\.writeText\(['"]([^'"]+)['"]\)/);
				if (clipInner && clipInner[1] && clipInner[1].match(/^https?:\/\//)) {
					var clipUrl = clipInner[1];
					if (clipUrl.indexOf("annas-archive") !== -1) continue;
					if (clipUrl.indexOf("https://") === 0 && !httpsClip) {
						httpsClip = clipUrl;
					} else if (!httpClip) {
						httpClip = clipUrl;
					}
				}
			}
			downloadUrl = httpsClip || httpClip || null;
			if (downloadUrl) {
				cinder.log("[AA] Found via clipboard (" + (httpsClip ? "HTTPS" : "HTTP") + ")");
				return downloadUrl;
			}
		}

		// Strategy 1: DOM-parsed "Download now" anchor
		var doc = cinder.parseHTML(html);
		var allAnchors = doc.querySelectorAll("a");
		for (var a = 0; a < allAnchors.length; a++) {
			var anchorText = allAnchors[a].text() || "";
			var anchorHref = allAnchors[a].attr("href") || "";
			if (anchorText.indexOf("Download now") !== -1 && anchorHref.indexOf("http") === 0) {
				if (anchorHref.indexOf("annas-archive") === -1) {
					cinder.log("[AA] Found via DOM anchor");
					return anchorHref;
				}
			}
		}

		// Strategy 2: Bare URLs in page text (partner download links)
		var urlMatches = html.match(/https?:\/\/[a-z0-9.-]+(:\d+)?\/[^\s<>"']+/gi);
		if (urlMatches) {
			var self = this;
			for (var u = 0; u < urlMatches.length; u++) {
				var candidate = urlMatches[u];
				if (self._isJunkUrl(candidate)) continue;
				if (candidate.indexOf("#") === 0) continue;
				var candidateLower = candidate.toLowerCase();
				if (candidateLower.indexOf(".epub") !== -1 || candidateLower.indexOf(".pdf") !== -1 ||
					candidateLower.indexOf("/d3/") !== -1 || candidateLower.indexOf("/download") !== -1) {
					cinder.log("[AA] Found via URL scan");
					return candidate;
				}
			}
		}

		return null;
	},
};



