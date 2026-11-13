const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const script = process.env.CINDER_ANNA_TEST_BASELINE
  ? execFileSync('git', ['show', 'HEAD:annas_archive.js'], { cwd: root, encoding: 'utf8' })
  : readFileSync(path.join(root, 'annas_archive.js'), 'utf8');
const md5 = '0123456789abcdef0123456789abcdef';
const results = '<title>Search - Anna’s Archive</title><form action="/search"></form>' +
  `<a href="/md5/${md5}" class="font-semibold">Fixture Book</a><div>epub · 1 MB</div>`;
const empty = '<title>Search - Anna’s Archive</title><form action="/search">No results found</form>';
const challenge = '<title>DDoS-Guard</title><script src="/.well-known/ddos-guard/js-challenge/index.js"></script>' +
  '<h1>Checking your browser before accessing</h1>';
const ok = data => ({ status: 200, data, headers: {} });

function harness(t, { response = ok(results), browser = ok(results), domain } = {}) {
  const calls = [], browserCalls = [], timers = [], logs = [];
  const cinder = {
    store: { get: async key => key === 'preferred_domain' ? domain : undefined },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return typeof response === 'function' ? response(url, options) : response;
    },
    fetchBrowser: async (url, options) => {
      browserCalls.push({ url, options });
      return typeof browser === 'function' ? browser(url, options) : browser;
    },
    parseHTML: () => ({ querySelectorAll: () => [] }),
    log: text => logs.push(text), warn: text => logs.push(text),
  };
  const context = vm.createContext({
    cinder,
    setTimeout: (fn, delay) => { const timer = setTimeout(fn, delay); timers.push(timer); return timer; },
  });
  vm.runInContext(script, context);
  t.after(() => timers.forEach(clearTimeout));
  return { source: context.__cinderExport, cinder, calls, browserCalls, logs };
}

test('fast search uses one bounded request and preserves result identity', async t => {
  const h = harness(t);
  const items = await h.source.search('fixture', 0);
  assert.equal(items[0].id, md5);
  assert.equal(items[0].title, 'Fixture Book');
  assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].options.timeout <= 4000);
  assert.equal(h.browserCalls.length, 0);
});

for (const status of [200, 403, 503]) {
  test(`DDoS-Guard challenge (HTTP ${status}) is handled through the existing browser`, async t => {
    const h = harness(t, { response: { status, data: challenge } });
    assert.equal((await h.source.search('fixture', 0))[0].id, md5);
    assert.equal(h.browserCalls.length, 1);
    const headers = h.browserCalls[0].options.headers;
    assert.equal(headers['X-Cinder-Suppress-Interactive'], '1', 'no surprise verification modal during background search');
    assert.ok(headers['X-Cinder-Wait-For-Selector'].includes('/search'));
    assert.ok(Number(headers['X-Cinder-Max-Wait-Ms']) < 15000);
    assert.equal(h.calls.length, 3, 'each official mirror gets at most one bounded native attempt');
    assert.equal(headers['X-Cinder-Visible-Layout'], '1', 'allow a normal viewport without opening a modal');
  });
}

test('an unresolved challenge is actionable, not a false empty result', async t => {
  const h = harness(t, { response: { status: 403, data: challenge }, browser: ok(challenge) });
  await assert.rejects(h.source.search('fixture', 0), error =>
    error.status === 403 && error.stopSearch === true && /Verify Website/i.test(error.message));
  assert.equal(h.calls.length, 3);
  assert.equal(h.browserCalls.length, 1);
});

test('a real empty search result remains successful', async t => {
  const h = harness(t, { response: ok(empty) });
  assert.equal((await h.source.search('no matches', 0)).length, 0);
  assert.equal(h.browserCalls.length, 0);
});

test('normal pages mentioning protection software do not trigger browser verification', async t => {
  const h = harness(t, { response: ok(results +
    '<p>Book about DDoS-Guard and Cloudflare</p><script src="https://check.ddos-guard.net/check.js"></script>') });
  assert.equal((await h.source.search('fixture', 0)).length, 1);
  assert.equal(h.browserCalls.length, 0);
});

test('parking pages are rejected, not treated as empty catalogues', async t => {
  const h = harness(t, { response: ok('<title>annas-archive.li</title>' + 'Domain for sale '.repeat(100)) });
  await assert.rejects(h.source.search('fixture', 0), /unavailable|recogniz/i);
  assert.equal(h.browserCalls.length, 0);
  assert.ok(h.calls.length <= 3);
});

