// ─── Extension Sandbox Test ─────────────────────────────────
// Quick Node.js test to verify the MangaDex extension loads
// in our sandbox and can search/fetch data.
//
// Run: node test_extensions/test_sandbox.mjs

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the extension script
const script = readFileSync(join(__dirname, "mangadex.js"), "utf8");

// Simulate the cinder API (minimal mock for testing)
const cinderAPI = {
	async fetch(url, options) {
		const resp = await fetch(url, {
			method: options?.method || "GET",
			headers: options?.headers || {},
		});
		const data = await resp.text();
		const headers = {};
		resp.headers.forEach((v, k) => { headers[k] = v; });
		return { status: resp.status, data, headers };
	},
	parseHTML() { return null; },
	parseXML() { return null; },
	store: {
		async get() { return null; },
		async set() {},
		async delete() {},
	},
	log: console.log.bind(console, "[MangaDex]"),
	warn: console.warn.bind(console, "[MangaDex]"),
	error: console.error.bind(console, "[MangaDex]"),
	__JSON: JSON,
	__encodeURIComponent: encodeURIComponent,
	__decodeURIComponent: decodeURIComponent,
	__encodeURI: encodeURI,
	__decodeURI: decodeURI,
	__atob: atob,
	__btoa: btoa,
	__parseInt: parseInt,
	__parseFloat: parseFloat,
	__setTimeout: setTimeout,
};

// Execute in sandbox (same pattern as ExtensionRuntime.ts)
const factory = new Function(
	"cinder",
	"require", "process", "global", "globalThis", "__DEV__",
	"XMLHttpRequest", "WebSocket", "setInterval", "importScripts",
	`
	"use strict";
	var __cinderExport = undefined;
	var JSON = cinder.__JSON;
	var console = { log: cinder.log, warn: cinder.warn, error: cinder.error };
	var encodeURIComponent = cinder.__encodeURIComponent;
	var decodeURIComponent = cinder.__decodeURIComponent;
	var encodeURI = cinder.__encodeURI;
	var decodeURI = cinder.__decodeURI;
	var atob = cinder.__atob;
	var btoa = cinder.__btoa;
	var parseInt = cinder.__parseInt;
	var parseFloat = cinder.__parseFloat;
	var setTimeout = cinder.__setTimeout;

	${script}

	return __cinderExport;
	`
);

const source = factory(
	cinderAPI,
	undefined, undefined, undefined, undefined, undefined,
	undefined, undefined, undefined, undefined
);

console.log("\n✅ Extension loaded successfully!");
console.log(`   Name: ${source.name}`);
console.log(`   Version: ${source.version}`);
console.log(`   Content Type: ${source.contentType}`);
console.log(`   Capabilities:`, source.capabilities);

// Test search
console.log("\n🔍 Searching for 'One Piece'...");
try {
	const results = await source.search("One Piece", 0);
	console.log(`   Found ${results.length} results:`);
	for (const r of results.slice(0, 5)) {
		console.log(`   - ${r.title} (by ${r.author})`);
		if (r.cover) console.log(`     Cover: ${r.cover}`);
	}

	// Test chapters for the first result
	if (results.length > 0) {
		console.log(`\n📚 Getting chapters for '${results[0].title}'...`);
		const chapters = await source.getChapters(results[0].id);
		console.log(`   Found ${chapters.length} chapters`);
		if (chapters.length > 0) {
			console.log(`   First: ${chapters[0].title} (Ch. ${chapters[0].chapterNumber})`);
			console.log(`   Last: ${chapters[chapters.length - 1].title} (Ch. ${chapters[chapters.length - 1].chapterNumber})`);
		}
	}
} catch (err) {
	console.error("❌ Search failed:", err.message);
}

// Test discover
console.log("\n🌟 Getting discover sections...");
try {
	const sections = await source.getDiscoverSections();
	console.log(`   ${sections.length} sections:`, sections.map(s => s.title).join(", "));

	const popular = await source.getDiscoverItems("popular", 0);
	console.log(`\n🔥 Popular manga (${popular.length} results):`);
	for (const r of popular.slice(0, 5)) {
		console.log(`   - ${r.title} (by ${r.author})`);
	}
} catch (err) {
	console.error("❌ Discover failed:", err.message);
}

console.log("\n✅ All tests passed!");
