const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const script = readFileSync(path.join(root, 'gocomics.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const asset = 'https://featureassets.gocomics.com/assets/0123456789abcdef0123456789abcdef';
const otherAsset = 'https://featureassets.gocomics.com/assets/fedcba9876543210fedcba9876543210';
const response = data => ({ status: 200, data });
const blocked = { status: 403, data: '<title>Establishing a secure connection ...</title>' };

function load(fetch, extra = {}) {
  // Deliberately omit URL, DOM, native APIs, storage, and new optional host APIs.
  const context = vm.createContext({ cinder: { fetch, ...extra } });
  vm.runInContext(script, context);
  return context.__cinderExport;
}
function card(id, title, author = 'Example Author') {
  return `<li data-search="${title} ${author}"><div class="ellipsis" title="${title} by ${author}">${title} <small>by ${author}</small></div><div class="actions"><a href="./rss/${id}.rss">Copy RSS URL</a></div></li>`;
}
function entry({ date = 'Sat, 10 Oct 2026 00:00:00 GMT', link = 'https://www.arcamax.com/thefunnies/zits/s-4312059', image = 'https://resources.arcamax.com/newspics/example.gif', encoded = false } = {}) {
  const body = `<p><img src="${image}" alt="Fixture comic"></p>`;
  return `<item><title><![CDATA[Fixture comic]]></title><link>${link}</link><pubDate>${date}</pubDate><description>${encoded ? body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : `<![CDATA[${body}]]>`}</description></item>`;
}
function feed(entries = entry(), source = 'https://www.arcamax.com/thefunnies/zits') {
  return `<rss version="2.0"><channel><link>${source}</link>${entries}</channel></rss>`;
}
function official(date = 'October 10, 2026', image = asset) {
  return '<html><head><title>Fixture</title></head><body>' + [
    { '@type': 'ImageObject', contentUrl: 'https://gocomicscmsassets.gocomics.com/social.jpg' },
    { '@type': 'ImageObject', contentUrl: image, datePublished: date },
    { '@type': 'ImageObject', contentUrl: otherAsset, datePublished: 'October 9, 2026' },
  ].map(value => `<script type="application/ld+json">${JSON.stringify(value)}</script>`).join('') + '</body></html>';
}
function stoppedFeed() {
  return feed('<item><title>Feed discontinued</title><pubDate>Tue, 24 Jun 2025 07:00:00 GMT</pubDate><description>No more comics.</description></item>' + entry({ date: 'Mon, 23 Jun 2025 00:00:00 GMT', link: 'https://www.gocomics.com/calvinandhobbes/2025/06/23', image: otherAsset }), 'https://www.gocomics.com/calvinandhobbes');
}

test('publication version and stable source identity agree', () => {
  const source = load(() => { throw Error('unexpected fetch'); });
  const manifest = JSON.parse(readFileSync(path.join(root, 'repo.json'), 'utf8'));
  const entries = manifest.extensions.filter(item => item.id === source.id);
  assert.equal(entries.length, 1);
  assert.equal(source.id, 'gocomics');
  assert.equal(source.version, '3.3.3');
  assert.equal(entries[0].version, source.version);
  assert.equal(entries[0].contentType, source.contentType);
  assert.deepEqual(entries[0].contentTypes, plain(source.contentTypes));
  assert.equal(entries[0].scriptUrl, 'https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/gocomics.js');
  assert.equal(source.getBookDetails, source.getMangaDetails);
  assert.equal(source.capabilities.manga, true);
  assert.deepEqual(plain(source.getSettings()).map(setting => setting.id), ['session_token_0', 'session_token_1']);
});

test('search uses real names, authors, spaces, punctuation and accents on a fresh catalog', async () => {
  let calls = 0;
  const source = load(async (_url, options) => { calls++; assert.equal(options.timeout, 10000); return response('<ul>' + card('calvinandhobbes', 'Calvin and Hobbes', 'Bill Watterson') + card('lio', 'Li&#243;') + '</ul>'); });
  for (const query of ['Calvin and Hobbes', 'calvin & hobbes', 'calvinandhobbes', 'Watterson']) {
    const result = await source.search(query, 0);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'calvinandhobbes');
    assert.equal(result[0].title, 'Calvin and Hobbes');
    assert.equal(result[0].author, 'Bill Watterson');
    assert.equal(result[0].description, result[0].extra.description);
  }
  assert.equal((await source.search('lio', 0))[0].title, 'Lió');
  assert.equal(calls, 1);
});

test('catalog failures do not permanently pin search to a small fallback list', async () => {
  let calls = 0;
  const source = load(async () => { if (++calls === 1) throw Error('temporary network failure'); return response(card('newcomic', 'New Comic')); });
  assert.equal((await source.search('Calvin and Hobbes'))[0].id, 'calvinandhobbes');
  source._comicsExpires = 0;
  assert.equal((await source.search('New Comic'))[0].id, 'newcomic');
  assert.equal(calls, 2);
});

test('search pagination and discovery exhaustion do not endlessly repeat the same results', async () => {
  const source = load(async () => response(Array.from({ length: 65 }, (_, i) => card('fixture' + i, 'Fixture ' + i)).join('')));
  const [first, second, third] = await Promise.all([source.search('', 0), source.search('', 1), source.search('', 2)]);
  assert.equal(first.length, 30); assert.equal(second.length, 30); assert.equal(third.length, 5);
  assert.equal(new Set([...first, ...second, ...third].map(item => item.id)).size, 65);
  assert.deepEqual(plain(await source.getDiscoverItems('popular', 1)), []);
});

test('RSS strips match pubDate when the publisher uses opaque story URLs', async () => {
  let calls = 0;
  const source = load(async () => { calls++; return response(feed()); });
  const chapters = await source.getChapters('zits');
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].id, 'zits|2026/10/10');
  assert.equal(chapters[0].dateUploaded, '2026-10-10');
  assert.deepEqual(plain(await source.getPages(chapters[0].id)), [{ url: 'https://resources.arcamax.com/newspics/example.gif' }]);
  assert.equal(calls, 1, 'chapter list and pages share the feed');
});