test('HTTP 429 honors Retry-After and does not retry through a browser or other mirror', async t => {
  const h = harness(t, { response: { status: 429, data: '', headers: { 'Retry-After': '120' } } });
  const start = Date.now();
  await assert.rejects(h.source.search('fixture', 0), error => error.status === 429 && error.stopSearch);
  await assert.rejects(h.source.search('different query', 0), /wait|retry/i);
  assert.equal(h.calls.length, 1);
  assert.equal(h.browserCalls.length, 0);
  assert.ok(h.source._searchRetryUntil['annas-archive.gd'] >= start + 120000);
});

test('Retry-After HTTP dates are respected on server overload', async t => {
  const until = Math.floor(Date.now() / 1000) * 1000 + 90000;
  const h = harness(t, { response: { status: 503, data: '', headers: { 'retry-after': new Date(until).toUTCString() } } });
  await assert.rejects(h.source.search('fixture', 0), /wait|retry/i);
  assert.equal(h.source._searchRetryUntil['annas-archive.gd'], until);
  assert.equal(h.calls.length, 1);
});

test('a native network failure can use another currently advertised mirror', async t => {
  const h = harness(t, { response: url => url.startsWith('https://annas-archive.gd/')
    ? { status: 0, data: '' } : ok(results) });
  assert.equal((await h.source.search('fixture', 0))[0].id, md5);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls[1].url.startsWith('https://annas-archive.gl/'));
  assert.equal(h.browserCalls.length, 0);
});

test('retired saved domains fall back safely without sending any request there', async t => {
  for (const domain of ['annas-archive.se', 'annas-archive.li', 'annas-archive.gs']) {
    const h = harness(t, { domain });
    await h.source.search('fixture', 0);
    assert.ok(h.calls[0].url.startsWith('https://annas-archive.gd/'));
    assert.equal(await h.source._getBaseUrl(), 'https://annas-archive.gd');
  }
});

test('verification setting follows the selected mirror with no key or private query in its URL', async t => {
  const h = harness(t, { domain: 'annas-archive.pk' });
  const setting = (await h.source.getSettingsAsync()).find(item => item.id === 'verify_website');
  assert.equal(setting.type, 'webview');
  assert.equal(setting.url, 'https://annas-archive.pk/search?q=test');
  assert.equal(h.source.browser.userAgent, 'mobile');
  assert.equal(h.calls.length, 0);
});

test('search cancellation is passed through and cannot start a late browser task', async t => {
  const controller = new AbortController();
  let release;
  const h = harness(t, { response: () => new Promise(resolve => { release = resolve; }) });
  const pending = h.source.search('fixture', 0, undefined, { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls[0].options.signal, controller.signal);
  controller.abort();
  release({ status: 403, data: challenge });
  await assert.rejects(pending, /cancel/i);
  assert.equal(h.browserCalls.length, 0);
});

test('extension deadline ends before the host deadline and ignores late network completion', async t => {
  let release;
  const h = harness(t, { response: () => new Promise(resolve => { release = resolve; }) });
  assert.ok(h.source._SEARCH_BUDGET_MS < 15000);
  h.source._SEARCH_BUDGET_MS = 25;
  await assert.rejects(h.source.search('fixture', 0), /Verify Website|timed out/i);
  release({ status: 403, data: challenge });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.browserCalls.length, 0);
  assert.equal(h.calls.length, 1);
});

test('slow browser completion cannot queue more hidden browsers after the caller times out', async t => {
  let release;
  const h = harness(t, { response: { status: 403, data: challenge },
    browser: () => new Promise(resolve => { release = resolve; }) });
  h.source._SEARCH_BUDGET_MS = 25;
  await assert.rejects(h.source.search('fixture', 0));
  await assert.rejects(h.source.search('another query', 0), /verification|browser|timed out/i);
  assert.equal(h.browserCalls.length, 1);
  release(ok(results));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.source._searchBrowserTask, null);
});

