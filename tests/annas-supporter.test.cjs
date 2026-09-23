const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const md5 = '0123456789abcdef0123456789abcdef';
const key = 'fixture +/?& secret';
const base = 'https://annas-archive.gd';
const direct = 'https://files.example.test/d3/book.epub?token=a%2Bb&expires=123';
const fallback = 'https://files.example.test/free.epub';
const root = path.join(__dirname, '..');
const sourceText = process.env.CINDER_ANNA_TEST_BASELINE
	? execFileSync('git', ['show', 'HEAD:annas_archive.js'], { cwd: root, encoding: 'utf8' })
	: fs.readFileSync(path.join(root, 'annas_archive.js'), 'utf8');

function harness({ secret = key, api = { status: 200, data: JSON.stringify({ download_url: direct }) },
	probe = { status: 200, headers: { 'content-type': 'application/epub+zip' } }, domain } = {}) {
	const requests = [], logs = [], timers = [];
	let normalCalls = 0;
	const cinder = {
		secureStore: { get: async () => secret },
		store: { get: async name => name === 'preferred_domain' ? domain : undefined },
		fetch: async (url, options) => {
			requests.push({ url, options });
			const response = options?.method === 'HEAD' ? probe : api;
			if (response instanceof Error) throw response;
			return response;
		},
		log: (...args) => logs.push(args.join(' ')), warn: (...args) => logs.push(args.join(' ')),
		parseHTML: () => { throw Error('Member downloads must not scrape HTML'); },
	};
	const context = vm.createContext({ cinder, setTimeout: (fn, ms) => {
		const timer = setTimeout(fn, ms); timer.unref(); timers.push(timer); return timer;
	} });
	vm.runInContext(sourceText, context);
	const source = context.__cinderExport;
	source._tryLibgenCDN = async () => { normalCalls++; return fallback; };
	source._fetchWithFallback = async () => null;
	return { source, cinder, requests, logs, normalCalls: () => normalCalls,
		resolve: async () => {
			try { return await source.resolve(Object.freeze({ id: md5, url: md5, title: 'Fixture', format: 'epub' })); }
			finally { timers.forEach(clearTimeout); }
		} };
}

test('supporter uses the documented API and returns a short JSON response intact', async () => {
	const h = harness({ secret: '  ' + key + '  ' });
	const result = await h.resolve();
	assert.equal(result.url, direct);
	assert.equal(h.normalCalls(), 0);
	assert.equal(h.requests.length, 2);
	const request = new URL(h.requests[0].url);
	assert.equal(request.origin, base);
	assert.equal(request.pathname, '/dyn/api/fast_download.json');
	assert.equal(request.searchParams.get('md5'), md5);
	assert.equal(request.searchParams.get('key'), key);
	assert.equal(request.searchParams.has('path_index'), false);
	assert.equal(request.searchParams.has('domain_index'), false);
	assert.equal(h.requests[0].options.timeout, 12000);
	assert.equal(h.requests[0].options.headers.Accept, 'application/json');
	assert.equal(h.requests[1].url, direct);
	assert.equal(h.requests[1].options.method, 'HEAD');
	assert.equal(result.headers.Referer, base + '/md5/' + md5);
	assert.equal(h.requests[1].options.headers.Referer, result.headers.Referer);
	assert.equal(JSON.stringify(result).includes(key), false);
	assert.equal(h.logs.join(' ').includes(key), false);
	assert.equal(h.logs.join(' ').includes(encodeURIComponent(key)), false);
	assert.equal(h.logs.join(' ').includes(direct), false);
});

for (const status of [200, 204]) {
	test('supporter accepts documented HTTP ' + status + ' with already-decoded JSON', async () => {
		const h = harness({ api: { status, data: { download_url: direct } } });
		assert.equal((await h.resolve()).url, direct);
	});
}

for (const secret of ['', '  ', null, false, 123]) {
	test('no usable supporter key preserves the original normal resolver (' + JSON.stringify(secret) + ')', async () => {
		const h = harness({ secret });
		assert.equal((await h.resolve()).url, fallback);
		assert.equal(h.requests.length, 0);
		assert.equal(h.normalCalls(), 1);
	});
}

