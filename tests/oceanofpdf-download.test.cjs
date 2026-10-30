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
  assert.deepEqual(plain(result), { url: target, fileName: filename, headers: { Referer: endpoint } });
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
  assert.deepEqual(plain(result.headers), { Referer: endpoint });
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
