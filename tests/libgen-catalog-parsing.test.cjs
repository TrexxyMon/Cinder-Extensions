const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const app = process.env.CINDER_APP || path.resolve(root, '../cinder');
const appRequire = createRequire(path.join(app, 'package.json'));
const ts = appRequire('typescript');
const parser = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(app, 'src/extensions/HTMLParser.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: parser.exports, require: appRequire });

function source(api = {}) {
  const context = vm.createContext({
    URL,
    setTimeout: fn => queueMicrotask(fn),
    cinder: {
      ...parser.exports,
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
  extra: { md5, fileId: '200', directUrl: landing } };

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
