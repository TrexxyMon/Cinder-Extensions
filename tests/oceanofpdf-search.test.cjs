const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const sourcePath = process.env.OCEAN_SOURCE || path.join(__dirname, '..', 'oceanofpdf.js');
const script = readFileSync(sourcePath, 'utf8');
const primary = 'https://oceanofpdf.com';
const mirror = 'https://readrobe.com';
const padded = html => html + '<!-- ' + 'fixture '.repeat(140) + ' -->';
const results = padded('<title>Search Results for test - OceanofPDF</title><main id="genesis-content"><article class="entry">result-fixture</article></main>');
const empty = padded('<title>You searched for test - OceanofPDF</title><main id="genesis-content">Nothing found.</main>');
const challenge = padded('<title>Just a moment...</title><script>window._cf_chl_opt = {};</script>');
const offline = padded('<title>ReadRobe — Temporarily Offline</title><h1>We are temporarily offline</h1>');
const ok = data => ({ status: 200, data, headers: {} });

function harness(t, { fetch = async () => ok(results), browser = async () => ok(results) } = {}) {
  const calls = [], browserCalls = [], timers = [], callbacks = [];
  // DOM contract fixture: parsing the article still uses the extension's real
  // result mapper. Live HTML selectors are checked separately against the site.
  const title = { text: () => 'Fixture Book', attr: key => key === 'href' ? '/authors/test/book/' : '' };
  const article = {
    attr: () => '',
    querySelector: selector => selector === 'h2.entry-title a.entry-title-link' ? title : null,
  };
  const cinder = {
    fetch: async (url, options) => { calls.push({ url, options }); return fetch(url, options); },
    fetchBrowser: async (url, options) => { browserCalls.push({ url, options }); return browser(url, options); },
    parseHTML: html => ({ querySelectorAll: () => html.includes('result-fixture') ? [article] : [] }),
    normalizeText: text => String(text), log() {}, warn() {},
  };
  const sandbox = vm.createContext({ cinder, setTimeout: (fn, ms) => {
    callbacks.push(fn);
    const timer = setTimeout(fn, ms); timers.push(timer); return timer;
  } });
  vm.runInContext(script, sandbox);
  t.after(() => timers.forEach(clearTimeout));
  return { source: sandbox.__cinderExport, cinder, calls, browserCalls, expire: () => callbacks[0]() };
}

test('OceanOfPDF is primary; successful searches never contact Readrobe', async t => {
  const h = harness(t);
  const items = await h.source.search('test', 0);
  assert.equal(h.calls[0].url, primary + '/?s=test');
  assert.equal(h.calls.length, 1);
  assert.equal(h.browserCalls.length, 0);
  assert.equal(items[0].id, '/authors/test/book/#epub');
  assert.equal(items[0].url, primary + '/authors/test/book/');
  assert.equal(items[1].format, 'pdf');
  assert.ok(h.calls[0].options.timeout <= 3500);
});

test('pagination and query encoding are preserved', async t => {
  const h = harness(t);
  await h.source.search('A & B', 1);
  assert.equal(h.calls[0].url, primary + '/page/2/?s=A%20%26%20B');
});

for (const status of [200, 503]) {
  test(`maintenance HTTP ${status} never starts a browser request`, async t => {
    const h = harness(t, { fetch: async () => ({ status, data: offline }) });
    await assert.rejects(h.source.search('test', 0), /unavailable/i);
    assert.equal(h.calls.length, 2);
    assert.equal(h.browserCalls.length, 0);
  });
}

test('a failed primary can still use Readrobe without changing saved result IDs', async t => {
  const h = harness(t, { fetch: async url => url.startsWith(primary) ? { status: 503, data: offline } : ok(results) });
  const items = await h.source.search('test', 0);
  assert.equal(items[0].id, '/authors/test/book/#epub');
  assert.equal(items[0].url, mirror + '/authors/test/book/');
  assert.equal(h.browserCalls.length, 0);
});

for (const status of [200, 403, 503]) {
  test(`a challenge HTTP ${status} uses the existing browser/cookie path`, async t => {
    const h = harness(t, { fetch: async () => ({ status, data: challenge }) });
    assert.equal((await h.source.search('test', 0)).length, 2);
    assert.equal(h.calls.length, 1);
    assert.equal(h.browserCalls.length, 1);
    const headers = h.browserCalls[0].options.headers;
    assert.equal(headers['X-Cinder-Suppress-Interactive'], '1');
    assert.ok(Number(headers['X-Cinder-Max-Wait-Ms']) > 6000);
    assert.ok(Number(headers['X-Cinder-Max-Wait-Ms']) <= 13500);
    assert.match(h.calls[0].options.headers['User-Agent'], /16_6/);
  });
}

for (const browserResponse of [ok(challenge), { status: 0, data: '' }, ok('')]) {
  test(`unresolved browser check (${browserResponse.status}/${browserResponse.data.length}) is actionable even when Readrobe is offline`, async t => {
    const h = harness(t, {
      fetch: async url => url.startsWith(primary) ? { status: 403, data: challenge } : { status: 503, data: offline },
      browser: async () => browserResponse,
    });
    await assert.rejects(h.source.search('test', 0), e => e.status === 403 && e.stopSearch && /Verify Website/.test(e.message));
    assert.equal(h.browserCalls.length, 1);
  });
}

