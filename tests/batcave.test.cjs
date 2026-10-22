const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const script = readFileSync(path.join(__dirname, '..', 'batcave.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const html = (data, tail = '') => '<script>window.__DATA__ = ' + JSON.stringify(data) + ';' + tail + '</script>';
const trimScript = 'if(window.__DATA__.images&&window.__DATA__.pages<window.__DATA__.images.length)window.__DATA__.images.length=window.__DATA__.pages;';
function load(response, browser = true) {
  const requests = [];
  const fetch = async (url, options) => { requests.push({ url, options }); return { status: 200, data: response }; };
  const context = vm.createContext({ cinder: browser ? { fetchBrowser: fetch } : { fetch } });
  vm.runInContext(script, context);
  return { source: context.__cinderExport, requests, context };
}

test('parses both legacy and current reader data without evaluating trailing JavaScript', () => {
  const { source, context } = load('');
  const data = { images: ['https://images.example.test/1.jpg'], pages: 1, nested: { text: '} \\" quoted { ; </not-script>' } };
  assert.deepEqual(plain(source._extractData(html(data))), data);
  assert.deepEqual(plain(source._extractData(html(data, trimScript + 'throw new Error("Do not execute");'))), data);
  assert.deepEqual(plain(source._extractData(html(data, 'window.executed = true;'))), data);
  assert.equal(context.executed, undefined);
});

for (const browser of [true, false]) {
  test(`current reader returns only declared pages, with stable URLs/headers/order (browser=${browser})`, async () => {
    const signed = 'https://img.batcave.biz/img/1.jpg?s=abc%2Fdef&expires=123';
    const { source, requests } = load(html({ images: [signed, '/img/2.webp', '/img/extra.jpg'], pages: 2 }, trimScript), browser);
    const pages = await source.getPages('/reader/100/200');
    assert.deepEqual(plain(pages.map(page => page.url)), [signed, 'https://batcave.biz/img/2.webp']);
    assert.ok(pages.every(page => page.headers.Referer === 'https://batcave.biz/reader/100/200'));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://batcave.biz/reader/100/200');
    assert.deepEqual(plain(await source.getPages('/reader/100/200')), plain(pages));
    assert.equal(requests.length, 1, 'keep the existing bounded HTML cache');
  });
}

test('retains old page objects, external hosts and duplicate filtering when no count is supplied', async () => {
  const { source } = load(html({ images: [
    '/page/1.jpg', { url: '//cdn.example.test/2.png' }, { src: '/page/3.avif' },
    { link: '/page/4.webp' }, '/page/1.jpg', null, '', 'data:image/png;base64,abc',
  ] }));
  assert.deepEqual(plain((await source.getPages('/reader/100/200')).map(page => page.url)), [
    'https://batcave.biz/page/1.jpg', 'https://cdn.example.test/2.png',
    'https://batcave.biz/page/3.avif', 'https://batcave.biz/page/4.webp',
  ]);
});

test('preserves existing series/chapter IDs, ordering, dates and legacy detail alias', async () => {
  const { source } = load(html({ news_id: 100, xhash: '?key=preserved', chapters: [
    { id: 201, title: 'Issue #2', posi: 2, date: '23.09.2026' },
    { id: 200, title: 'Issue #1', posi: 1, date: '22.09.2026' },
  ] }, 'window.unrelated = {};'));
  assert.equal(source.id, 'batcave');
  assert.equal(source.getBookDetails, source.getMangaDetails);
  assert.deepEqual(plain((await source.getChapters('/100-fixture.html')).map(ch => [ch.id, ch.dateUploaded])), [
    ['/reader/100/200?key=preserved', '2026-09-22'], ['/reader/100/201?key=preserved', '2026-09-23'],
  ]);
});

test('fails clearly for missing, malformed, truncated and unavailable data', async () => {
  const { source } = load('');
  assert.equal(source._extractData('<script>window.other = {};</script>'), null);
  for (const bad of ['{"images":[', '{bad:true}', '{"images":["unterminated}']) {
    assert.throws(() => source._extractData('<script>window.__DATA__ = ' + bad + '</script>'), /invalid embedded data/i);
  }
  await assert.rejects(load(html({ images: [], broken: true })).source.getPages('/reader/100/200'), /unavailable/);
  await assert.rejects(load(html({ images: ['/not-a-page.jpg'], pages: 0 }, trimScript)).source.getPages('/reader/100/200'), /no pages/);
});

test('ignores invalid page limits rather than hiding valid legacy pages', async () => {
  for (const pages of [null, -1, 1.5, 'unknown', true, 20]) {
    const { source } = load(html({ images: ['/1.jpg', '/2.jpg'], pages }));
    assert.equal((await source.getPages('/reader/100/200')).length, 2);
  }
});

test('manifest advertises the same update as the script without changing compatibility', () => {
  const { source } = load('');
  const repo = JSON.parse(readFileSync(path.join(__dirname, '..', 'repo.json'), 'utf8'));
  const item = repo.extensions.find(item => item.id === source.id);
  assert.equal(source.version, '0.2.2-cinder');
  assert.equal(item.version, source.version);
  assert.equal(item.minCinderVersion, '2.0.0');
});
