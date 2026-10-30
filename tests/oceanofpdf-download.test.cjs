const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const script = readFileSync(process.env.OCEAN_SOURCE || path.join(__dirname, '..', 'oceanofpdf.js'), 'utf8');
const endpoint = 'https://oceanofpdf.com/Fetching_Resource.php';
const page = 'https://oceanofpdf.com/authors/fixture/book/';
const filename = 'Fixture_Book.epub';
const target = 'https://files.example/OceanofPDF.com/' + filename + '?md5=example&expires=1';
const selected = { endpoint, requestId: 'server-test', fileName: filename, format: 'epub' };
const challenge = '<title>Just a moment...</title><script>window._cf_chl_opt={};</script>';
const plain = value => JSON.parse(JSON.stringify(value));
const ok = data => ({ status: 200, headers: {}, data });
const meta = (url = target, seconds = 0) => `<meta http-equiv="Refresh" content="${seconds};URL='${url.replaceAll('&', '&amp;')}'">`;
const formHtml = (name = filename, server = 'server-test') => `<form action="/Fetching_Resource.php" method="post">
  <input type="hidden" name="id" value="${server}">
  <input type="hidden" name="filename" value="${name}">
  <input type="hidden" name="nonce" value="test + &amp; value">
  <input type="submit" name="submit" value="EPUB">
  </form><!-- ${'fixture '.repeat(150)} -->`;

// A small DOM-contract fixture; the source still parses and selects its own
// forms, fields and redirects. The app's actual parser is exercised separately.
function parseHTML(html) {
  const attrs = text => Object.fromEntries([...text.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(m => [m[1].toLowerCase(), (m[2] ?? m[3] ?? m[4]).replaceAll('&amp;', '&')]));
  const node = (tag, body = '') => ({
    attr: name => attrs(tag)[name],
    querySelector: selector => {
      const name = /name="([^"]+)"/.exec(selector)?.[1];
      return [...body.matchAll(/<input\b([^>]*)>/gi)].map(m => node(m[1])).find(n => n.attr('name') === name) || null;
    },
    querySelectorAll: () => [...body.matchAll(/<input\b([^>]*)>/gi)].map(m => node(m[1])),
  });
  return { querySelectorAll: selector => {
    if (selector.startsWith('meta')) return [...html.matchAll(/<meta\b([^>]*)>/gi)].map(m => node(m[1]));
    if (selector.startsWith('a[')) return [...html.matchAll(/<a\b([^>]*)>/gi)].map(m => node(m[1]));
    if (selector.startsWith('form')) return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map(m => node(m[1], m[2]));
    return [];
  } };
}

function harness(overrides = {}) {
  const calls = [], browserCalls = [], delays = [], warnings = [];
  const cinder = {
    normalizeText: value => String(value), parseHTML, resolveUrl: (url, base) => new URL(url, base).href,
    fetch: async (url, options) => { calls.push({ url, options }); return overrides.fetch ? overrides.fetch(url, options) : ok(meta()); },
    fetchBrowser: async (url, options) => { browserCalls.push({ url, options }); return overrides.browser ? overrides.browser(url, options) : ok(formHtml()); },
    log() {}, warn: (...args) => warnings.push(args),
  };
  const sandbox = vm.createContext({ cinder, setTimeout: (fn, ms) => { delays.push(ms); queueMicrotask(fn); } });
  vm.runInContext(script, sandbox);
  return { source: sandbox.__cinderExport, cinder, calls, browserCalls, delays, warnings };
}

test('original-site resolver posts form and returns signed file URL, not binary browser work', async () => {
  const h = harness();
  h.source._fetchPage = async () => ok(formHtml());
  const item = Object.freeze({ id: 'saved#epub', title: 'Saved title', cover: 'cover.jpg', url: page, format: 'epub' });
  const result = await h.source.resolve(item);
  assert.deepEqual(plain(result), { url: target, fileName: filename, headers: { Referer: endpoint, "User-Agent": h.source._LEGACY_USER_AGENT } });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, endpoint);
  assert.equal(h.calls[0].options.method, 'POST');
  assert.equal(h.calls[0].options.headers.Origin, 'https://oceanofpdf.com');
  assert.equal(h.calls[0].options.headers.Referer, page);
  assert.equal(h.calls[0].options.headers['Accept-Encoding'], undefined);
  assert.equal(h.calls[0].options.timeout, 15000);
  const data = new URLSearchParams(h.calls[0].options.body);
  assert.equal(data.get('id'), 'server-test');
  assert.equal(data.get('filename'), filename);
  assert.equal(data.get('nonce'), 'test + & value');
  assert.equal(data.has('submit'), false);
  assert.equal(h.browserCalls.length, 0);
  assert.equal(item.cover, 'cover.jpg');
});

