const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const app = process.env.CINDER_APP || [path.resolve(root, '../cinder'), path.resolve(root, '../..')]
  .find(dir => fs.existsSync(path.join(dir, 'src/extensions/HTMLParser.ts')));
if (!app) throw new Error('Set CINDER_APP to the Cinder checkout to test its real HTML parser.');
const appRequire = createRequire(path.join(app, 'package.json'));
const ts = appRequire('typescript');
let parserSource;
if (process.env.GOLDEN_PARSER_REV || process.env.ABB_PARSER_REV) {
  const revision = process.env.GOLDEN_PARSER_REV || process.env.ABB_PARSER_REV;
  assert.match(revision, /^[a-f0-9]{7,40}$/);
  parserSource = execFileSync('git', ['show', revision + ':src/extensions/HTMLParser.ts'], { cwd: app, encoding: 'utf8' });
} else parserSource = fs.readFileSync(path.join(app, 'src/extensions/HTMLParser.ts'), 'utf8');
const parser = { exports: {} };
vm.runInNewContext(ts.transpileModule(parserSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
  { exports: parser.exports, require: appRequire });
const script = fs.readFileSync(path.join(root, 'goldenaudiobooks.js'), 'utf8');
const BASE = 'https://goldenaudiobooks.com';
const ID = '/example-author-example-book-audiobook/';
const TRACK_BASE = 'https://ipaudio.club/wp-content/uploads/GOLN/Example%20Book/';
const plain = value => JSON.parse(JSON.stringify(value));
const response = (data, url) => ({ status: 200, data, headers: {}, ...(url ? { url } : {}) });
function compileAppModule(relative, dependencies = {}) {
  const source = fs.readFileSync(path.join(app, relative), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: module.exports, require: name => { if (!(name in dependencies)) throw new Error('Unexpected test dependency: ' + name); return dependencies[name]; }, URL });
  return module.exports;
}
// Exercise the real host validation/order code. The full preference module has
// unrelated reader imports; compile its exact audioFormat function in isolation.
const audioModelSource = fs.readFileSync(path.join(app, 'src/audio/model.ts'), 'utf8');
const formatSource = 'export const AUDIO_FORMATS = ["mp3", "m4a", "m4b", "flac", "wav"] as const;\n' +
  audioModelSource.slice(audioModelSource.indexOf('export function audioFormat('), audioModelSource.indexOf('export function isAudiobook('));
const formatModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(formatSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: formatModule.exports });
const downloadModel = compileAppModule('src/audio/downloadModel.ts', {
  './model': formatModule.exports,
  '../utils/contentClassification': { getCanonicalContentTypes: () => [] },
  './archiveVolumes': compileAppModule('src/audio/archiveVolumes.ts'),
  '../downloads/downloadFileName': compileAppModule('src/downloads/downloadFileName.ts'),
});
function listing(id = ID, title = 'Example Author – Example Book Audiobook') {
  return `<article><div class="post-cover"><a href="${BASE}${id}"><img src="${BASE}/wp-content/uploads/cover.jpg"></a></div>
  <div class="post-preview"><span class="post-meta-category"><a rel="category tag" href="/category/fiction/">Fiction</a></span>
  <h2 class="title-post"><a href="${BASE}${id}" rel="bookmark">${title}</a></h2>
  <time class="entry-date published" datetime="2026-11-01T10:00:00+00:00">Recently</time></div></article>`;
}
function searchPage(body = listing(), query = 'example') {
  return `<!doctype html><html><head><meta property="og:title" content="You searched for ${query} - Goldenaudiobooks">
  <meta property="og:url" content="${BASE}/search/${encodeURIComponent(query)}/"></head><body>${body}</body></html>`;
}
function audio(name = '01.mp3', query = '_=1') {
  const url = TRACK_BASE + name;
  return `<audio class="wp-audio-shortcode" src="${url}${query ? '?' + query : ''}"><source type="audio/mpeg" src="${url}${query ? '?' + query : ''}"><a href="${url}">Audio file</a></audio>`;
}
function detail(body = audio('01.mp3') + audio('02.mp3'), { id = ID, title = 'Example Author – Example Book Audiobook', canonical = BASE + id } = {}) {
  return `<!doctype html><html><head><link rel="canonical" href="${canonical}"><meta property="og:type" content="article">
  <meta property="og:title" content="${title} - Goldenaudiobooks"><meta name="author" content="Site Uploader">
  <meta property="og:image" content="${BASE}/wp-content/uploads/cover-large.jpg"></head><body>
  <h1 class="title-page">${title}</h1><div class="post-single"><figure><img src="${BASE}/wp-content/uploads/cover-large.jpg"></figure>
  <p>A synthetic description written for this regression test.</p>${body}</div></body></html>`;
}
function load(options = {}) {
  const requests = [], sessions = [];
  const fetcher = async (url, opts, browser) => {
    requests.push({ url, opts, browser: !!browser });
    return options.fetch ? options.fetch(url, opts, browser) : response(url.includes(ID) ? detail() : searchPage());
  };
  const api = { parseHTML: parser.exports.parseHTML,
    resolveUrl: (url, base) => new URL(url, base).href,
    normalizeText: text => parser.exports.parseHTML(`<span>${text}</span>`).text().trim(),
    store: { get: async key => options.settings?.[key] ?? null, set: async () => {}, delete: async () => {} },
    getBrowserSessionHeaders: async url => { sessions.push(url); return {}; },
    fetch: (url, opts) => fetcher(url, opts, false) };
  if (options.browser) api.fetchBrowser = (url, opts) => fetcher(url, opts, true);
  if (options.legacy) { delete api.resolveUrl; delete api.getBrowserSessionHeaders; }
  const context = vm.createContext({ cinder: api });
  vm.runInContext(script, context);
  return { source: context.__cinderExport, requests, sessions };
}

