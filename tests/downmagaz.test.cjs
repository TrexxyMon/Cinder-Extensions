const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const app = process.env.CINDER_APP || [path.resolve(root, '../cinder'), path.resolve(root, '../..')]
  .find(dir => fs.existsSync(path.join(dir, 'src/extensions/HTMLParser.ts')));
if (!app) throw new Error('Set CINDER_APP to the Cinder checkout to test its real HTML parser.');
const appRequire = createRequire(path.join(app, 'package.json'));
const ts = appRequire('typescript');
const parser = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(app, 'src/extensions/HTMLParser.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: parser.exports, require: appRequire });
const script = fs.readFileSync(process.env.DOWNMAGAZ_SOURCE || path.join(root, 'downmagaz_device.js'), 'utf8');
const page = 'https://downmagaz.net/comics_magazine/487698-commando-no-6000.html';
const shortcut = 'https://dwp.la/d/hLZ';
const canonical = 'https://downup.me/ct75flrfkwsa/Commando_-_No._6000_downmagaz.net.pdf.html';
const item = Object.freeze({ title: 'Commando', url: page, extra: Object.freeze({ articleUrl: page }) });
const ok = (data, extra = {}) => ({ status: 200, data, headers: {}, ...extra });
const article = (links = [shortcut]) => '<html><head><meta property="og:title" content="Commando - No. 6000"></head>'
  + '<body><div class="fullstory"><div class="full-text">'
  + links.map(url => '<a href="' + url + '">Download</a>').join('') + '</div></div></body></html>';
const plain = value => JSON.parse(JSON.stringify(value));

function load(options = {}) {
  const calls = [];
  const cinder = {
    parseHTML: parser.exports.parseHTML,
    normalizeText: value => String(value || '').trim(),
    resolveUrl: (url, base) => new URL(url, base).href,
    fetch: async (url, request) => {
      calls.push({ url, request });
      if (url === page) return ok(article(options.links));
      return options.host ? options.host(url, request) : ok('', { url: canonical });
    },
    fetchBrowser: async () => { throw Error('No browser work expected'); },
    log() {}, warn() {},
  };
  const context = vm.createContext({ cinder });
  vm.runInContext(script, context);
  return { source: context.__cinderExport, calls };
}

test('Commando 6000 resolves the shortcut with GET and sends the actual file page first', async () => {
  const h = load({ links: ['https://nfile.cc/jR70nbvQ', shortcut], host: (url, request) => {
    assert.equal(url, shortcut);
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.Referer, page);
    assert.equal(request.timeout, 8000);
    return ok('', { url: canonical });
  } });
  const result = await h.source.resolve(item);
  assert.equal(result.debridLink, canonical);
  assert.deepEqual(plain(result.debridLinks), [canonical, shortcut]);
  assert.equal(result.debridProvider, 'debridlink');
  assert.equal(result.fileName, 'Commando - No. 6000.pdf');
  assert.equal(result.url, undefined, 'A .pdf.html landing page is not a PDF download');
  assert.deepEqual(h.calls.map(call => call.url), [page, shortcut]);
  assert.equal(item.title, 'Commando');
});

test('old clients without a final response URL use the matching download forms', async () => {
  const forms = '<form method="POST" action="' + canonical + '"></form>';
  const h = load({ host: () => ok(forms + forms) });
  assert.equal((await h.source.resolve(item)).debridLink, canonical);
  assert.equal(h.calls.length, 2);
});

test('canonical URL already present in the article is not duplicated', async () => {
  const h = load({ links: [shortcut, canonical] });
  assert.deepEqual(plain((await h.source.resolve(item)).debridLinks), [canonical, shortcut]);
});

test('a shortcut file landing page ending in .pdf still goes through Debrid-Link', async () => {
  const landing = canonical.replace(/\.html$/, '');
  const h = load({ host: () => ok('<html>Download options</html>', {
    url: landing, headers: { 'content-type': 'text/html' },
  }) });
  const result = await h.source.resolve(item);
  assert.equal(result.debridLink, landing);
  assert.equal(result.url, undefined);
  assert.equal(h.calls.length, 2);
});

for (const [label, response] of [
  ['homepage', ok('<html>Home</html>', { url: 'https://downup.me/' })],
  ['login page', ok('', { url: 'https://downup.me/login' })],
  ['HTTP failure', { status: 503, data: '', url: canonical }],
  ['network failure', { status: 0, data: '' }],
  ['lookalike host', ok('', { url: canonical.replace('downup.me', 'downup.me.example') })],
  ['untrusted redirect with a file form', ok('<form action="' + canonical + '"></form>', { url: 'https://other.example/' })],
  ['ambiguous forms', ok('<form action="' + canonical + '"></form><form action="https://downup.me/abcdefghijkl/Other.pdf.html"></form>')],
  ['only non-file forms', ok('<form action="https://downup.me/login"></form>')],
]) {
  test('retains the original shortcut after ' + label + ' without a HEAD retry', async () => {
    const h = load({ host: () => response });
    const result = await h.source.resolve(item);
    assert.equal(result.debridLink, shortcut);
    assert.deepEqual(plain(result.debridLinks), [shortcut]);
    assert.equal(result.url, undefined);
    assert.equal(h.calls.length, 2);
  });
}

test('a thrown shortcut timeout preserves provider fallback', async () => {
  const h = load({ host: () => { throw Error('Timed out'); } });
  assert.equal((await h.source.resolve(item)).debridLink, shortcut);
  assert.equal(h.calls.length, 2);
});

test('existing full Downup links keep their current route with no shortcut request', async () => {
  const h = load({ links: [canonical], host: (url, request) => {
    assert.equal(url, canonical);
    assert.equal(request.method, 'HEAD');
    return ok('', { headers: { 'content-type': 'text/html' } });
  } });
  const result = await h.source.resolve(item);
  assert.equal(result.debridLink, canonical);
  assert.deepEqual(plain(result.debridLinks), [canonical]);
  assert.equal(result.url, undefined);
  assert.equal(h.calls.length, 2);
});

test('direct file links do not acquire an extra network request', async () => {
  const direct = 'https://files.example/issue.pdf?key=fixture';
  const h = load({ links: [direct] });
  const result = await h.source.resolve(item);
  assert.equal(result.url, direct);
  assert.equal(h.calls.length, 1);
});

test('an HTTP error with PDF headers is not treated as a direct file', async () => {
  const h = load({ links: ['https://files.example/download'], host: () => ({
    status: 404, data: '', headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename=error.pdf' },
  }) });
  assert.equal((await h.source.resolve(item)).url, undefined);
});

test('Downup ranking matches the hostname, not a substring in another URL', () => {
  const h = load();
  const noise = ['https://downup.me.example/ad', 'https://other.example/downup.me', 'https://dwp.la.example/d/test'];
  assert.deepEqual(plain(h.source._debridLinkCandidates([...noise, shortcut])), [shortcut]);
});