test('quoted refresh previously resolves to the wrong path; resolver strips quotes before resolving', () => {
  const oldCapture = `0;URL='${target}'`.match(/url=(.+)/i)[1].trim();
  assert.notEqual(new URL(oldCapture, endpoint).href, target);
  assert.equal(harness().source._fileRedirect(ok(meta()), selected).url, target);
});

for (const [name, response, expected] of [
  ['Refresh header', { status: 200, headers: { rEfReSh: '0; url="' + target + '"' }, data: '' }, target],
  ['meta refresh', ok(meta()), target],
  ['plain anchor', ok('<a href="' + target.replaceAll('&', '&amp;') + '">Download</a>'), target],
  ['relative URL', ok(meta('/files/' + filename)), 'https://oceanofpdf.com/files/' + filename],
  ['normal JS detection beacon', ok(meta() + '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>'), target],
]) {
  test('redirect parser handles ' + name, () => {
    assert.equal(harness().source._fileRedirect(response, selected).url, expected);
  });
}

test('legacy host without resolveUrl still handles signed absolute URLs', async () => {
  const h = harness(); delete h.cinder.resolveUrl;
  assert.equal((await h.source._resolveOceanForm(selected, page)).url, target);
});

test('encoded filename and PDF format stay associated with the selected book', () => {
  const name = 'A & B + Café.pdf';
  const url = 'https://files.example/files/' + encodeURIComponent(name) + '?token=example';
  const result = harness().source._fileRedirect(ok(meta(url)), { ...selected, fileName: name, format: 'pdf' });
  assert.equal(result.url, url);
});

for (const [label, value] of [
  ['different file', target.replace(filename, 'Other.epub')],
  ['wrong format', target.replace('.epub', '.pdf')],
  ['HTML endpoint claiming filename', 'https://files.example/index.php?filename=' + filename],
  ['insecure URL', target.replace('https:', 'http:')],
  ['credentials', target.replace('files.example', 'user:password@files.example')],
  ['script', 'javascript:alert(1)'],
  ['malformed encoding', 'https://files.example/%ZZ.epub'],
  ['backslash', 'https://files.example\\@other.example/' + filename],
  ['line break', target + '\n'],
]) {
  test('rejects ' + label + ' rather than downloading a wrong file', () => {
    assert.equal(harness().source._fileRedirect(ok(meta(value)), selected), null);
  });
}

for (const response of [null, { data: meta() }, { status: 'invalid', data: meta() },
  { status: 403, data: meta() }, { status: 503, data: meta() }, ok(challenge + meta())]) {
  test('does not accept a file link from failed/challenged response ' + String(response?.status), () => {
    assert.equal(harness().source._fileRedirect(response, selected), null);
  });
}

test('website credentials and signed links never appear in returned headers or routine logs', async () => {
  const h = harness({ fetch: async () => ({ ...ok(meta()), headers: { 'set-cookie': 'cf_clearance=private', Authorization: 'private' } }) });
  const result = await h.source._resolveOceanForm(selected, page);
  assert.deepEqual(plain(result.headers), { Referer: endpoint, "User-Agent": h.source._LEGACY_USER_AGENT });
  assert.equal(h.warnings.length, 0);
});

test('expires/session token is resolved afresh per download', async () => {
  let count = 0;
  const h = harness({ fetch: async () => ok(meta(target + '&token=' + ++count)) });
  assert.notEqual((await h.source._resolveOceanForm(selected, page)).url, (await h.source._resolveOceanForm(selected, page)).url);
});

test('server countdown is honored once and capped rather than running a browser timeout', async () => {
  const h = harness({ fetch: async () => ok(meta(target, 5)) });
  await h.source._resolveOceanForm(selected, page);
  assert.deepEqual(h.delays, [5000]);
  assert.equal(h.source._fileRedirect(ok(meta(target, 999)), selected).delay, 10);
});

