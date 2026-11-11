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
if (process.env.ABB_PARSER_REV) {
  assert.match(process.env.ABB_PARSER_REV, /^[a-f0-9]{7,40}$/);
  parserSource = execFileSync('git', ['show', process.env.ABB_PARSER_REV + ':src/extensions/HTMLParser.ts'], { cwd: app, encoding: 'utf8' });
} else parserSource = fs.readFileSync(path.join(app, 'src/extensions/HTMLParser.ts'), 'utf8');
const parser = { exports: {} };
vm.runInNewContext(ts.transpileModule(parserSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
  { exports: parser.exports, require: appRequire });
const script = fs.readFileSync(path.join(root, 'audiobookbay.js'), 'utf8');
const HASH = '0123456789abcdef0123456789abcdef01234567';
const BASE = 'https://audiobookbay.lu';
function listing(slug = 'synthetic-audio', title = 'Synthetic Audio - Example Author') {
  return `<div class="post"><div class="postTitle"><h2><a href="${BASE}/abss/${slug}/">${title}</a></h2></div>
  <div class="postInfo">Category: Fiction<br>Language: English<span>Keywords: Test</span></div>
  <div class="postContent"><div class="center"><img src="https://images.example.org/cover.jpg"></div>
  <p>Posted: 1 Nov 2026<br>Format: <span>M4B</span> / Bitrate: <span>64 Kbps</span><br>File Size: <span>211.73</span> MBs</p></div>
  <div class="postMeta"><a href="/dload-now?ll=ad">Direct Download</a></div></div>`;
}
function listHtml() { return `<div id="content"><h1 class="archiveTitle">Search results</h1>${listing()}${listing('second-audio', 'Second &amp; Third - Another Author')}</div>`; }
function detail(options = {}) {
  const hash = options.noHash ? '' : `<tr><td>Info Hash:</td><td>${options.hash || HASH}</td></tr>`;
  return `<div id="content"><div class="post"><div class="postTitle"><h1>Synthetic Audio - Example Author</h1></div>
  <div class="postInfo">Category: Fiction<br>Language: English<span>Keywords: Test</span></div>
  <div class="postContent"><div class="center"><img src="https://images.example.org/cover.jpg"></div>
  <div class="desc"><p>Written by <span class="author">Example Author</span><br>Read by <span class="narrator">Example Narrator</span><br>Format: <span class="format">M4B</span><br>Bitrate: <span class="bitrate">64 Kbps</span></p><p>Synthetic description for automated testing.</p></div>
  <audio src="https://samples.example.org/sample.mp3"></audio>
  <table><tr><td>Tracker:</td><td>udp://tracker.example.org:6969/announce</td></tr>${hash}
  <tr><td>Combined File Size:</td><td>1.5 GBs</td></tr>
  <tr><td>Torrent Download</td><td><a id="magnetLink">Magnet</a>${options.magnet ? `<a href="${options.magnet}">Magnet</a>` : ''}</td></tr>
  <tr><td>Direct Download</td><td><a href="/dedl4-now?teb=ad">Start Downloads Now</a></td></tr></table></div></div></div>`;
}
function load(options = {}) {
  const requests = [], sessions = [];
  const fetcher = async (url, opts, browser) => {
    requests.push({ url, opts, browser: !!browser });
    if (options.fetch) return options.fetch(url, opts, browser);
    return { status: 200, data: url.includes('/abss/') ? detail() : listHtml() };
  };
  const api = { parseHTML: parser.exports.parseHTML, resolveUrl: (url, base) => new URL(url, base).href,
    store: { get: async key => options.settings?.[key] ?? null },
    getBrowserSessionHeaders: async url => { sessions.push(url); if (options.cookieFailure) throw new Error('Bridge unavailable'); return { Cookie: 'test=1' }; },
    fetch: (url, opts) => fetcher(url, opts, false) };
  if (options.browser) api.fetchBrowser = (url, opts) => fetcher(url, opts, true);
  if (options.legacy) { delete api.resolveUrl; delete api.getBrowserSessionHeaders; }
  const context = vm.createContext({ cinder: api });
  vm.runInContext(script, context);
  return { source: context.__cinderExport, requests, sessions };
}
test('search returns audiobook identity, actual format, size, language and cover without detail fan-out', async () => {
  const { source, requests } = load();
  const results = await source.search('Synthetic Audio', 1);
  assert.equal(results.length, 2); assert.equal(requests.length, 1);
  assert.equal(requests[0].url, BASE + '/?s=synthetic%20audio');
  assert.equal(results[0].contentType, 'audiobooks'); assert.equal(results[0].contentTypes[0], 'audiobook');
  assert.equal(results[0].format, 'm4b'); assert.equal(results[0].size, '211.73 MB');
  assert.equal(results[0].author, 'Example Author'); assert.equal(results[0].language, 'English');
  assert.equal(results[1].title, 'Second & Third'); assert.equal(results[0].id, '/abss/synthetic-audio/');
});
test('pagination matches actual website links and escapes query characters', async () => {
  const { source, requests } = load(); await source.search('Jane & Austen', 2);
  assert.equal(requests[0].url, BASE + '/page/2/?s=jane%20%26%20austen');
});

test('explicit seed counts use the generic field and label with a legacy fallback', async () => {
  for (const [input, expected] of [['24', 24], ['0', 0], ['1,024', 1024]]) {
    const html = listHtml().replace('</p></div>', `</p><table><tr><td>Seeders:</td><td>${input}</td></tr></table></div>`);
    const h = load({ fetch: async () => ({ status: 200, data: html }) });
    const item = (await h.source.search('Book'))[0];
    assert.equal(item.availability, expected); assert.equal(item.seeders, expected); assert.equal(item.availabilityLabel, 'Seeders');
  }
});

test('published AudioBookBay update matches the executable version', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'repo.json'), 'utf8').replace(/^\uFEFF/, ''));
  const source = load().source, entry = manifest.extensions.find(item => item.id === source.id);
  assert.equal(entry.version, source.version);
  assert.equal(entry.contentType, source.contentType);
  assert.equal(entry.debridSupport, source.debridSupport);
});
test('missing seed counts, descriptions and invalid values never become a fabricated zero', async () => {
  const missing = (await load().source.search('Book'))[0];
  assert.equal(missing.availability, undefined); assert.equal(missing.seeders, undefined); assert.equal(missing.availabilityLabel, 'Seeders');
  for (const value of ['unknown', '-2', '2.5', '1,2', '9007199254740992']) {
    const html = listHtml().replace('</p></div>', `</p><p>Seeders: 999</p><table><tr><td>Downloads:</td><td>100</td></tr><tr><td>Seeders:</td><td>${value}</td></tr></table></div>`);
    assert.equal((await load({ fetch: async () => ({ status: 200, data: html }) }).source.search('Book'))[0].availability, undefined);
  }
});
test('source ordering is preserved, duplicates and advertisements are discarded', () => {
  const { source } = load();
  const html = `<div id="content">${listing('second', 'Z Title - Author')}${listing('first', 'A Title - Author')}${listing('second')}${listing('bad').replace('/abss/bad/', '/dload-now?ad=1')}</div>`;
  const items = source._listing(parser.exports.parseHTML(html), BASE);
  assert.equal(items.length, 2); assert.equal(items[0].title, 'Z Title'); assert.equal(items[1].title, 'A Title');
});
test('public info-hash table resolves to magnet only, not HTML, sample or one invented track', async () => {
  const { source, requests } = load();
  const resolved = await source.resolve({ id: '/abss/synthetic-audio/' });
  assert.match(resolved.debridLink, new RegExp('^magnet:\\?xt=urn:btih:' + HASH));
  assert.match(resolved.debridLink, /tr=udp%3A%2F%2Ftracker.example.org/);
  assert.equal(resolved.fileSize, 1610612736); assert.equal(resolved.url, undefined); assert.equal(resolved.fileName, undefined);
  assert.equal(requests.length, 1); assert.equal(requests[0].url, BASE + '/abss/synthetic-audio/');
});
test('details include description and narrator and share cached request with resolution', async () => {
  const { source, requests } = load(); const details = await source.getBookDetails('/abss/synthetic-audio/');
  assert.equal(details.description, 'Synthetic description for automated testing.');
  assert.equal(details.extra.narrator, 'Example Narrator');
  await source.resolve({ id: details.id }); assert.equal(requests.length, 1);
});
test('ambiguous torrent hashes never resolve the wrong book', async () => {
  const { source } = load({ fetch: async () => ({ status: 200, data: detail({ magnet: 'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }) }) });
  await assert.rejects(source.resolve({ id: '/abss/synthetic-audio/' }), /conflicting torrent/);
});
test('invalid info hash cannot be substituted by unrelated download links', async () => {
  const { source } = load({ fetch: async () => ({ status: 200, data: detail({ hash: 'invalid' }) }) });
  await assert.rejects(source.resolve({ id: '/abss/synthetic-audio/' }), /invalid torrent/);
});
test('missing torrent remains readable metadata but gives an actionable resolve error', async () => {
  const { source } = load({ fetch: async () => ({ status: 200, data: detail({ noHash: true }) }) });
  assert.equal((await source.getBookDetails('/abss/synthetic-audio/')).title, 'Synthetic Audio');
  await assert.rejects(source.resolve({ id: '/abss/synthetic-audio/' }), /no valid torrent/);
});
test('validated explicit base32 magnet supported when no table hash exists', async () => {
  const hash = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const { source } = load({ fetch: async () => ({ status: 200, data: detail({ noHash: true, magnet: 'magnet:?xt=urn:btih:' + hash }) }) });
  assert.match((await source.resolve({ id: '/abss/synthetic-audio/' })).debridLink, /00443214c74254b635cf84653a56d7c675be77df/);
});

test('equivalent hex and base32 identities are not conflicting releases', async () => {
  const hash = '00443214c74254b635cf84653a56d7c675be77df';
  const { source } = load({ fetch: async () => ({ status: 200, data: detail({ hash, magnet: 'magnet:?xt=urn:btih:ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' }) }) });
  assert.match((await source.resolve({ id: '/abss/synthetic-audio/' })).debridLink, new RegExp(hash));
});

test('zero identities never initiate provider preparation', async () => {
  for (const hash of ['0'.repeat(40), 'A'.repeat(32)]) {
    const { source } = load({ fetch: async () => ({ status: 200, data: detail({ hash }) }) });
    await assert.rejects(source.resolve({ id: '/abss/synthetic-audio/' }), /invalid torrent identity/);
  }
});
test('empty search is accepted only with site-specific empty-search structure', async () => {
  const { source, requests } = load({ fetch: async () => ({ status: 200, data: '<div id="content"><h1 class="archiveTitle">No matches</h1><h3>Not Found</h3><p>Please try again with another query</p></div>' }) });
  assert.equal((await source.search('none')).length, 0); assert.equal(requests.length, 1);
});
test('challenge and login HTML are errors, never empty successful results', async () => {
  const { source } = load({ fetch: async () => ({ status: 200, data: '<h1>Check your browser</h1><form>Sign in</form>' }) });
  await assert.rejects(source.search('title'), /Verify Website/);
});
test('one hidden browser fallback uses browser session and then succeeds', async () => {
  const { source, requests, sessions } = load({ browser: true, fetch: async (url, opts, browser) => ({ status: browser ? 200 : 403, data: browser ? listHtml() : '<h1>Verify</h1>' }) });
  assert.equal((await source.search('title')).length, 2); assert.equal(requests.length, 2);
  assert.equal(requests[1].opts.headers['X-Cinder-Suppress-Interactive'], '1');
  assert.equal(sessions[0], BASE + '/?s=title');
});
test('rate limiting avoids browser retries and repeated requests', async () => {
  const { source, requests } = load({ browser: true, fetch: async () => ({ status: 429, data: '' }) });
  await assert.rejects(source.search('title'), /limiting/); await assert.rejects(source.search('other'), /limiting/);
  assert.equal(requests.length, 1);
});
test('removed releases fail directly rather than repeatedly launching browser', async () => {
  const { source, requests } = load({ browser: true, fetch: async () => ({ status: 404, data: '' }) });
  await assert.rejects(source.resolve({ id: '/abss/gone/' }), /no longer available/); assert.equal(requests.length, 1);
});
test('search cache and simultaneous requests deduplicate and callers cannot mutate cache', async () => {
  const { source, requests } = load(); const values = await Promise.all([source.search('same'), source.search('same')]);
  assert.equal(requests.length, 1); values[0][0].title = 'changed';
  assert.equal((await source.search('same'))[0].title, 'Synthetic Audio'); assert.equal(values[1][0].title, 'Synthetic Audio');
});
test('catalog capitalization cannot redirect a title search to unrelated homepage listings', async () => {
  const { source, requests } = load({ fetch: async url => {
    const query = new URL(url).searchParams.get('s');
    return { status: 200, data: query === 'wind and truth'
      ? `<div id="content"><h1 class="archiveTitle">Wind And Truth Audiobooks Free Download</h1>${listing('target', 'Wind and Truth - Brandon Sanderson')}</div>`
      : `<div id="content">${listing('unrelated', 'Unrelated Book - Another Author')}</div>` };
  } });
  const results = await source.search('Wind and Truth');
  assert.equal(requests[0].url, BASE + '/?s=wind%20and%20truth');
  assert.equal(results[0].title, 'Wind and Truth');
  assert.equal(results[0].author, 'Brandon Sanderson');
});
test('search never caches a redirected homepage as success, while browsing still accepts it', async () => {
  const homepage = `<div id="content">${listing()}</div>`;
  const { source, requests } = load({ fetch: async () => ({ status: 200, data: homepage }) });
  await assert.rejects(source.search('title'), /Verify Website/);
  await assert.rejects(source.search('title'), /Verify Website/);
  assert.equal(requests.length, 2);
  assert.equal((await source.getDiscoverItems('latest', 1)).length, 1);
});
test('redirected HTTP search can recover through a valid browser search response', async () => {
  const { source, requests } = load({ browser: true, fetch: async (_url, _options, browser) => ({status: 200,
    data: browser ? listHtml() : `<div id="content">${listing('unrelated')}</div>` }) });
  const results = await source.search('title');
  assert.equal(requests.length, 2); assert.equal(results.length, 2);
  assert.equal(results[0].id, '/abss/synthetic-audio/');
});
test('differently capitalized searches share their normalized cache without changing display titles', async () => {
  const { source, requests } = load();
  const results = await Promise.all([source.search('Synthetic Audio'), source.search('synthetic audio')]);
  assert.equal(requests.length, 1); assert.equal(results[0][0].title, 'Synthetic Audio');
});
test('a background browse browser request does not discard a concurrent search', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const browserURLs = [];
  const { source } = load({ browser: true, fetch: async (url, _options, browser) => {
    if (!browser) return {status: 403, data: ''};
    browserURLs.push(url);
    if (browserURLs.length === 1) await gate;
    return {status: 200, data: listHtml()};
  } });
  const browse = source.getDiscoverItems('latest', 1);
  for (let i = 0; i < 20 && browserURLs.length === 0; i++) await Promise.resolve();
  const search = source.search('Wind and Truth');
  const settled = Promise.allSettled([browse, search]);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(browserURLs.length, 1);
  release();
  const results = await settled;
  assert.ok(results.every(result => result.status === 'fulfilled'), JSON.stringify(results));
  assert.equal(browserURLs.length, 2);
});
test('cache is bounded and manual website verification clears failed/stale state', async () => {
  const { source } = load(); for (let i = 0; i < 40; i++) source._remember('key' + i, [], 10000);
  assert.equal(source._cache.length, 24); source._cooldownUntil = Date.now() + 30000;
  await source.completeSettingAction(); assert.equal(source._cache.length, 0); assert.equal(source._cooldownUntil, 0);
});

test('queued browser work honors a rate limit received by the preceding request', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const { source } = load({ browser: true, fetch: async (_url, _options, browser) => {
    if (!browser) return {status: 403, data: ''};
    calls++; await gate; return {status: 429, data: ''};
  } });
  const results = Promise.allSettled([source.search('first'), source.search('second')]);
  for (let i = 0; i < 40; i++) await Promise.resolve();
  assert.equal(calls, 1);
  release();
  assert.ok((await results).every(result => result.status === 'rejected' && /limiting/.test(result.reason.message)));
  assert.equal(calls, 1); assert.equal(source._browserPending, 0);
  await assert.rejects(source.search('third'), /limiting/);
  assert.equal(calls, 1);
});

test('a failed browser request releases the queue for another search', async () => {
  let calls = 0;
  const { source } = load({ browser: true, fetch: async (_url, _options, browser) => {
    if (!browser) return {status: 403, data: ''};
    if (++calls === 1) throw new Error('Network request failed');
    return {status: 200, data: listHtml()};
  } });
  const results = await Promise.allSettled([source.search('first'), source.search('second')]);
  assert.equal(results[0].status, 'rejected'); assert.equal(results[1].status, 'fulfilled');
  assert.equal(calls, 2); assert.equal(source._browserPending, 0); assert.equal(source._browserTail, null);
});

test('browser fallback queue is bounded and drops expired work before opening another page', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const { source } = load({ browser: true, fetch: async () => {
    calls++; await gate; return {status: 200, data: listHtml()};
  } });
  const deadline = Date.now() + 10000;
  const first = source._browserPage(BASE, {}, false, false, true, deadline);
  const expired = source._browserPage(BASE, {}, false, false, true, Date.now() - 1);
  const third = source._browserPage(BASE, {}, false, false, true, deadline);
  const fourth = source._browserPage(BASE, {}, false, false, true, deadline);
  const results = Promise.allSettled([first, expired, third, fourth]);
  await assert.rejects(source._browserPage(BASE, {}, false, false, true, deadline), /busy/);
  release();
  const settled = await results;
  assert.equal(settled[1].status, 'rejected'); assert.match(settled[1].reason.message, /timed out/);
  assert.equal(settled.filter(r => r.status === 'fulfilled').length, 3);
  assert.equal(calls, 3); assert.equal(source._browserPending, 0); assert.equal(source._browserTail, null);
});
test('older Cinder API shape works without resolveUrl or browser session helpers', async () => {
  const { source } = load({ legacy: true }); assert.equal((await source.search('title'))[0].cover, 'https://images.example.org/cover.jpg');
  assert.ok((await source.resolve({ id: '/abss/synthetic-audio/' })).debridLink);
});
test('unavailable optional cookie bridge does not block public unauthenticated search', async () => {
  const { source, requests } = load({ cookieFailure: true }); assert.equal((await source.search('title')).length, 2);
  assert.equal(requests.length, 1); assert.equal(requests[0].opts.headers.Cookie, undefined);
});
test('mirror selection does not change stable release identity or send queries to arbitrary hosts', async () => {
  const { source, requests } = load({ settings: { website: 'https://audiobookbay.is' } });
  const results = await source.search('title'); assert.equal(results[0].id, '/abss/synthetic-audio/');
  assert.equal(results[0].url, 'https://audiobookbay.is/abss/synthetic-audio/');
  assert.match(requests[0].url, /^https:\/\/audiobookbay\.is\//);
  assert.equal((await source.getSettingsAsync())[1].url, 'https://audiobookbay.is/');
  for (const website of ['http://audiobookbay.lu', 'https://127.0.0.1', 'https://evil.example', 'https://audiobookbay.local', 'https://audiobookbay.lu@evil.example', 'https://audiobookbay.lu/path']) {
    await assert.rejects(load({ settings: { website } }).source.search('title'), /HTTPS website/);
  }
});
test('IDs reject arbitrary external pages, ad paths and encoded traversal before fetching', async () => {
  const { source, requests } = load();
  for (const id of ['https://evil.example/abss/book/', '/dload-now?ll=ad', '/abss/../book/', '/abss/book%2fsecret/', '/abss/book?next=bad']) {
    await assert.rejects(source.resolve({ id }), /Invalid AudioBookBay/);
  } assert.equal(requests.length, 0);
});
test('oversized HTML fails before parsing', async () => {
  const { source } = load({ fetch: async () => ({ status: 200, data: 'a'.repeat(2000001) }) });
  await assert.rejects(source.search('title'), /unusually large/);
});
test('unsupported shelf ID does not make requests', async () => {
  const { source, requests } = load(); assert.equal((await source.getDiscoverItems('unverified-path')).length, 0); assert.equal(requests.length, 0);
  await source.getDiscoverItems('latest', 2); assert.equal(requests[0].url, BASE + '/page/2/');
});
test('captured current public markup parses using actual Cinder parser, no audio download', { skip: !fs.existsSync(path.join(root, 'live/search.html')) }, async () => {
  const { source, requests } = load({ fetch: async url => ({ status: 200, data: fs.readFileSync(path.join(root, 'live', url.includes('/abss/') ? 'detail.html' : 'search.html'), 'utf8') }) });
  const results = await source.search('pride prejudice'); assert.equal(results.length, 9);
  assert.ok(results.some(item => item.author === 'Jane Austen')); assert.ok(results.every(item => item.cover && item.size));
  const record = await source.getBookDetails('/abss/artificial-intimacy-who-we-become-when-we-talk-to-machines-sherry-turkle/');
  assert.equal(record.extra.narrator, 'Kate Udall'); assert.equal(record.format, 'm4b');
  assert.ok(record.description.length > 100);
  const resolved = await source.resolve({ id: record.id }); assert.match(resolved.debridLink, /^magnet:\?xt=urn:btih:[a-f0-9]{40}&dn=/);
  assert.equal(requests.length, 2);
});
test('direct HTTP public markup also parses without browser transformations', { skip: !fs.existsSync(path.join(root, 'live/direct-search.html')) }, async () => {
  const { source, requests } = load({ fetch: async url => ({ status: 200, data: fs.readFileSync(path.join(root, 'live', url.includes('/abss/') ? 'direct-detail.html' : 'direct-search.html'), 'utf8') }) });
  const results = await source.search('pride prejudice'); assert.equal(results.length, 9);
  assert.ok(results.every(item => item.contentType === 'audiobooks' && item.cover && item.author));
  const record = await source.getBookDetails('/abss/artificial-intimacy-who-we-become-when-we-talk-to-machines-sherry-turkle/');
  assert.equal(record.extra.narrator, 'Kate Udall');
  assert.ok((await source.resolve({ id: record.id })).debridLink.startsWith('magnet:?xt=urn:btih:'));
  assert.equal(requests.length, 2);
});