test('overlapping queries share automatic verification, then load their own results sequentially', async t => {
  const releases = [];
  let releaseBrowser;
  const h = harness(t, { response: () => releases.length < 2
    ? new Promise(resolve => releases.push(resolve)) : { status: 403, data: challenge },
    browser: () => releaseBrowser ? ok(results.replace('Fixture Book', 'Second Book'))
      : new Promise(resolve => { releaseBrowser = resolve; }) });
  const first = h.source.search('first', 0);
  const second = h.source.search('second', 0);
  await new Promise(resolve => setImmediate(resolve));
  releases.forEach(release => release({ status: 403, data: challenge }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.browserCalls.length, 1);
  releaseBrowser(ok(results));
  assert.equal((await first)[0].title, 'Fixture Book');
  assert.equal((await second)[0].title, 'Second Book');
  assert.equal(h.browserCalls.length, 2);
  assert.match(h.browserCalls[1].url, /q=second/);
});

test('identical overlapping searches share one automatic browser result', async t => {
  let release;
  const h = harness(t, { response: { status: 403, data: challenge },
    browser: () => new Promise(resolve => { release = resolve; }) });
  const first = h.source.search('same query', 0);
  const second = h.source.search('same query', 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.browserCalls.length, 1);
  release(ok(results));
  assert.equal((await first)[0].id, md5);
  assert.equal((await second)[0].id, md5);
  assert.equal(h.browserCalls.length, 1);
});

test('older hosts without a browser method fail with instructions, not a TypeError', async t => {
  const h = harness(t, { response: { status: 403, data: challenge } });
  delete h.cinder.fetchBrowser;
  await assert.rejects(h.source.search('fixture', 0), /Verify Website/);
  assert.equal(h.calls.length, 3);
});

test('clearing a completed browser failure permits a subsequent verified native request', async t => {
  let verified = false;
  const h = harness(t, { response: () => verified ? ok(results) : { status: 403, data: challenge },
    browser: ok(challenge) });
  await assert.rejects(h.source.search('fixture', 0), /Verify Website/);
  verified = true;
  assert.equal((await h.source.search('fixture', 0))[0].id, md5);
  assert.equal(h.browserCalls.length, 1);
});

test('authentication rejection does not launch mirror or browser retries', async t => {
  const h = harness(t, { response: { status: 401, data: 'Unauthorized' } });
  await assert.rejects(h.source.search('fixture', 0), error => error.status === 401);
  assert.equal(h.calls.length, 1);
  assert.equal(h.browserCalls.length, 0);
});

test('a challenged first mirror can use a healthy official mirror without browser verification', async t => {
  const h = harness(t, { response: url => url.startsWith('https://annas-archive.gd/')
    ? { status: 403, data: challenge } : ok(results), browser: ok(challenge) });
  assert.equal((await h.source.search('fixture', 0))[0].id, md5);
  assert.equal(h.calls.length, 2);
  assert.equal(h.browserCalls.length, 0);
  assert.equal(await h.source._getBaseUrl(), 'https://annas-archive.gl');
  await h.source.search('next query', 0);
  assert.equal(h.calls.length, 3, 'reuse the healthy mirror instead of retrying the challenged one');
  assert.ok(h.calls[2].url.startsWith('https://annas-archive.gl/'));
});

test('remembered mirror expires and an explicit preference change takes priority', async t => {
  const h = harness(t, { response: url => url.startsWith('https://annas-archive.gd/') ? { status: 0 } : ok(results) });
  await h.source.search('fixture', 0);
  assert.equal(await h.source._getBaseUrl(), 'https://annas-archive.gl');
  h.cinder.store.get = async key => key === 'preferred_domain' ? 'annas-archive.pk' : undefined;
  assert.equal(await h.source._getBaseUrl(), 'https://annas-archive.pk');
  h.cinder.store.get = async () => undefined;
  h.source._workingDomain.until = 0;
  assert.equal(await h.source._getBaseUrl(), 'https://annas-archive.gd');
});

test('passive browser check gets the remaining search budget after bounded native fallback', async t => {
  const h = harness(t, { response: { status: 403, data: challenge } });
  await h.source.search('fixture', 0);
  assert.equal(h.calls.length, 3);
  assert.equal(h.browserCalls.length, 1);
  assert.ok(h.calls.every(call => call.options.timeout <= 3500));
  const wait = Number(h.browserCalls[0].options.headers['X-Cinder-Max-Wait-Ms']);
  assert.ok(wait > 6000 && wait < h.source._SEARCH_BUDGET_MS);
  assert.equal(h.browserCalls[0].options.browserUserAgent, 'mobile');
});

test('a successful automatic browser session is reused for subsequent queries', async t => {
  const h = harness(t, { response: { status: 403, data: challenge } });
  await h.source.search('first title', 0);
  await h.source.search('second title', 0);
  assert.equal(h.calls.length, 3, 'do not repeat failed native requests after browser success');
  assert.equal(h.browserCalls.length, 2);
  assert.match(h.browserCalls[1].url, /q=second%20title/);
  assert.equal(h.source._workingDomain.browser, true);
});

test('expired browser session falls back to native mirrors without another browser loop', async t => {
  const h = harness(t, { response: { status: 403, data: challenge } });
  await h.source.search('first title', 0);
  h.cinder.fetchBrowser = async () => { h.browserCalls.push({}); return ok(challenge); };
  h.cinder.fetch = async url => {
    h.calls.push({ url });
    return url.startsWith('https://annas-archive.gl/') ? ok(results) : { status: 403, data: challenge };
  };
  assert.equal((await h.source.search('second title', 0))[0].id, md5);
  assert.equal(h.browserCalls.length, 2);
  assert.equal(await h.source._getBaseUrl(), 'https://annas-archive.gl');
  assert.equal(h.source._workingDomain.browser, false);
});

test('changing the preferred mirror does not reuse the previous browser session hint', async t => {
  const h = harness(t, { response: { status: 403, data: challenge } });
  await h.source.search('first title', 0);
  h.cinder.store.get = async key => key === 'preferred_domain' ? 'annas-archive.pk' : undefined;
  h.cinder.fetch = async url => { h.calls.push({ url }); return ok(results); };
  await h.source.search('second title', 0);
  assert.equal(h.browserCalls.length, 1);
  assert.ok(h.calls[3].url.startsWith('https://annas-archive.pk/'));
});

test('browser rate limits are actionable and block further searches', async t => {
  const h = harness(t, { response: { status: 403, data: challenge },
    browser: { status: 429, data: '', headers: { 'Retry-After': '90' } } });
  await assert.rejects(h.source.search('fixture', 0), error => error.status === 429);
  const count = h.calls.length;
  await assert.rejects(h.source.search('another', 0), error => error.status === 429);
  assert.equal(h.calls.length, count);
  assert.equal(h.browserCalls.length, 1);
});

test('native transport failures still get one automatic browser attempt', async t => {
  const h = harness(t, { response: { status: 0, data: '' } });
  assert.equal((await h.source.search('fixture', 0))[0].id, md5);
  assert.equal(h.calls.length, 3);
  assert.equal(h.browserCalls.length, 1);
});

test('a failed remembered browser session is discarded for the next search', async t => {
  const h = harness(t, { response: { status: 403, data: challenge } });
  await h.source.search('first', 0);
  h.cinder.fetchBrowser = async () => ok(challenge);
  await assert.rejects(h.source.search('second', 0), /Verify Website/);
  assert.equal(h.source._workingDomain, null);
});

test('a cancelled query waiting for shared verification cannot queue another browser', async t => {
  let release;
  const controller = new AbortController();
  const h = harness(t, { response: { status: 403, data: challenge },
    browser: () => new Promise(resolve => { release = resolve; }) });
  const first = h.source.search('first', 0);
  const cancelled = h.source.search('second', 0, undefined, { signal: controller.signal });
  const rejected = assert.rejects(cancelled, /cancel/i);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  release(ok(results));
  await first;
  await rejected;
  assert.equal(h.browserCalls.length, 1);
});

test('a late browser success cannot remember a domain after the search expired', async t => {
  let release;
  const h = harness(t, { response: { status: 403, data: challenge },
    browser: () => new Promise(resolve => { release = resolve; }) });
  h.source._SEARCH_BUDGET_MS = 25;
  await assert.rejects(h.source.search('fixture', 0), /timed out/);
  release(ok(results));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.source._workingDomain, null);
});

