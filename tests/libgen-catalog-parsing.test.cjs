const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const {parser, URL} = require('./cinder-native-parser.cjs');

const root = path.resolve(__dirname, '..');

function source(api = {}) {
  const context = vm.createContext({
    URL,
    atob,
    setTimeout: fn => queueMicrotask(fn),
    cinder: {
      ...parser,
      normalizeText: String,
      resolveUrl: (url, base) => new URL(url, base).href,
      store: { get: async () => undefined },
      log() {}, warn() {},
      ...api,
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'libgen.js'), 'utf8'), context);
  return context.__cinderExport;
}

test('Cinder parses every LibGen row with or without tbody, ignoring wrapper tables', async () => {
  const extension = source();
  const row = id => `<tr><td><a href="edition.php?id=${id}">Fixture Book ${id}</a></td><td>Author</td><td>Publisher</td><td>1900</td><td>English</td><td>200</td><td><a href="file.php?id=${id}">1 MB</a></td><td>EPUB</td><td><a href="ads.php?md5=${id.padStart(32, '0')}">GET</a></td></tr>`;
  const rows = row('100') + row('101');
  for (const content of [rows, '<tbody>' + rows + '</tbody>']) {
    const html = `<table><tr><td><table class="table-striped">${content}</table></td></tr></table>`;
    const results = await extension._parseResults(html);
    assert.equal(results.length, 2);
    assert.equal(results[0].title, 'Fixture Book 100');
    assert.equal(results[1].extra.fileId, '101');
  }
});

test('LibGen catalog entry is installable on Cinder 1.x and points to a pinned script', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'repo.json'), 'utf8'));
  const entry = manifest.extensions.find(item => item.id === 'libgen');
  assert.equal(entry.version, source().version);
  assert.equal(entry.minCinderVersion, '1.1.0');
  assert.match(entry.scriptUrl, /^https:\/\/cdn\.jsdelivr\.net\/gh\/TrexxyMon\/Cinder-Extensions@[0-9a-f]{40}\/libgen\.js$/);
});

test('search keeps separate same-size files in Book Details and preserves the edition page', async () => {
  const row = (id, title) => '<tr><td><a href="edition.php?id=100">' + title + '</a></td><td>A</td><td>P</td><td>2000</td><td>English</td><td>300</td><td><a href="file.php?id=' + id + '">1 MB</a></td><td>EPUB</td><td></td></tr>';
  const graphic = 'The Son of Neptune (Graphic Novel)', prose = 'The Son of Neptune';
  const html = '<table class="table-striped">' + row(201, graphic) + row(202, prose) + row(203, prose) + '</table>';
  const seen = [];
  const extension = source({ fetch: async url => { seen.push(url); return { status: 200, data: html }; } });
  assert.ok(!extension.getSettings().some(s => s.id === 'availability'));
  const results = await extension.search('Heroes of Olympus, Book Two: The Son of Neptune', 0);
  assert.equal(seen.length, 1);
  assert.match(seen[0], /The\+Son\+of\+Neptune/i);
  assert.doesNotMatch(seen[0], /Olympus/i);
  assert.equal(results.length, 3);
  assert.equal(results[0].url, 'https://libgen.li/file.php?id=202');
  assert.equal(results[1].url, 'https://libgen.li/file.php?id=203');
  assert.equal(results[0].extra.detailUrl, 'https://libgen.li/edition.php?id=100');
  assert.equal(results[2].title, graphic);
  assert.equal((await extension.search('The Son of Neptune Graphic Novel', 0))[0].title, graphic);
  assert.equal(extension.downloadResults.limit, 25);
  assert.equal(extension.downloadResults.order, 'source');
  const oldSettings = source({ store: { get: async k => k === 'availability' ? 'verified' : undefined },
    fetch: async url => { assert.match(url, /index\.php/); return { status: 200, data: html }; } });
  assert.deepEqual(Array.from(await oldSettings.search(prose), r => r.url), Array.from(results, r => r.url));
});

const md5 = '1'.repeat(32);
const otherMd5 = '2'.repeat(32);
const cid = 'bafykbzaceaallwghbxwfa2qmnxdajkztjc5nbqz3pzwcgucqxc33mdz63ky3s';
const otherCid = 'bafykbzaceaallwghbxwfa2qmnxdajkztjc5nbqz3pzwcgucqxc33mdz63ky4s';
const catalog = 'https://libgen.li';