test('RSS supports XML-escaped HTML, CDATA, query strings, enclosures and date-path precedence', () => {
  const source = load(() => { throw Error('unexpected fetch'); });
  const xml = feed(entry({ image: 'https://example.org/image.png?a=1&amp;b=2', encoded: true }));
  assert.equal(source._extractImageFromRss(xml, '2026/10/10'), 'https://example.org/image.png?a=1&b=2');
  const mismatch = feed(entry({ link: 'https://www.gocomics.com/comic/2026/10/09' }));
  assert.equal(source._extractImageFromRss(mismatch, '2026/10/09'), 'https://resources.arcamax.com/newspics/example.gif');
  assert.equal(source._extractImageFromRss(mismatch, '2026/10/10'), null);
  const enclosure = feed('<item><pubDate>2026-10-10T00:00:00Z</pubDate><enclosure url="https://example.org/page.png" type="image/png" /></item>');
  assert.equal(source._extractImageFromRss(enclosure, '2026/10/10'), 'https://example.org/page.png');
});

test('non-GoComics missing dates fail clearly, never request the same slug from another publisher', async () => {
  const calls = [];
  const source = load(async url => { calls.push(url); return response(feed()); });
  await assert.rejects(source.getPages('zits|2026/10/09'), /no longer available/);
  assert.deepEqual(calls, ['https://www.comicsrss.com/rss/zits.rss']);
});

test('discontinued GoComics RSS uses the actual latest public strip and retains legacy date IDs', async () => {
  const calls = [];
  const source = load(async url => { calls.push(url); return response(url.endsWith('.rss') ? stoppedFeed() : official()); });
  const chapters = await source.getChapters('calvinandhobbes');
  assert.equal(chapters.length, 730, 'retain existing date-based archive navigation');
  assert.equal(chapters[0].id, 'calvinandhobbes|2026/10/10');
  assert.equal(chapters[1].id, 'calvinandhobbes|2026/10/09');
  assert.deepEqual(plain(await source.getPages(chapters[0].id)), [{ url: asset }]);
  assert.equal(calls.length, 2, 'opening the latest strip reuses the verified image');
  assert.deepEqual(plain(await source.getPages('calvinandhobbes|2025/06/23')), [{ url: otherAsset }]);
  assert.equal(calls.length, 2, 'old saved chapters still resolve from the feed');
});

test('official extractor validates the primary strip date, never selects recommendations or social art', () => {
  const source = load(() => { throw Error('unexpected fetch'); });
  assert.equal(source._extractImageUrl(official(), '2026/10/10'), asset);
  assert.equal(source._extractImageUrl(official(), '2026/10/09'), null);
  assert.equal(source._extractImageUrl('<meta property="og:image" content="https://example.org/social.jpg">'), null);
  assert.equal(source._extractImageUrl('<script type="application/ld+json">null</script>'), null);
});