test('valid zero-result searches do not query a different catalogue', async t => {
  const h = harness(t, { fetch: async () => ok(empty) });
  assert.equal((await h.source.search('none', 0)).length, 0);
  assert.equal(h.calls.length, 1);
  assert.equal(h.browserCalls.length, 0);
});

test('parking/error pages do not masquerade as empty results', async t => {
  const h = harness(t, { fetch: async () => ok(padded('<title>Domain for sale</title>')) });
  await assert.rejects(h.source.search('test', 0), /unavailable/);
});

test('older hosts without fetchBrowser fail clearly instead of TypeError or false success', async t => {
  const h = harness(t, { fetch: async () => ({ status: 403, data: challenge }) });
  delete h.cinder.fetchBrowser;
  await assert.rejects(h.source.search('test', 0), /Verify Website/);
});

test('explicit verification is exposed using existing extension APIs', t => {
  const h = harness(t);
  const setting = h.source.getSettings().find(s => s.id === 'verify_website');
  assert.equal(setting.type, 'webview');
  assert.equal(setting.url, primary + '/?s=test');
  assert.equal(h.source.browser.startUrl, setting.url);
  assert.equal(h.source.browser.userAgent, 'mobile');
});

test('cancelled search starts no network or browser work', async t => {
  const h = harness(t);
  await assert.rejects(h.source.search('test', 0, undefined, { signal: { aborted: true } }), /cancel/i);
  assert.equal(h.calls.length, 0);
});

test('cancellation after native fetch prevents a late browser or mirror request', async t => {
  const signal = { aborted: false };
  const h = harness(t, { fetch: async () => { signal.aborted = true; return { status: 403, data: challenge }; } });
  await assert.rejects(h.source.search('test', 0, undefined, { signal }), /cancel/i);
  assert.equal(h.calls.length, 1);
  assert.equal(h.browserCalls.length, 0);
});

test('deadline rejects stuck requests; late completion starts no more work', async t => {
  let release;
  const h = harness(t, { fetch: () => new Promise(resolve => { release = resolve; }) });
  h.source._SEARCH_BUDGET_MS = 20;
  await assert.rejects(h.source.search('test', 0), /timed out/);
  release({ status: 403, data: challenge });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.length, 1);
  assert.equal(h.browserCalls.length, 0);
});

test('overlapping queries cannot queue repeated browser verification', async t => {
  let release;
  const h = harness(t, {
    fetch: async url => url.startsWith(primary) ? { status: 403, data: challenge } : { status: 503, data: offline },
    browser: () => new Promise(resolve => { release = resolve; }),
  });
  const pending = h.source.search('test', 0);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(h.source.search('another', 0), /already running/);
  assert.equal(h.browserCalls.length, 1);
  release(ok(results));
  assert.equal((await pending).length, 2);
  assert.equal(h.source._searchBrowserTask, null);
});

test('browser failures release the concurrency guard for the next attempt', async t => {
  const h = harness(t, { fetch: async () => ({ status: 403, data: challenge }), browser: async () => { throw Error('browser failed'); } });
  await assert.rejects(h.source.search('test', 0));
  assert.equal(h.source._searchBrowserTask, null);
  h.cinder.fetch = async () => ok(results);
  assert.equal((await h.source.search('test', 0)).length, 2);
});

test('book descriptions mentioning maintenance do not trigger outage handling', t => {
  const h = harness(t);
  assert.equal(h.source._isUsableHtml(ok(results + '<p>The station was temporarily offline. Cloudflare guide.</p>')), true);
});

test('missing or malformed HTTP status cannot become a successful connection', t => {
  const h = harness(t);
  for (const status of [undefined, null, 'invalid', 0, 500]) {
    assert.equal(h.source._isUsableHtml({ status, data: results }), false);
  }
});

test('a slow browser cannot launch mirror work after the caller deadline', async t => {
  let release;
  const h = harness(t, {
    fetch: async () => ({ status: 403, data: challenge }),
    browser: () => new Promise(resolve => { release = resolve; }),
  });
  const pending = h.source.search('test', 0);
  await new Promise(resolve => setImmediate(resolve));
  h.expire();
  await assert.rejects(pending, /timed out/);
  release(ok(results));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.length, 1);
  assert.equal(h.browserCalls.length, 1);
  assert.equal(h.source._searchBrowserTask, null);
});

test('detail browser waits for download form fields, preserving the POST resolver', async t => {
  const h = harness(t, { fetch: async () => ({ status: 403, data: challenge }) });
  await h.source._fetchPage(primary + '/authors/test/book/');
  assert.match(h.browserCalls[0].options.headers['X-Cinder-Wait-For-Selector'], /input\[name="filename"\]/);
  assert.equal(h.browserCalls[0].options.headers['X-Cinder-Suppress-Interactive'], '1');
});

test('cancellation during the optional UA probe starts no late request', async t => {
  const h = harness(t); const controller = new AbortController(); let finish;
  h.cinder.executeBrowserScript = () => new Promise(resolve => { finish = resolve; });
  const work = h.source.search('test', 0, undefined, { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(); finish({ result: 'Mozilla/5.0 test browser' });
  await assert.rejects(work, /cancelled/);
  assert.equal(h.calls.length, 0); assert.equal(h.browserCalls.length, 0);
});