const landing = catalog + '/ads.php?md5=' + md5;
const edition = catalog + '/edition.php?id=100';
const filePage = catalog + '/file.php?id=200';
const keyed = catalog + '/get.php?md5=' + md5 + '&key=test-key';
const gateway = (host, hash = cid) => 'https://' + host + '/ipfs/' + hash +
  '?filename=Fixture{Doe, Jane}(2020, Fixture Press){100}.epub';
const item = { id: 'fixture-table-' + md5 + '-epub', format: 'epub', title: 'Fixture', url: edition,
  extra: { md5, fileId: '200', directUrl: landing, fileMirror: '' } };

function fileMetadata(hash, id, mirrors) {
  const links = mirrors.map(href =>
    '<a data-toggle="tooltip" data-placement="bottom" title="IPFS" href="' + href +
    '"><span class="badge badge-primary">IPFS</span></a>').join(' ');
  return '<div><a href="/ads.php?md5=' + hash + '"><span>Libgen</span></a> ' + links +
    '</div><div><label><strong>MD5: </strong></label>' + hash +
    '</div><div><label><strong>IPFS CID: </strong></label>' + id + '</div>';
}

function downloadFixture({ file, editionHtml = '', probes }) {
  const calls = [];
  const unexpected = [];
  const extension = source({ fetch: async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url, method, headers: options.headers || {} });
    const probeUrl = method === 'HEAD' && Object.keys(probes).find(value => new URL(value).href === new URL(url).href);
    if (probeUrl) {
      const reply = probes[probeUrl];
      if (typeof reply === 'object') return reply;
      const status = reply;
      return { status, data: '', headers: status === 200
        ? { 'content-type': 'application/epub+zip', 'content-length': '700000' }
        : { 'content-type': 'text/html' } };
    }
    if (method === 'GET') {
      const html = url === landing ? '<a href="get.php?md5=' + md5 + '&amp;key=test-key">GET</a>'
        : url === filePage ? file : url === edition ? editionHtml : undefined;
      if (html !== undefined) return { status: 200, data: html, headers: { 'content-type': 'text/html' } };
    }
    unexpected.push({ method, url });
    return { status: 404, data: '', headers: {} };
  } });
  return { extension, calls, unexpected };
}

test('LibGen returns a healthy primary file without opening its mirror metadata', async () => {
  const { extension, calls, unexpected } = downloadFixture({ probes: { [keyed]: 200 } });
  assert.equal((await extension.resolve(item)).url, keyed);
  assert.deepEqual(calls.map(call => [call.method, call.url]), [['GET', landing], ['HEAD', keyed]]);
  assert.deepEqual(unexpected, []);
});

test('LibGen recovers from a 503 using a gateway published for the selected file, without forwarding credentials', async () => {
  const good = gateway('gateway.pinata.cloud');
  const { extension, calls, unexpected } = downloadFixture({
    file: fileMetadata(md5, cid, [good]),
    probes: { [keyed]: 503, [good]: 200 },
  });
  const result = await extension.resolve(item);
  assert.equal(new URL(result.url).href, new URL(good).href);
  assert.equal(result.fileName, 'Fixture.epub');
  const probe = calls.find(call => call.method === 'HEAD' && new URL(call.url).href === new URL(good).href);
  assert.ok(probe);
  for (const headers of [probe.headers, result.headers || {}]) {
    assert.doesNotMatch(JSON.stringify(headers), /[?&]key=|"cookie"|"authorization"/i);
  }
  assert.deepEqual(unexpected, []);
});

test('LibGen deduplicates failed gateways and rejects unrelated CIDs and local links', async () => {
  const unavailable = gateway('gateway.ipfs.io');
  const { extension, calls, unexpected } = downloadFixture({
    file: fileMetadata(md5, cid, [
      gateway('gateway.pinata.cloud', otherCid),
      'http://localhost:8080/ipfs/' + cid,
      unavailable, unavailable,
    ]),
    probes: { [keyed]: 404, [unavailable]: 404 },
  });
  await assert.rejects(extension.resolve(item), /404|503|unavailable|another (?:result|edition)/i);
  assert.equal(calls.filter(call => call.method === 'HEAD' && new URL(call.url).href === new URL(unavailable).href).length, 1);
  assert.deepEqual(unexpected, []);
});