test('one silent cookie refresh retries POST with refreshed form fields, never a GET replacement', async () => {
  let count = 0;
  const h = harness({ fetch: async () => ++count === 1 ? { status: 403, data: challenge } : ok(meta()),
    browser: async () => ok(formHtml(filename, 'new-server')) });
  assert.equal((await h.source._resolveOceanForm(selected, page)).url, target);
  assert.equal(h.browserCalls.length, 1);
  assert.equal(h.browserCalls[0].url, page);
  assert.equal(h.browserCalls[0].options.headers['X-Cinder-Suppress-Interactive'], '1');
  assert.equal(h.browserCalls[0].options.headers['X-Cinder-Visible-Layout'], '1');
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(c => c.url === endpoint && c.options.method === 'POST'));
  assert.equal(new URLSearchParams(h.calls[1].options.body).get('id'), 'new-server');
});

test('refresh cannot switch to a different book in the same format', async () => {
  const h = harness({ fetch: async () => ({ status: 403, data: challenge }), browser: async () => ok(formHtml('Other.epub')) });
  await assert.rejects(h.source._resolveOceanForm(selected, page), /no longer offers/);
  assert.equal(h.calls.length, 1);
});

test('persistent challenge stops after one refresh with actionable error, not a download at 0 percent', async () => {
  const h = harness({ fetch: async () => ({ status: 403, data: challenge }) });
  await assert.rejects(h.source._resolveOceanForm(selected, page), /Verify Website/);
  assert.equal(h.calls.length, 2);
  assert.equal(h.browserCalls.length, 1);
});

test('an unsupported old host still reports verification requirement without calling missing APIs', async () => {
  const h = harness({ fetch: async () => ({ status: 403, data: challenge }) }); delete h.cinder.fetchBrowser;
  await assert.rejects(h.source._resolveOceanForm(selected, page), /Verify Website/);
  assert.equal(h.calls.length, 1);
});

test('empty/server failure response does not loop browser requests or return HTML as an ebook', async () => {
  const h = harness({ fetch: async () => ({ status: 503, data: 'busy' }) });
  await assert.rejects(h.source._resolveOceanForm(selected, page), /valid link/);
  assert.equal(h.calls.length, 1); assert.equal(h.browserCalls.length, 0);
  assert.equal(JSON.stringify(h.warnings).includes(filename), false);
});

test('missing selected format does not silently download the other format', async () => {
  const h = harness(); h.source._fetchPage = async () => ok(formHtml());
  await assert.rejects(h.source.resolve({ url: page, format: 'pdf' }), /form was not found/);
  assert.equal(h.calls.length, 0);
});

test('unexpected form endpoint is rejected before sending any fields', async () => {
  const h = harness();
  await assert.rejects(h.source._resolveOceanForm({ ...selected, endpoint: 'https://other.example/Fetching_Resource.php' }, page), /unexpected download form/);
  assert.equal(h.calls.length, 0);
});

test('actual browser UA reaches the detail GET, form POST, and final file GET headers', async () => {
  const ua = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36';
  const h = harness({ fetch: async url => url === page ? ok(formHtml()) : ok(meta()) });
  let probes = 0;
  h.cinder.executeBrowserScript = async context => {
    probes++;
    assert.equal(context.source.userAgent, undefined);
    assert.equal(context.source.loadCSS, false); assert.equal(context.source.loadImages, false);
    assert.deepEqual(plain(context.storage), { cookies: [] });
    assert.equal(context.inject, "String(navigator.userAgent || '')");
    return { result: ua };
  };
  // Use real microtasks for the probe; don't expire its safety timer immediately.
  const result = await h.source.resolve({ url: page, format: 'epub' });
  assert.equal(result.headers['User-Agent'], ua);
  assert.ok(h.calls.every(c => c.options.headers['User-Agent'] === ua));
  assert.equal(probes, 1);
  await h.source.resolve({ url: page, format: 'epub' });
  assert.equal(probes, 1);
});

test('legacy host without UA probe keeps the established iOS identity on final download', async () => {
  const h = harness();
  const r = await h.source._resolveOceanForm(selected, page);
  assert.equal(r.headers['User-Agent'], h.source._LEGACY_USER_AGENT);
});

for(const ua of [undefined, {}, '', 'x', 'Mozilla/5.0\r\nInjected: bad', 'x'.repeat(1025)]) {
  test('invalid browser identity is never put in a request header: ' + typeof ua + '/' + String(ua).length, async () => {
    const h = harness(); h.cinder.executeBrowserScript = async () => ({ result: ua });
    assert.equal(await h.source._getBrowserUserAgent(page), h.source._LEGACY_USER_AGENT);
    assert.equal(h.source._browserUserAgent, '');
  });
}