test('search preserves source ordering, all results, actual metadata and unique identities without detail fan-out', async () => {
  const body = listing('/z-audiobook/', 'Z Author – Z Title Audiobook') + listing('/a-audiobook/', 'A Author – A &amp; B Audiobook') + listing('/z-audiobook/');
  const h = load({ fetch: async () => response(searchPage(body)) });
  const items = await h.source.search('Example', 1);
  assert.equal(items.length, 2); assert.equal(h.requests.length, 1);
  assert.equal(items[0].title, 'Z Title'); assert.equal(items[1].title, 'A & B');
  assert.equal(items[0].author, 'Z Author'); assert.equal(items[0].contentType, 'audiobooks');
  assert.equal(items[0].cover, BASE + '/wp-content/uploads/cover.jpg');
  assert.ok(items.every(item => item.size === undefined && item.duration === undefined));
});

test('search returns more than five or ten results without an artificial result cap', async () => {
  const body = Array.from({ length: 15 }, (_, i) => listing(`/item-${i}-audiobook/`, `Author – Title ${i} Audiobook`)).join('');
  const h = load({ fetch: async () => response(searchPage(body)) });
  assert.equal((await h.source.search('Example')).length, 15);
});

test('search pagination keeps the complete escaped query and does not fetch subsequent pages itself', async () => {
  const h = load(); await h.source.search('Jane & Austen', 2);
  assert.equal(h.requests.length, 1);
  const target = new URL(h.requests[0].url);
  assert.equal(target.pathname, '/page/2/');
  assert.equal(target.searchParams.get('s').toLowerCase(), 'jane & austen');
});

test('an out-of-range page stops pagination instead of repeatedly fetching the final allowed page', async () => {
  const h = load();
  assert.equal((await h.source.search('Example', 501)).length, 0); assert.equal(h.requests.length, 0);
});

test('external/category article links cannot become book records', async () => {
  const body = listing() + listing('/category/fiction/') + listing('/bad-audiobook/').replaceAll(BASE + '/bad-audiobook/', 'https://unrelated.example/book/');
  const h = load({ fetch: async () => response(searchPage(body)) });
  const items = await h.source.search('Example');
  assert.equal(items.length, 1); assert.equal(new URL(items[0].url || items[0].id, BASE).pathname, ID);
});

test('details use the book heading and cover, never the site uploader as author', async () => {
  const h = load(); const item = await h.source.getBookDetails(ID);
  assert.equal(item.title, 'Example Book'); assert.equal(item.author, 'Example Author');
  assert.equal(item.cover, BASE + '/wp-content/uploads/cover-large.jpg');
  assert.match(item.description || '', /synthetic description/);
  assert.equal(item.size, undefined); assert.equal(item.duration, undefined);
});

test('titles without an author prefix keep the complete title and do not invent an author', async () => {
  const h = load({ fetch: async () => response(detail(audio(), { title: 'The Entire Long Book Title Audiobook' })) });
  const item = await h.source.getBookDetails(ID);
  assert.equal(item.title, 'The Entire Long Book Title'); assert.ok(!item.author || item.author !== 'Site Uploader');
});

