const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function loadSource(id, fetch, extra = {}) {
	const cinder = {
		fetch,
		normalizeText: (value) => String(value || ""),
		store: { get: async () => undefined },
		parseHTML: () => ({ querySelector: () => null, querySelectorAll: () => [] }),
		log() {}, warn() {},
		...extra,
	};
	const context = vm.createContext({ cinder, setTimeout: (fn) => queueMicrotask(fn) });
	vm.runInContext(readFileSync(path.join(__dirname, "..", id + ".js"), "utf8"), context);
	return context.__cinderExport;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const md5 = "0123456789abcdef0123456789abcdef";
const otherMd5 = "fedcba9876543210fedcba9876543210";
const detailUrl = "https://libgen.li/edition.php?id=100";
const adsUrl = "https://libgen.li/ads.php?md5=" + md5;
const directUrl = "https://libgen.li/get.php?md5=" + md5 + "&key=test-key";
const libgenItem = Object.freeze({
	id: "fixture-table-" + md5 + "-epub", title: "Test Book", format: "epub",
	url: detailUrl, extra: Object.freeze({ directUrl: adsUrl, md5 }),
});

test("LibGen sends the detail Referer to its otherwise-empty download landing page", async () => {
	const calls = [];
	const source = loadSource("libgen", async (url, options) => {
		calls.push({ url, options });
		return { status: 200, data: options.headers.Referer === detailUrl
			? '<a href="' + directUrl + '">GET</a>' : "" };
	});
	assert.deepEqual(plain(await source.resolve(libgenItem)), {
		url: directUrl, fileName: "Test Book.epub", headers: { Referer: adsUrl },
	});
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, adsUrl);
	assert.equal(calls[0].options.headers.Referer, detailUrl);
});

test("LibGen preserves Referer through a transient failure and nested download page", async () => {
	const nested = "https://libgen.li/file.php?id=200";
	const calls = [];
	const source = loadSource("libgen", async (url, options) => {
		calls.push([url, options.headers.Referer]);
		if (calls.length === 1) return { status: 503, data: "busy" };
		return { status: 200, data: url === adsUrl
			? '<a href="' + nested + '">File</a>' : '<a href="' + directUrl + '">GET</a>' };
	});
	assert.equal((await source.resolve(libgenItem)).url, directUrl);
	assert.deepEqual(calls, [[adsUrl, detailUrl], [adsUrl, detailUrl], [nested, adsUrl]]);
});

test("LibGen does not choose another file hash when resolving a saved result", async () => {
	const wrong = directUrl.replace(md5, otherMd5);
	const source = loadSource("libgen", async () => ({ status: 200, data: '<a href="' + wrong + '">GET</a>' }));
	await assert.rejects(source._resolveHtmlDownloadPage(libgenItem, adsUrl, detailUrl, md5), /did not expose/);
});

test("LibGen keeps the existing direct URL and supported-format contract", async () => {
	const source = loadSource("libgen", async () => { throw Error("No fetch expected"); });
	const item = { ...libgenItem, extra: { directUrl: "https://files.example.com/book.epub" } };
	assert.equal((await source.resolve(item)).url, item.extra.directUrl);
	await assert.rejects(source.resolve({ ...item, format: "exe" }), /supported/);
});

test("LibGen search requests do not invent a referring page", async () => {
	const source = loadSource("libgen", async (_url, options) => {
		assert.equal(options.headers.Referer, undefined);
		return { status: 200, data: "search" };
	});
	assert.equal(await source._fetchHtml("https://libgen.li/index.php?req=test"), "search");
});

const filename = "Test_Book.epub";
const endpoint = "https://readrobe.com/fetching-ebook-php";
const pageUrl = "https://readrobe.com/authors/test/book/";
const form = Object.freeze({ endpoint, requestId: "srv3", fileName: filename, format: "epub" });
const refreshUrl = "download.php?filename=" + filename + "&token=test-session-token";
const response = (headers = {}, status = 200) => ({
	status, data: "<html>Preparing your file</html>",
	headers: { Refresh: "3; url=" + refreshUrl, "Set-Cookie": "PHPSESSID=test-session; Path=/; HttpOnly", ...headers },
});

test("OceanOfPDF mirror resolves Refresh plus cookie using only legacy fetch and headers", async () => {
	const calls = [];
	const source = loadSource("oceanofpdf", async (url, options) => { calls.push({ url, options }); return response(); });
	const result = await source._resolveMirrorForm(form, pageUrl);
	assert.deepEqual(plain(result), {
		url: "https://readrobe.com/" + refreshUrl, fileName: filename,
		headers: { Referer: endpoint, Cookie: "PHPSESSID=test-session" },
	});
	assert.equal(result.downloadRequest, undefined);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, endpoint);
	assert.equal(calls[0].options.method, "POST");
	assert.equal(calls[0].options.headers.Referer, pageUrl);
	assert.equal(calls[0].options.headers["Content-Type"], "application/x-www-form-urlencoded");
	assert.equal(calls[0].options.body, "id=srv3&filename=Test_Book.epub");
});