test('failed UA probe is optional and may be retried later', async () => {
  const h = harness(); let count = 0;
  h.cinder.executeBrowserScript = async () => { count++; throw Error('unavailable'); };
  assert.equal(await h.source._getBrowserUserAgent(page), h.source._LEGACY_USER_AGENT);
  await new Promise(resolve => setImmediate(resolve));
  await h.source._getBrowserUserAgent(page);
  assert.equal(count, 2);
});

test('overlapping UA probes coalesce and late results update the next request without new network work', async () => {
  const h = harness(); let count = 0, finish;
  h.cinder.executeBrowserScript = () => { count++; return new Promise(r => { finish = r; }); };
  const results = await Promise.all([h.source._getBrowserUserAgent(page), h.source._getBrowserUserAgent(page)]);
  assert.ok(results.every(ua => ua === h.source._LEGACY_USER_AGENT));
  assert.equal(count, 1);
  finish({ result: 'Mozilla/5.0 Chromium test browser' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await h.source._getBrowserUserAgent(page), 'Mozilla/5.0 Chromium test browser');
  assert.equal(h.calls.length, 0); assert.equal(h.browserCalls.length, 0);
});

test('only parent-zone clearance reaches an exact Ocean file host, with fresh page snapshot preferred', async () => {
  const h = harness(), lookups = [];
  const url = target.replace('files.example', 'fs3.oceanofpdf.com');
  h.cinder.getBrowserSessionHeaders = async key => { lookups.push(key); return key === page
    ? { Cookie: 'wordpress_login=private; cf_clearance=fresh; _ga=analytics', Authorization: 'private' }
    : { Cookie: 'cf_clearance=stale' }; };
  assert.deepEqual(plain(await h.source._fileHeaders(url, page, endpoint, 'Test Browser UA')), {
    Referer: endpoint, 'User-Agent': 'Test Browser UA', Cookie: 'cf_clearance=fresh',
  });
  assert.deepEqual(lookups, [page]);
});

test('a captured exact file-origin session can supply clearance when parent session has none', async () => {
  const h = harness(), url = target.replace('files.example', 'fs5.oceanofpdf.com');
  h.cinder.getBrowserSessionHeaders = async key => key === url ? { cookie: 'cf_clearance=file-session; tracking=x' } : {};
  assert.equal((await h.source._fileHeaders(url, page, endpoint, 'Test UA')).Cookie, 'cf_clearance=file-session');
});

for(const host of ['files.example', 'oceanofpdf.com.evil.example', 'fs3.oceanofpdf.com.evil.example',
  'fs3.oceanofpdf.com:8443', 'fs3.oceanofpdf.com@evil.example', 'evil.example@fs3.oceanofpdf.com',
  'not-a-file-host.oceanofpdf.com', 'fs3.oceanofpdf.com.']) {
  test('never shares clearance with unapproved redirect host ' + host, async () => {
    const h = harness(); h.cinder.getBrowserSessionHeaders = async () => { throw Error('Must not look up cookies'); };
    assert.equal((await h.source._fileHeaders(target.replace('files.example', host), page, endpoint, 'Test UA')).Cookie, undefined);
  });
}

test('HTTP file links never receive clearance', async () => {
  const h = harness(); h.cinder.getBrowserSessionHeaders = async () => ({ Cookie: 'cf_clearance=secret' });
  assert.equal((await h.source._fileHeaders('http://fs3.oceanofpdf.com/a.epub', page, endpoint, 'Test UA')).Cookie, undefined);
});

for(const cookie of ['', 'other=x', 'cf_clearance=', 'cf_clearance=one; cf_clearance=two',
  'cf_clearance=secret\r\nInjected: value', 'cf_clearance=contains space', 'cf_clearance=one,cf_clearance=two', 'x'.repeat(65537)]) {
  test('rejects malformed or ambiguous clearance header of length ' + cookie.length, () => {
    assert.equal(harness().source._clearanceCookie({ Cookie: cookie }), '');
  });
}

test('missing session API remains backward compatible without exposing other credentials', async () => {
  const h = harness();
  const headers = await h.source._fileHeaders(target.replace('files.example', 'fs3.oceanofpdf.com'), page, endpoint, 'Test UA');
  assert.deepEqual(plain(headers), { Referer: endpoint, 'User-Agent': 'Test UA' });
});