test('HTTP challenge falls back once to the existing device browser API and preserves device UA', async () => {
  const requests = [], browsers = [];
  const source = load(async (url, options) => { requests.push({ url, options }); return url.endsWith('.rss') ? response(stoppedFeed()) : blocked; }, {
    secureStore: { get: async key => key.endsWith('_0') ? 'fixture-token' : null },
    fetchBrowser: async (url, options) => { browsers.push({ url, options }); return response(official()); },
  });
  assert.deepEqual(plain(await source.getPages('calvinandhobbes|2026/10/10')), [{ url: asset }]);
  assert.equal(browsers.length, 1);
  assert.equal(browsers[0].url, 'https://www.gocomics.com/calvinandhobbes/2026/10/10');
  assert.equal(browsers[0].options.headers['User-Agent'], undefined);
  assert.equal(browsers[0].options.browserUserAgent, 'desktop');
  assert.equal(browsers[0].options.headers['X-Cinder-Suppress-Interactive'], '1');
  assert.match(browsers[0].options.headers.Cookie, /fixture-token/);
  assert.equal(requests[0].options.headers.Cookie, undefined, 'credentials never go to ComicsRSS');
  assert.equal(requests[1].options.timeout, 8000);
});

test('older hosts without browser support report blocked access rather than false no-pages success', async () => {
  const source = load(async url => url.endsWith('.rss') ? response(stoppedFeed()) : blocked);
  await assert.rejects(source.getPages('calvinandhobbes|2026/10/10'), /site verification or network failure/);
});

test('an offline feed never guesses an unverified GoComics publisher', async () => {
  const calls = [];
  const source = load(async url => { calls.push(url); throw Error('Feed offline'); });
  await assert.rejects(source.getPages('zits|2026/10/10'), /Feed offline/);
  assert.deepEqual(calls, ['https://www.comicsrss.com/rss/zits.rss']);
});

test('browser failures and unavailable dates do not stick in the cache or return a wrong-day strip', async () => {
  let attempt = 0;
  const source = load(async url => url.endsWith('.rss') ? response(stoppedFeed()) : blocked, {
    fetchBrowser: async () => ++attempt === 1 ? blocked : response(official()),
  });
  await assert.rejects(source.getPages('calvinandhobbes|2026/10/10'), /site verification/);
  assert.equal((await source.getPages('calvinandhobbes|2026/10/10'))[0].url, asset);
  await assert.rejects(source.getPages('calvinandhobbes|2026/10/09'), /different strip will not be substituted/);
});

test('concurrent page reads share feed and official requests; parsed caches remain bounded', async () => {
  let feeds = 0, strips = 0;
  const source = load(async url => { await Promise.resolve(); if (url.endsWith('.rss')) { feeds++; return response(stoppedFeed()); } strips++; return response(official()); });
  await Promise.all([source.getPages('calvinandhobbes|2026/10/10'), source.getPages('calvinandhobbes|2026/10/10')]);
  assert.equal(feeds, 1); assert.equal(strips, 1);
  for (let i = 0; i < 100; i++) source._remember(source._stripCache, 'fixture' + i, { url: asset });
  assert.equal(Object.keys(source._stripCache).length, 24);
});

test('invalid IDs/dates never make a network request', async () => {
  const source = load(async () => { throw Error('NETWORK SHOULD NOT RUN'); });
  for (const id of ['../foo|2026/10/10', 'zits|2026/02/30', 'zits|invalid', 'xkcd|../1']) {
    await assert.rejects(source.getPages(id), /Invalid/);
  }
  assert.equal(source._datePath('2024-02-29'), '2024/02/29');
  assert.equal(source._datePath('invalid'), '');
  assert.doesNotThrow(() => source._decode('&#99999999999999999999;'));
});

test('xkcd keeps its independent API, stable IDs and 100-strip list', async () => {
  const source = load(async url => response(JSON.stringify(url === 'https://xkcd.com/info.0.json' ? { num: 3005 } : { img: 'https://imgs.xkcd.com/comics/fixture.png' })));
  const chapters = await source.getChapters('xkcd');
  assert.equal(chapters.length, 100); assert.equal(chapters[0].id, 'xkcd|3005');
  assert.equal((await source.getPages(chapters[0].id))[0].url, 'https://imgs.xkcd.com/comics/fixture.png');
});