test('resolution returns every track exactly once in DOM order, not alphabetical URL order', async () => {
  const names = ['z-introduction.mp3', '01.mp3', '02.mp3', '10.mp3', '03.mp3'];
  const h = load({ fetch: async () => response(detail(names.map(name => audio(name)).join(''))) });
  const result = await h.source.resolve({ id: ID });
  assert.equal(result.audioFiles.length, names.length); assert.equal(h.requests.length, 1);
  assert.deepEqual(Array.from(result.audioFiles, file => new URL(file.url).pathname.split('/').pop()), names);
  assert.equal(new Set(result.audioFiles.map(file => file.name)).size, names.length);
  assert.ok(result.audioFiles.every(file => file.size === undefined && file.duration === undefined && !file.headers));
  assert.equal(result.debridLink, undefined); assert.equal(result.debridLinks, undefined);
  assert.deepEqual(Array.from(result.audioFiles, file => file.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), Array.from(result.audioFiles, file => file.name));
  assert.equal(downloadModel.validateAudioDownloads(result.audioFiles), true);
  assert.equal(downloadModel.normalizeResolvedAudioDownload(result).url, result.audioFiles[0].url);
  assert.deepEqual(plain(downloadModel.audioSourceGroups(result.audioFiles)[0].files), plain(result.audioFiles));
});

test('nested audio/src/source/fallback anchors represent one track, with cache query ignored for deduplication', async () => {
  const h = load({ fetch: async () => response(detail(audio('01.mp3', '_=1') + audio('01.mp3', '_=99') + audio('02.mp3', '_=2'))) });
  const result = await h.source.resolve({ id: ID });
  assert.equal(result.audioFiles.length, 2);
  assert.ok(result.audioFiles.every(file => new URL(file.url).searchParams.get('_') === null));
});

test('track-only source elements and fallback links inside audio are supported', async () => {
  const body = `<audio><source src="${TRACK_BASE}first.mp3" type="audio/mpeg"></audio><audio><a href="${TRACK_BASE}second.mp3">Download</a></audio>`;
  const h = load({ fetch: async () => response(detail(body)) });
  const result = await h.source.resolve({ id: ID });
  assert.equal(result.audioFiles.length, 2);
  assert.match(result.audioFiles[0].url, /first\.mp3$/); assert.match(result.audioFiles[1].url, /second\.mp3$/);
});

test('alternative encodings within one audio element never become extra sequential tracks', async () => {
  const body = `<audio src="${TRACK_BASE}primary.mp3"><source src="${TRACK_BASE}alternate.m4a"><a href="${TRACK_BASE}primary.mp3">Download</a></audio>`;
  const h = load({ fetch: async () => response(detail(body)) });
  const result = await h.source.resolve({ id: ID });
  assert.equal(result.audioFiles.length, 1); assert.match(result.audioFiles[0].url, /primary\.mp3$/);
});

test('generic links and other-book relnext are not appended to the track list', async () => {
  const body = audio() + `<a href="https://ads.example/sample.mp3">Ad</a><nav class="post-navigation"><a rel="next" href="${BASE}/a-different-book/">Next book</a></nav>`;
  const h = load({ fetch: async () => response(detail(body)) });
  const result = await h.source.resolve({ id: ID });
  assert.equal(result.audioFiles.length, 1); assert.equal(h.requests.length, 1);
});

test('multipart books follow only numeric pages of the same book and retain the complete track order', async () => {
  const h = load({ fetch: async url => {
    const page = new URL(url).pathname;
    if (page === ID) return response(detail(audio('z-intro.mp3') + `<div class="page-links"><a class="post-page-numbers" href="${BASE}${ID}2/">2</a><a class="post-page-numbers" href="${BASE}${ID}3/">3</a></div>`).replace('</head>', `<link rel="next" href="${BASE}${ID}2/"></head>`));
    if (page === ID + '2/') return response(detail(audio('01.mp3') + audio('02.mp3'), { id: ID + '2/' }).replace('</head>', `<link rel="next" href="${BASE}${ID}3/"></head>`));
    if (page === ID + '3/') return response(detail(audio('02.mp3', '_=900') + audio('03.mp3') + `<nav class="post-navigation"><a rel="next" href="${BASE}/different-book/">Next</a></nav>`, { id: ID + '3/' }));
    throw new Error('Unexpected request: ' + url);
  } });
  const result = await h.source.resolve({ id: ID });
  assert.deepEqual(Array.from(result.audioFiles, file => new URL(file.url).pathname.split('/').pop()), ['z-intro.mp3', '01.mp3', '02.mp3', '03.mp3']);
  assert.deepEqual(h.requests.map(request => new URL(request.url).pathname), [ID, ID + '2/', ID + '3/']);
  assert.deepEqual(plain(downloadModel.audioSourceGroups(result.audioFiles)[0].files), plain(result.audioFiles));
});