test('detail fallback rejects an HTTP 200 challenge and retains the working mirror origin', async t => {
  const detail = '<title>Fixture - Anna’s Archive</title><h1>Fixture</h1>' + 'text '.repeat(150);
  const h = harness(t, { response: url => url.startsWith('https://annas-archive.gd/')
    ? ok(challenge + ' '.repeat(600)) : ok(detail), browser: ok(challenge + ' '.repeat(600)) });
  const result = await h.source._fetchWithFallback('/md5/' + md5);
  assert.equal(result.data, detail);
  assert.equal(result._aaBaseUrl, 'https://annas-archive.gl');
  assert.equal(await h.source._getBaseUrl(), 'https://annas-archive.gl');
});

for (const race of [false, true]) {
  test('download ' + (race ? 'race' : 'fallback') + ' stays on the mirror that supplied its detail page', async t => {
    const slow = '/slow_download/' + md5 + '/0/6';
    const target = 'https://files.example.test/book.epub';
    const h = harness(t);
    h.cinder.store.get = async key => key === 'enable_mirror_race' ? String(race) : undefined;
    h.source._tryLibgenCDN = async () => null;
    h.source._fetchWithFallback = async () => ({ ...ok('detail'), _aaBaseUrl: 'https://annas-archive.pk' });
    h.cinder.parseHTML = () => ({ querySelectorAll: () => [{ attr: () => slow }] });
    h.source._raceMirrors = async (_paths, base) => {
      assert.equal(base, 'https://annas-archive.pk');
      return { url: target, referer: base + slow };
    };
    h.cinder.fetch = async url => { assert.equal(url, 'https://annas-archive.pk' + slow); return ok('x'.repeat(600)); };
    h.source._extractDownloadUrl = () => target;
    h.source._validateDirectDownloadUrl = async () => true;
    const result = await h.source.resolve({ id: md5, url: md5 });
    assert.equal(result.url, target);
    assert.equal(result.headers.Referer, 'https://annas-archive.pk' + slow);
  });
}