test('LibGen does not substitute an adjacent EPUB when the saved file metadata points to a different MD5', async () => {
  const otherFile = fileMetadata(otherMd5, otherCid, [gateway('gateway.pinata.cloud', otherCid)]);
  const { extension, unexpected } = downloadFixture({
    file: otherFile,
    editionHtml: '<div>' + otherFile + '</div><div>' + fileMetadata(md5, cid, []) + '</div>',
    probes: { [keyed]: 404 },
  });
  await assert.rejects(extension.resolve(item), /404|unavailable|another (?:result|edition)/i);
  assert.deepEqual(unexpected, []);
});

for (const status of [500, 502, 503, 504]) {
  test('LibGen allows the native GET of the selected file after a HEAD ' + status, async () => {
    const uncertain = gateway('gateway.ipfs.io');
    const { extension, unexpected } = downloadFixture({
      file: fileMetadata(md5, cid, [uncertain]),
      probes: { [keyed]: status, [uncertain]: 405 },
    });
    const result = await extension.resolve(item);
    assert.equal(result.url, keyed);
    assert.equal(result.headers.Referer, landing);
    assert.deepEqual(unexpected, []);
    const noFileId = { ...item, extra: { md5, directUrl: landing } };
    assert.equal((await extension.resolve(noFileId)).url, keyed);
  });
}

test('LibGen respects Retry-After and definitive primary errors when no mirror serves the file', async () => {
  for (const status of [401, 403, 404, 410, 429, 503]) {
    const { extension } = downloadFixture({
      file: fileMetadata(md5, cid, []),
      probes: { [keyed]: { status, headers: status === 503 ? { 'Retry-After': '60' } : {} } },
    });
    await assert.rejects(extension.resolve(item), new RegExp('HTTP ' + status));
  }
});

const mirrorBook = 'https://libgen.pw/book/' + md5;
const mirrorFile = 'https://libgen.pw/api/file/200';
test('two advertised file links go directly to the native downloader without contacting either during resolution', async () => {
  const { extension, calls } = downloadFixture({ probes: {} });
  const catalogGet = catalog + '/get.php?md5=' + md5;
  const resolved = await extension.resolve({ ...item, extra: { ...item.extra, catalogGet, fileMirror: mirrorBook } });
  assert.equal(resolved.url, catalogGet);
  assert.deepEqual(Array.from(resolved.fallbackUrls), [mirrorFile]);
  assert.equal(resolved.downloadRequest, undefined);
  assert.deepEqual(calls, []);
});
test('a signed primary gives the native downloader the exact edition mirror without probing either file', async () => {
  const { extension, calls } = downloadFixture({ probes: { [keyed]: 500 } });
  const resolved = await extension.resolve({ ...item, extra: { ...item.extra, fileMirror: mirrorBook } });
  assert.equal(resolved.url, keyed);
  assert.deepEqual(Array.from(resolved.fallbackUrls), [mirrorFile]);
  assert.deepEqual(calls.map(c => [c.method, c.url]), [['GET',landing]]);
});
test('a saved result with a missing primary still receives its published GET-only mirror', async () => {
  const { extension, unexpected } = downloadFixture({ file: '<a href="' + mirrorBook + '">Mirror</a>',
    probes: { [keyed]: 404, [mirrorFile]: {status:200,headers:{'content-type':'text/html'}} } });
  const resolved = await extension.resolve({ ...item, extra: { md5, fileId:'200', directUrl:landing } });
  assert.equal(resolved.url, mirrorFile);
  assert.deepEqual(unexpected, []);
});
test('a parsed catalog row preserves its same-file mirror for a later transfer failure', async () => {
  const { extension, unexpected } = downloadFixture({ probes: { [keyed]: 200 } });
  const row = '<tr><td><a href="edition.php?id=100">Test Book</a></td><td>Author</td><td></td><td></td><td>English</td><td>320</td><td><a href="file.php?id=200">1 MB</a></td><td>EPUB</td><td><a href="' + landing + '">1</a><a href="' + mirrorBook + '?utm_source=libgen.li">4</a></td></tr>';
  const [book] = await extension._parseResults('<table class="table-striped">' + row + '</table>');
  assert.equal(book.extra.fileMirror, mirrorBook);
  const result = await extension.resolve(book);
  assert.equal(result.url, keyed);
  assert.deepEqual(Array.from(result.fallbackUrls), [mirrorFile]);
  assert.deepEqual(unexpected, []);
});