test('opening a later content-part link starts with the first part instead of returning a partial book', async () => {
  const h = load({ fetch: async url => {
    const page = new URL(url).pathname;
    return response(detail(audio(page === ID ? '01.mp3' : '02.mp3'), { id: page }).replace('</head>', page === ID ? `<link rel="next" href="${BASE}${ID}2/"></head>` : '</head>'));
  } });
  const result = await h.source.resolve({ id: ID + '2/' });
  assert.equal(result.audioFiles.length, 2); assert.equal(new URL(h.requests[0].url).pathname, ID);
});

test('digits at the end of a book slug are part of its identity, not a content-page number', async () => {
  const id = '/example-book-7/';
  const h = load({ fetch: async () => response(detail(audio(), { id })) });
  const result = await h.source.resolve({ id });
  assert.equal(new URL(h.requests[0].url).pathname, id); assert.equal(result.audioFiles.length, 1);
});

test('failure of a later content part rejects the entire resolution without publishing an incomplete track list', async () => {
  const h = load({ fetch: async url => new URL(url).pathname === ID
    ? response(detail(audio()).replace('</head>', `<link rel="next" href="${BASE}${ID}2/"></head>`))
    : { status: 404, data: '<h1>Not found</h1>', headers: {} } });
  await assert.rejects(h.source.resolve({ id: ID }));
  assert.equal(h.requests.length, 2);
});

test('a looping content continuation does not duplicate tracks or fetch indefinitely', async () => {
  const h = load({ fetch: async url => {
    const page = new URL(url).pathname;
    return response(detail(audio(page === ID ? '01.mp3' : '02.mp3'), { id: page }).replace('</head>', `<link rel="next" href="${BASE}${page === ID ? ID + '2/' : ID}"></head>`));
  } });
  const result = await h.source.resolve({ id: ID });
  assert.equal(result.audioFiles.length, 2); assert.equal(h.requests.length, 2);
});

test('unsupported player HTML, iframe and HLS do not pretend to be a downloadable audio file', async () => {
  for (const body of [`<iframe src="https://player.example/book"></iframe>`, `<audio src="${TRACK_BASE}book.m3u8"></audio>`, `<audio src="${BASE}/player.html"></audio>`]) {
    const h = load({ fetch: async () => response(detail(body)) });
    await assert.rejects(h.source.resolve({ id: ID }));
    assert.equal(h.requests.length, 1);
  }
});

test('a mixed supported/unsupported player list is rejected rather than silently downloading an incomplete book', async () => {
  const h = load({ fetch: async () => response(detail(audio() + `<audio src="${TRACK_BASE}part-2.m3u8"></audio>`)) });
  await assert.rejects(h.source.resolve({ id: ID }));
});

test('unsafe file URLs never reach the returned audioFiles', async () => {
  for (const url of ['javascript:alert(1)', 'file:///private/book.mp3', 'data:audio/mp3;base64,AAA', 'https://user:password@cdn.example/book.mp3']) {
    const h = load({ fetch: async () => response(detail(`<audio src="${url}"></audio>`)) });
    await assert.rejects(h.source.resolve({ id: ID }));
  }
});

test('external book input is rejected before fetching or trusting extra data', async () => {
  const h = load();
  await assert.rejects(h.source.resolve({ id: 'https://unrelated.example/book/', url: 'https://unrelated.example/book/' }));
  assert.equal(h.requests.length, 0);
});

test('a same-site trailing-slash canonical redirect preserves the selected book', async () => {
  const h = load({ fetch: async () => response(detail(), BASE + ID) });
  const result = await h.source.resolve({ id: ID.slice(0, -1) });
  assert.equal(result.audioFiles.length, 2);
});

test('a harmless www canonical alias preserves the same selected book identity', async () => {
  const h = load({ fetch: async () => response(detail(audio(), { canonical: 'https://www.goldenaudiobooks.com' + ID }), 'https://www.goldenaudiobooks.com' + ID) });
  const result = await h.source.resolve({ id: ID });
  assert.equal(result.audioFiles.length, 1);
});