test("OceanOfPDF handles encoded filenames and quoted, case-insensitive Refresh headers", async () => {
	const name = "A & B + Café.pdf";
	const target = "https://readrobe.com/download.php?filename=" + encodeURIComponent(name) + "&token=example";
	const source = loadSource("oceanofpdf", async (_url, options) => {
		assert.equal(options.body, "id=srv3&filename=" + encodeURIComponent(name));
		return { status: 200, headers: { rEfReSh: '3; URL="' + target + '"' } };
	}, { resolveUrl: (url, base) => new URL(url, base).href });
	assert.equal((await source._resolveMirrorForm({ ...form, fileName: name }, pageUrl)).url, target);
});

test("OceanOfPDF extracts cookies without forwarding Expires or other attributes", () => {
	const source = loadSource("oceanofpdf", async () => response());
	assert.equal(source._downloadCookies({ "SET-COOKIE":
		"PHPSESSID=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/; HttpOnly, cf_clearance=xyz; Secure" }),
		"PHPSESSID=abc; cf_clearance=xyz");
	assert.equal(source._downloadCookies({ "set-cookie": ["PHPSESSID=abc; Path=/", "other=def; Secure"] }), "PHPSESSID=abc; other=def");
	assert.equal(source._downloadCookies({ "set-cookie": "PHPSESSID=abc\r\nInjected: value" }), "");
	assert.equal(source._downloadCookies({}), "");
});

for (const [label, target] of [
	["another host", "https://other.example/download.php?filename=Test_Book.epub&token=x"],
	["protocol-relative host", "//other.example/download.php?filename=Test_Book.epub&token=x"],
	["insecure redirect", "http://readrobe.com/download.php?filename=Test_Book.epub&token=x"],
	["wrong file", "download.php?filename=Different_Book.epub&token=x"],
	["wrong format", "download.php?filename=Test_Book.pdf&token=x"],
	["duplicate filename", "download.php?filename=Test_Book.epub&filename=Different_Book.epub&token=x"],
	["missing token", "download.php?filename=Test_Book.epub"],
	["invalid encoding", "download.php?filename=%ZZ&token=x"],
	["unrelated endpoint", "account.php?filename=Test_Book.epub&token=x"],
]) {
	test("OceanOfPDF rejects " + label + " before returning session credentials", async () => {
		const source = loadSource("oceanofpdf", async () => response({ Refresh: "3; url=" + target }));
		await assert.rejects(source._resolveMirrorForm(form, pageUrl), /unexpected file redirect/);
	});
}

test("OceanOfPDF reports missing Refresh and failed HTTP rather than downloading the HTML", async () => {
	const source = loadSource("oceanofpdf", async () => ({ status: 200, data: "HTML", headers: {} }));
	await assert.rejects(source._resolveMirrorForm(form, pageUrl), /did not return a download redirect/);
	const failed = loadSource("oceanofpdf", async () => response({}, 503));
	await assert.rejects(failed._resolveMirrorForm(form, pageUrl), /HTTP 503/);
});

test("OceanOfPDF does not cache or reuse session-bound download tokens", async () => {
	let count = 0;
	const source = loadSource("oceanofpdf", async () => response({ Refresh: "3; url=" + refreshUrl + (++count) }));
	const first = await source._resolveMirrorForm(form, pageUrl);
	const second = await source._resolveMirrorForm(form, pageUrl);
	assert.notEqual(first.url, second.url);
});

test("OceanOfPDF preserves original-site POST downloads and saved item metadata", async () => {
	const source = loadSource("oceanofpdf", async () => { throw Error("No mirror POST expected"); });
	const original = { ...form, endpoint: "https://oceanofpdf.com/Fetching_Resource.php" };
	source._fetchPage = async () => ({ status: 200, data: "x".repeat(1100) });
	source._extractDownloadForms = () => [original];
	const item = Object.freeze({ id: "saved#epub", title: "Title", cover: "cover.jpg", url: "https://oceanofpdf.com/book/", format: "epub" });
	assert.deepEqual(plain(await source.resolve(item)), {
		url: original.endpoint, fileName: filename,
		headers: { Referer: item.url, "X-Cinder-Expect-Interstitial": "1" },
		downloadRequest: { method: "POST", bodyEncoding: "form", body: { id: "srv3", filename }, useBrowser: true },
	});
	assert.equal(item.cover, "cover.jpg");
	await assert.rejects(source.resolve({ ...item, format: "pdf" }), /form was not found/);
});

test("OceanOfPDF existing mirror results take the fixed route without new search IDs", async () => {
	const source = loadSource("oceanofpdf", async () => response());
	source._fetchPage = async () => ({ status: 200, data: "x".repeat(1100) });
	source._extractDownloadForms = () => [form];
	const result = await source.resolve(Object.freeze({ id: "old#epub", url: pageUrl, format: "epub" }));
	assert.equal(result.url, "https://readrobe.com/" + refreshUrl);
	assert.equal(result.headers.Cookie, "PHPSESSID=test-session");
});

test("download-source versions match the repository manifest", () => {
	const manifest = JSON.parse(readFileSync(path.join(__dirname, "..", "repo.json"), "utf8"));
	for (const id of ["libgen", "oceanofpdf"]) {
		const entry = manifest.extensions.find((item) => item.id === id);
		assert.equal(entry.version, loadSource(id, async () => undefined).version);
	}
});
