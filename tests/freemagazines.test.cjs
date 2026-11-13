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
const script = fs.readFileSync(process.env.FREEMAGAZINES_SOURCE || path.join(root, 'freemagazines.js'), 'utf8');
const BASE = 'https://freemagazines.top';
const page = BASE + '/example-magazine-november-2026';
const host = 'https://easyupload.us/ExampleFile123/preview';
const title = 'Example Magazine – November 2026';
const item = Object.freeze({ id: page, url: page, title, format: 'pdf', extra: Object.freeze({ articleUrl: page }) });
const ok = data => ({ status: 200, data, headers: {} });
const article = content => `<article><div class="entry-content"><h1 class="wp-block-heading">${title}</h1>${content}</div></article>`;
const link = (href = host, text = 'Download PDF') => `<p class="wp-block-paragraph"><a href="${href}" target="_blank" rel="noopener">${text}</a></p>`;
const plain = value => JSON.parse(JSON.stringify(value));

function load(overrides = {}) {
  const calls = [], browserCalls = [];
  const cinder = {
    parseHTML: parser.exports.parseHTML,
    resolveUrl: (url, base) => new URL(url, base).href,
    fetch: async (url, options) => { calls.push({ url, options }); return overrides.fetch ? overrides.fetch(url, options) : ok(article(link())); },
    fetchBrowser: async (url, options) => { browserCalls.push({ url, options }); return overrides.browser ? overrides.browser(url, options) : ok(article(link())); },
    log() {}, warn() {},
  };
  const context = vm.createContext({ cinder });
  vm.runInContext(script, context);
  return { source: context.__cinderExport, calls, browserCalls };
}

test('current WordPress Download PDF resolves without browser-rendering or probing the host', async () => {
  const h = load();
  const result = await h.source.resolve(item);
  assert.equal(result.url, host);
  assert.equal(result.fileName, title + '.pdf');
  assert.equal(result.headers.Referer, page);
  assert.equal(result.headers['X-Cinder-Expect-Interstitial'], '1');
  assert.deepEqual(plain(result.downloadRequest), {
    method: 'GET', useBrowser: true, browserClickDownload: true, browserCaptureBlob: true, browserMaxWaitMs: 90000,
  });
  assert.deepEqual(h.calls.map(call => call.url), [page]);
  assert.equal(h.browserCalls.length, 0);
  assert.equal(item.extra.articleUrl, page);
});

test('a catalog search result goes through the same resolver used by Search Downloads', async () => {
  const h = load({ fetch: url => ok(url.includes('?s=')
    ? `<article><h2 class="entry-title"><a href="${page}">${title}</a></h2><img src="/cover.webp"></article>`
    : article(link())) });
  const results = await h.source.search(title, 0);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, title);
  assert.equal(results[0].format, 'pdf');
  assert.equal(results[0].extra.articleUrl, page);
  assert.equal((await h.source.resolve(results[0])).url, host);
});

for (const [name, href, label, expected] of [
  ['nested button label', host, '<span>Download</span> <strong>PDF</strong>', host],
  ['new host with signed query', '//files.example/issue?key=a&amp;part=2', 'Download PDF', 'https://files.example/issue?key=a&part=2'],
  ['direct PDF', '/files/issue.pdf?key=a&amp;part=2', 'Download PDF', BASE + '/files/issue.pdf?key=a&part=2'],
]) {
  test('article link supports ' + name, async () => {
    const h = load({ fetch: () => ok(article(link(href, label))) });
    const result = await h.source.resolve(item);
    assert.equal(result.url, expected);
    assert.equal(result.headers.Referer, page);
    assert.equal(result.downloadRequest?.useBrowser, name === 'direct PDF' ? undefined : true);
    assert.equal(h.browserCalls.length, 0);
  });
}

test('article-only markup still exposes its download link', async () => {
  const h = load({ fetch: () => ok('<article>' + link() + '</article>') });
  assert.equal((await h.source.resolve(item)).url, host);
});

test('browser-rendered article uses the same plain-link extraction', async () => {
  const h = load({ fetch: () => ok(article('<p>Loading download link…</p>')) });
  assert.equal((await h.source.resolve(item)).url, host);
  assert.deepEqual(h.browserCalls.map(call => call.url), [page]);
});

test('ignores navigation, sidebar, comments, non-download links and placeholder controls', async () => {
  const noise = '<nav>' + link('https://unrelated.example/app') + '</nav>'
    + '<aside>' + link('https://unrelated.example/advert') + '</aside>'
    + '<div id="comments">' + link('https://unrelated.example/comment') + '</div>';
  const inside = link('https://unrelated.example/reader', 'PDF reader')
    + link('https://unrelated.example/app', 'Download App')
    + link('#', 'Download PDF') + link('javascript:void(0)', 'Download PDF')
    + link('data:text/html,bad', 'Download PDF') + link(page + '#download', 'Download PDF')
    + link();
  const h = load({ fetch: () => ok(noise + article(inside)) });
  assert.equal((await h.source.resolve(item)).url, host);
});

test('missing download links still fail instead of returning an arbitrary site URL', async () => {
  const html = '<nav>' + link() + '</nav>' + article(link('#') + link('javascript:void(0)'));
  const h = load({ fetch: () => ok(html), browser: () => ok(html) });
  await assert.rejects(h.source.resolve(item), /No download link found/);
  assert.equal(h.browserCalls.length, 1);
});

for (const gateway of [false, true]) {
  test('preserves legacy LimeWire ' + (gateway ? 'gateway' : 'anchor') + ' links and browser capture', async () => {
    const lime = 'https://limewire.com/d/AbC123#secret';
    const href = gateway ? BASE + '/?download_gateway=' + Buffer.from(lime).toString('base64') : lime;
    const h = load({ fetch: url => ok(url === page ? article(link(href)) : '<html>File available</html>') });
    const result = await h.source.resolve(item);
    assert.equal(result.url, lime);
    assert.equal(result.downloadRequest.browserIgnoreNativeDownloadUrl, true);
    assert.deepEqual(h.calls.map(call => call.url), [page, lime]);
    assert.equal(h.browserCalls.length, 0);
  });
}

for (const url of [host, 'https://files.example/issue.pdf']) {
  test('preserves WordPress masked download lookup for ' + new URL(url).hostname, async () => {
    const h = load({ fetch: target => target === page
      ? ok(article('<a id="lw-vk-js-trigger" data-key="dl_key_fixture" href="#">Download PDF</a>'))
      : ok(JSON.stringify({ success: true, data: { url } })) });
    const result = await h.source.resolve(item);
    assert.equal(result.url, url);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].url, BASE + '/wp-admin/admin-ajax.php');
    assert.equal(h.calls[1].options.body, 'action=get_masked_download&download_key=dl_key_fixture');
    assert.equal(h.calls[1].options.headers.Referer, page);
    assert.equal(h.browserCalls.length, 0);
  });
}