test('a redirect to another site or the homepage is not treated as the selected book', async () => {
  for (const target of ['https://unrelated.example/book/', BASE + '/']) {
    const h = load({ fetch: async () => response(detail(), target) });
    await assert.rejects(h.source.resolve({ id: ID }));
  }
});

test('canonical metadata from a different book cannot silently replace the selected book', async () => {
  const h = load({ fetch: async () => response(detail(audio(), { canonical: BASE + '/other-book/' })) });
  await assert.rejects(h.source.resolve({ id: ID }));
});

test('details and resolve coalesce their selected-page fetch without result mutation poisoning the cache', async () => {
  const h = load();
  await h.source.getBookDetails(ID);
  const first = await h.source.resolve({ id: ID });
  first.audioFiles[0].name = 'mutated.mp3';
  const second = await h.source.resolve({ id: ID });
  assert.notEqual(second.audioFiles[0].name, 'mutated.mp3');
  assert.equal(h.requests.length, 1);
});

test('simultaneous detail and playback preparation share their one selected-page request', async () => {
  const h = load();
  const [item, resolved] = await Promise.all([h.source.getBookDetails(ID), h.source.resolve({ id: ID })]);
  assert.equal(item.title, 'Example Book'); assert.equal(resolved.audioFiles.length, 2); assert.equal(h.requests.length, 1);
});

test('query cache busters do not change stable names across fresh resolutions', async () => {
  const a = load({ fetch: async () => response(detail(audio('01.mp3', '_=1'))) });
  const b = load({ fetch: async () => response(detail(audio('01.mp3', '_=900'))) });
  assert.deepEqual(plain((await a.source.resolve({ id: ID })).audioFiles), plain((await b.source.resolve({ id: ID })).audioFiles));
});

test('significant query parameters are retained while only the known cache buster is removed', async () => {
  const h = load({ fetch: async () => response(detail(`<audio src="${TRACK_BASE}01.mp3?token=fixture&amp;_=9"></audio>`)) });
  const result = await h.source.resolve({ id: ID });
  const url = new URL(result.audioFiles[0].url);
  assert.equal(url.searchParams.get('token'), 'fixture'); assert.equal(url.searchParams.get('_'), null);
});

test('legacy Cinder parsing remains usable without optional URL/session helpers', async () => {
  const h = load({ legacy: true });
  assert.equal((await h.source.search('Example')).length, 1);
  assert.equal((await h.source.resolve({ id: ID })).audioFiles.length, 2);
});

test('browser challenges never masquerade as empty successful searches', async () => {
  const h = load({ fetch: async () => response('<html><h1>Checking your browser</h1><form>Verify</form></html>') });
  await assert.rejects(h.source.search('Example'));
});

test('parallel hidden-browser fallbacks are serialized rather than cancelling one another', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let active = 0, maxActive = 0;
  const browserUrls = [];
  const h = load({ browser: true, fetch: async (url, options, browser) => {
    if (!browser) return { status: 403, data: '<h1>Checking browser</h1>', headers: {} };
    active++; maxActive = Math.max(maxActive, active); browserUrls.push(url);
    assert.equal(options.headers['X-Cinder-Suppress-Interactive'], '1');
    if (browserUrls.length === 1) await gate;
    active--; return response(searchPage());
  } });
  const first = h.source.getDiscoverItems('bestsellers', 1);
  for (let i = 0; i < 30 && browserUrls.length === 0; i++) await Promise.resolve();
  const second = h.source.search('Example');
  const settled = Promise.allSettled([first, second]);
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(browserUrls.length, 1);
  release();
  const values = await settled;
  assert.ok(values.every(value => value.status === 'fulfilled'), JSON.stringify(values));
  assert.equal(browserUrls.length, 2); assert.equal(maxActive, 1);
});

test('rate limiting prevents browser retries and subsequent immediate requests', async () => {
  const h = load({ browser: true, fetch: async () => ({ status: 429, data: '', headers: { 'Retry-After': '60' } }) });
  await assert.rejects(h.source.search('Example'));
  await assert.rejects(h.source.search('Different'));
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].browser, false);
});