test('a missing primary landing page yields the advertised mirror, while cancellation ends the request', async () => {
  const book = { ...item, extra: { ...item.extra, fileMirror: mirrorBook } };
  const extension = source();
  extension._resolvePrimary = async () => { throw Error('HTTP 503'); };
  assert.equal((await extension.resolve(book)).url, mirrorFile);
  extension._resolvePrimary = async () => { throw Object.assign(Error('cancelled'), {name:'AbortError'}); };
  await assert.rejects(extension.resolve(book), {name:'AbortError'});
});

test('A primary-only result retains its healthy storage redirect and original dispatch fallback', async () => {
  const storage = 'https://cdn5.booksdl.lc/get.php?md5=' + md5 + '&key=storage-test';
  for (const url of [storage, storage.replace(md5, otherMd5), storage.replace('.lc/', '.lc.example/'), storage.replace('https:', 'http:')]) {
    const probe = {status:200, url, headers:{'content-type':'application/octet-stream'}};
    const {extension} = downloadFixture({probes:{[keyed]:probe}});
    const result = await extension.resolve(item);
    assert.equal(result.url, url === storage ? storage : keyed);
    assert.deepEqual(Array.from(result.fallbackUrls || []), url === storage ? [keyed] : []);
    assert.equal(result.headers.Referer, landing);
  }
});

test('Saved results recover a published alternate by file ID even when there is no IPFS CID', async () => {
  const file = '<a href="' + mirrorBook + '">Alternate mirror</a>';
  const legacy = { ...item, extra:{md5, fileId:'200', directUrl:landing} };
  for (const status of [200, 500]) {
    const { extension, unexpected } = downloadFixture({ file, probes: { [keyed]:status, [mirrorFile]:200 } });
    const result = await extension.resolve(legacy);
    assert.equal(result.url, keyed);
    assert.deepEqual(Array.from(result.fallbackUrls), [mirrorFile]);
    assert.deepEqual(unexpected, []);
  }
});

test('Catalog rows that actually publish an unkeyed GET use the published file URL only for a binary response', async () => {
  const published = catalog + '/get.php?md5=' + md5;
  const row = '<tr><td><a href="edition.php?id=100">Test Book</a></td><td>Author</td><td></td><td></td><td>English</td><td></td><td><a href="file.php?id=200">1 MB</a></td><td>EPUB</td><td><a href="' + published + '">Libgen</a></td></tr>';
  for (const htmlResponse of [false,true]) {
    const {extension, unexpected} = downloadFixture({probes:{[keyed]:200,[published]:htmlResponse ? {status:200,headers:{'Content-Type':'text/html'}} : 200}});
    const [book] = await extension._parseResults('<table>' + row + '</table>');
    assert.equal(book.extra.catalogGet, published);
    assert.equal((await extension.resolve(book)).url, htmlResponse ? keyed : published);
    assert.deepEqual(unexpected, []);
  }
});

test('Excluded mirrors cannot be introduced by a similarly named host or a different edition', async () => {
  const file = '<a href="' + mirrorBook.replace(md5, otherMd5) + '">Different edition</a>';
  const { extension, unexpected } = downloadFixture({ file, probes: { [keyed]:404, [mirrorFile]:403 } });
  assert.equal(extension._fileMirrorUrl(mirrorBook.replace('libgen.pw', 'libgen.pw.example'), md5, '200'), '');
  assert.equal(extension._fileMirrorUrl(mirrorBook, otherMd5, '200'), '');
  assert.equal(extension._fileMirrorUrl(mirrorBook, md5, '../other'), '');
  await assert.rejects(extension.resolve(item), /HTTP 404/);
  assert.deepEqual(unexpected, []);
});