test('older runtime without secureStore still resolves through normal mirrors', async () => {
	const h = harness(); delete h.cinder.secureStore;
	assert.equal((await h.resolve()).url, fallback);
	assert.equal(h.requests.length, 0);
});

for (const [label, api] of [
	['invalid membership', { status: 403, data: JSON.stringify({ error: key, download_url: null }) }],
	['rate limiting', { status: 429, data: '' }],
	['server failure', { status: 500, data: '' }],
	['network failure', { status: 0, data: '' }],
	['HTML challenge', { status: 200, data: '<html>' + key + '</html>' }],
	['missing body', { status: 204, data: '' }],
	['missing link', { status: 200, data: '{}' }],
	['null JSON', { status: 200, data: 'null' }],
	['error with link', { status: 200, data: JSON.stringify({ error: key, download_url: direct }) }],
	['exception containing credentials', Error('timeout ' + base + '?key=' + encodeURIComponent(key))],
]) {
	test(label + ' falls back without exposing the key or invoking browser HTML scraping', async () => {
		const h = harness({ api });
		assert.equal((await h.resolve()).url, fallback);
		assert.equal(h.normalCalls(), 1);
		assert.equal(h.requests.length, 1);
		assert.equal(h.logs.join(' ').includes(key), false);
		assert.equal(h.logs.join(' ').includes(encodeURIComponent(key)), false);
	});
}

for (const url of ['http://files.example.test/book.epub', 'javascript:alert(1)', '/book.epub',
	'https://user:password@files.example.test/book.epub', 'https://files.example.test/\r\nHeader: bad',
	'https://files.example.test\\@evil.test/book.epub', 42, null]) {
	test('rejects malformed or unsafe member URL: ' + JSON.stringify(url), async () => {
		const h = harness({ api: { status: 200, data: JSON.stringify({ download_url: url }) } });
		assert.equal((await h.resolve()).url, fallback);
		assert.equal(h.requests.length, 1);
	});
}

for (const probe of [
	{ status: 404 }, { status: 410 }, { status: 500 },
	{ status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
	{ status: 200, headers: { 'content-type': 'application/json' } },
]) {
	test('definitively bad member endpoint falls back: ' + JSON.stringify(probe), async () => {
		const h = harness({ probe }); assert.equal((await h.resolve()).url, fallback);
		assert.equal(h.requests.length, 2);
	});
}

for (const probe of [{ status: 403 }, { status: 405 }, { status: 0 }, Error('HEAD unsupported')]) {
	test('inconclusive HEAD does not reject a potentially valid download: ' + String(probe.status || probe), async () => {
		const h = harness({ probe }); assert.equal((await h.resolve()).url, direct);
		assert.equal(h.normalCalls(), 0);
	});
}

test('uses the selected official domain but never sends the key to a custom host', async () => {
	const selected = harness({ domain: 'annas-archive.gs' });
	assert.equal((await selected.resolve()).headers.Referer, 'https://annas-archive.gs/md5/' + md5);
	assert.equal(new URL(selected.requests[0].url).hostname, 'annas-archive.gs');
	const custom = harness({ domain: 'other.example.test' });
	assert.equal((await custom.resolve()).url, fallback);
	assert.equal(custom.requests.length, 0);
});

test('member links are refreshed each resolve rather than cached', async () => {
	const h = harness(); let count = 0;
	h.cinder.fetch = async (_url, options) => options.method === 'HEAD'
		? { status: 200 } : { status: 200, data: JSON.stringify({ download_url: direct + '&n=' + (++count) }) };
	assert.notEqual((await h.resolve()).url, (await h.resolve()).url);
	assert.equal(count, 2);
});

test('release manifest and script versions agree without raising minimum app version', () => {
	const entry = JSON.parse(fs.readFileSync(path.join(root, 'repo.json'), 'utf8')).extensions
		.find(item => item.id === 'annas-archive-slow');
	assert.equal(entry.version, harness().source.version);
	assert.equal(entry.minCinderVersion, '1.0.0');
});