test('a failed browser request releases the queue so the next request and retry can complete', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let browserCalls = 0;
  const h = load({ browser: true, fetch: async (url, options, browser) => {
    if (!browser) return { status: 403, data: '<h1>Checking browser</h1>', headers: {} };
    browserCalls++;
    if (browserCalls === 1) { await gate; throw new Error('Temporary browser failure'); }
    return response(searchPage());
  } });
  const first = h.source.getDiscoverItems('bestsellers', 1);
  for (let i = 0; i < 30 && browserCalls === 0; i++) await Promise.resolve();
  const second = h.source.search('Example');
  const settled = Promise.allSettled([first, second]);
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(browserCalls, 1);
  release();
  const values = await settled;
  assert.equal(values[0].status, 'rejected'); assert.equal(values[1].status, 'fulfilled');
  assert.equal((await h.source.getDiscoverItems('bestsellers', 1)).length, 1);
  assert.equal(browserCalls, 3);
});

test('transient network errors do not cache a failed detail or prevent a later successful resolve', async () => {
  let attempts = 0;
  const h = load({ fetch: async () => {
    attempts++;
    if (attempts === 1) throw new Error('Temporary transport failure');
    return response(detail());
  } });
  await assert.rejects(h.source.resolve({ id: ID }));
  assert.equal((await h.source.resolve({ id: ID })).audioFiles.length, 2);
  assert.equal(h.requests.length, 2);
});

test('a transient detail shell without its audio players is not negatively cached after resolution fails', async () => {
  let attempts = 0;
  const h = load({ fetch: async () => {
    attempts++;
    return response(detail(attempts === 1 ? '<div class="player-loading">Loading player</div>' : audio('01.mp3') + audio('02.mp3')));
  } });
  await assert.rejects(h.source.resolve({ id: ID }));
  assert.equal((await h.source.resolve({ id: ID })).audioFiles.length, 2);
  assert.equal(h.requests.length, 2);
});

test('numeric book slugs remain books rather than being treated as content part numbers', async () => {
  const id = '/1984/';
  const h = load({ fetch: async () => response(detail(audio('01.mp3') + audio('02.mp3'), { id, title: 'George Orwell – 1984' }), BASE + id) });
  const result = await h.source.resolve({ id });
  assert.equal(result.audioFiles.length, 2);
  assert.equal(h.requests.length, 1); assert.equal(new URL(h.requests[0].url).pathname, id);
});

test('discovery advertises verified category feeds and does not pretend the homepage is latest releases', async () => {
  const h = load({ fetch: async () => response(searchPage()) });
  const sections = await h.source.getDiscoverSections();
  assert.deepEqual(plain(sections.map(section => section.id)), ['bestsellers', 'audio-fantasy']);
  for (const section of sections) assert.equal((await h.source.getDiscoverItems(section.id, 1)).length, 1);
  assert.deepEqual(h.requests.map(request => new URL(request.url).pathname), ['/category/bestsellers/', '/category/audio-fantasy/']);
  assert.equal((await h.source.getDiscoverItems('latest', 1)).length, 0);
  assert.equal(h.requests.length, 2);
});

test('the actual no-results structure is accepted as a successful empty search', async () => {
  const body = '<main id="site-content"><div class="ilovewp-page-intro"><h1 class="title-page">Search Results for: <span>absent</span></h1></div><section class="no-results not-found"><div class="post-single"><p>Sorry, but nothing matched your search terms. Please try again with some different keywords.</p></div></section></main>';
  const h = load({ fetch: async () => response(searchPage(body, 'absent')) });
  assert.equal((await h.source.search('absent')).length, 0); assert.equal(h.requests.length, 1);
});

test('redirecting a search to unrelated homepage listings does not become a successful match', async () => {
  const h = load({ fetch: async () => response(searchPage(listing('/unrelated-audiobook/')), BASE + '/') });
  await assert.rejects(h.source.search('Example'));
});

test('the website search-path redirect keeps a matching query usable', async () => {
  const h = load({ fetch: async () => response(searchPage(listing(), 'Jane & Austen'), BASE + '/search/Jane%20%26%20Austen/') });
  assert.equal((await h.source.search('Jane & Austen')).length, 1);
});

test('published manifest matches the actual extension and declares independent direct audio routing', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'repo.json'), 'utf8').replace(/^\uFEFF/, ''));
  const source = load().source, entry = manifest.extensions.find(item => item.id === source.id);
  assert.ok(entry); assert.equal(entry.version, source.version); assert.equal(entry.contentType, 'audiobooks');
  assert.equal(entry.debridSupport, 'none'); assert.equal(source.debridSupport, 'none');
  assert.equal(source.capabilities.audioStreaming, false);
  assert.equal(entry.capabilities.audioStreaming, false);
  assert.equal(source.capabilities.resolve, true);
  assert.equal(typeof source.resolve, 'function');
});
