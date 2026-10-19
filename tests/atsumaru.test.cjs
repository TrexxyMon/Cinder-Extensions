const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const script = readFileSync(path.join(root, 'atsumaru.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const response = data => ({ status: 200, data: JSON.stringify(data) });
function load(fetch = () => { throw Error('Unexpected request'); }) {
  // No new native APIs, browser globals, URL constructor, or storage needed.
  const context = vm.createContext({ URLSearchParams, cinder: { fetch } });
  vm.runInContext(script, context);
  return context.__cinderExport;
}

test('retains the native source identity and older detail-screen contract', () => {
  const source = load();
  assert.equal(source.id, 'atsumaru');
  assert.equal(source.version, '0.1.2-cinder');
  assert.equal(source.getBookDetails, source.getMangaDetails);
  assert.deepEqual(plain(source.capabilities), {
    search: true, discover: true, download: false, resolve: false, manga: true,
  });
});

for (const image of [
  'pages/book/chapter/0.webp', '/pages/book/chapter/0.webp',
  'static/pages/book/chapter/0.webp', '/static/pages/book/chapter/0.webp',
  'https://atsu.moe/static/pages/book/chapter/0.webp',
  'http://atsu.moe/static/pages/book/chapter/0.webp',
  '//atsu.moe/static/pages/book/chapter/0.webp',
  'https://cdn.atsu.moe/static/pages/book/chapter/0.webp',
]) {
  test(`chapter images use the live CDN: ${image}`, async () => {
    const requests = [];
    const source = load(async (url, options) => {
      requests.push({ url, options });
      return response({ readChapter: { pages: [{ image }] } });
    });
    const pages = await source.getPages('book/chapter');
    assert.equal(pages[0].url, 'https://cdn.atsu.moe/static/pages/book/chapter/0.webp');
    assert.equal(pages[0].headers.Referer, 'https://atsu.moe/');
    assert.equal(requests.length, 1, 'no per-image probing/network overhead');
    assert.equal(requests[0].url, 'https://atsu.moe/api/read/chapter?mangaId=book&chapterId=chapter');
  });
}

test('preserves external hosts, signed query strings, page order and formats', async () => {
  const images = [
    'https://images.example.test/a.webp?signature=abc%2Fdef&expires=123',
    'https://cdn.atsu.moe/static/pages/a.avif?token=abc%2Fdef',
    'https://atsu.moe/static/pages/b.webp?token=a%2Bb&quality=90',
    'https://atsu.moe.example.test/image.webp',
    { url: '/static/pages/c.jpg' }, '', null,
  ];
  const source = load(async () => response({ readChapter: { pages: images.map(image => ({ image })) } }));
  const pages = await source.getPages('book/chapter');
  assert.deepEqual(plain(pages.map(page => page.url)), [
    images[0], images[1], 'https://cdn.atsu.moe/static/pages/b.webp?token=a%2Bb&quality=90',
    images[3], 'https://cdn.atsu.moe/static/pages/c.jpg',
  ]);
  assert.ok(pages.every(page => page.headers['User-Agent']));
});

test('does not change cover normalization, metadata, or saved chapter identities', async () => {
  const source = load(async url => url.includes('allChapters')
    ? response({ chapters: [{ id: 'second', number: 2 }, { id: 'first', number: 1, title: 'First' }] })
    : response({ mangaPage: {
      id: 'book', title: 'Fixture', mediumImage: 'posters/cover.avif', synopsis: 'Summary',
      authors: [{ name: 'Author', type: 'Author' }], scanlators: [],
    } }));
  const details = await source.getBookDetails('book');
  assert.equal(details.cover, 'https://atsu.moe/static/posters/cover.avif');
  assert.equal(details.author, 'Author');
  assert.equal(details.title, 'Fixture');
  assert.match(details.description, /Summary/);
  assert.deepEqual(plain((await source.getChapters('book')).map(ch => ch.id)), ['book/first', 'book/second']);
});

for (const section of ['popular', 'latest']) {
  test(`${section} uses current browse endpoints and one-based pagination with zero as a first-page alias`, async () => {
    const requests = [];
    const source = load(async url => {
      requests.push(new URL(url));
      return response({ items: [{ id: 'fixture', title: 'Fixture' }] });
    });
    for (const page of [undefined, 0, 1, 2, 3]) {
      assert.equal((await source.getDiscoverItems(section, page))[0].id, 'fixture');
    }
    assert.deepEqual(requests.map(url => url.searchParams.get('offset')), ['0', '0', '0', '40', '80']);
    assert.ok(requests.every(url => url.pathname === '/api/home2/' + (section === 'latest' ? 'recentlyUpdated' : 'popular')));
    assert.ok(requests.every(url => url.searchParams.get('limit') === '40'));
    assert.ok(requests.every(url => url.searchParams.get('types') === 'Manga,Manwha,Manhua,OEL'));
    assert.ok(requests.every(url => url.searchParams.get('mediums') === 'Comic'));
  });
}

test('keeps discover section IDs and blank search working', async () => {
  const requests = [];
  const source = load(async url => { requests.push(url); return response({ items: [{ id: 'fixture', title: 'Fixture' }] }); });
  assert.deepEqual(plain((await source.getDiscoverSections()).map(section => section.id)), ['popular', 'latest']);
  assert.equal((await source.search('', 0))[0].id, 'fixture');
  assert.equal(new URL(requests[0]).searchParams.get('offset'), '0');
});

test('still reports request failures instead of silently returning empty chapters', async () => {
  const source = load(async () => ({ status: 503, data: 'Unavailable' }));
  await assert.rejects(() => source.getPages('book/chapter'), /Atsumaru request failed/);
});
