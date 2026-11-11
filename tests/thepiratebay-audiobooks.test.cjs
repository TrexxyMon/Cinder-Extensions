const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'thepiratebay-audiobooks.js'), 'utf8');
const hash = '0123456789abcdef0123456789abcdef01234567';
const release = (changes = {}) => ({ id: '12345', name: 'Example Author - Example Book M4B', category: '102', info_hash: hash,
  seeders: '12', leechers: '3', size: '1073741824', num_files: '21', added: '1762387200', ...changes });
function load(fetcher = async () => ({ status: 200, data: JSON.stringify([release()]) })) {
  const calls = [];
  let now = 1800000000000;
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ Date: Clock, cinder: { fetch: async (url, opts) => { calls.push({ url, opts }); return fetcher(url, opts); } } });
  vm.runInContext(code, context);
  return { source: context.__cinderExport, calls, advance: ms => { now += ms; } };
}

test('manifest update agrees with executable metadata and a supported result policy', () => {
  const {source} = load();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'repo.json'), 'utf8').replace(/^\uFEFF/, ''));
  const entry = manifest.extensions.find(row => row.id === source.id);
  assert.ok(entry);
  for (const key of ['version', 'name', 'contentType', 'debridSupport']) assert.equal(entry[key], source[key]);
  assert.ok(Number.isInteger(source.downloadResults.limit) && source.downloadResults.limit >= 1 && source.downloadResults.limit <= 50);
  assert.equal(source.downloadResults.order, 'popularity');
});
test('declares audiobook-only category, debrid requirement, and legacy availability', async () => {
  const { source, calls } = load(); const results = await source.search('Example & Author', 0);
  assert.equal(source.contentType, 'audiobooks'); assert.equal(source.contentTypes[0], 'audiobook');
  assert.equal(source.debridSupport, 'required'); assert.equal(source.excludeFromDefaultMetadataProviders, true);
  assert.equal(calls[0].url, 'https://apibay.org/q.php?q=Example%20%26%20Author&cat=102');
  assert.equal(calls[0].opts.timeout, 12000);
  const result = results[0]; assert.equal(result.format, 'm4b'); assert.equal(result.size, '1 GiB');
  assert.equal(result.availability, 12); assert.equal(result.seeders, 12); assert.equal(result.availabilityLabel, 'Seeders');
  assert.equal(result.extra.fileCount, 21); assert.equal(result.author, undefined); assert.equal(result.cover, undefined);
  assert.ok(!Number.isNaN(Date.parse(result.date)));
});
test('strict category and identity validation excludes ebooks, unrelated audio, malformed and duplicate hits', async () => {
  const rows = [release(), release({ id: '456' }), release({ id: '0' }), release({ category: '601' }), release({ category: '101' }),
    release({ info_hash: '0'.repeat(40) }), release({ info_hash: 'bad' }), release({ id: '../malicious' }), release({ name: '' }), null];
  const { source } = load(async () => ({ status: 200, data: rows }));
  assert.equal((await source.search('test')).length, 1);
});
test('empty sentinel is an empty search, not a downloadable fake result', async () => {
  const { source } = load(async () => ({ status: 200, data: [{id:'0',name:'No results returned',category:'0',info_hash:'0'.repeat(40)}] }));
  assert.equal((await source.search('absent')).length, 0);
});
test('only the validated info hash resolves; no detail request, direct ad URL or invented track', async () => {
  const { source, calls } = load(); const [result] = await source.search('test');
  result.url = 'https://advertisement.invalid/download';
  const resolved = await source.resolve(result);
  assert.equal(calls.length, 1); assert.match(resolved.debridLink, new RegExp('^magnet:\\?xt=urn:btih:'+hash+'&dn='));
  assert.equal(resolved.fileSize, 1073741824); assert.equal(resolved.url, undefined); assert.equal(resolved.fileName, undefined);
  assert.equal(new URLSearchParams(resolved.debridLink.slice(8)).get('dn'), result.title);
});
test('saved result still resolves after a process restart without its cache', async () => {
  const first = load(); const [result] = await first.source.search('test');
  const next = load(() => { throw new Error('must not request'); });
  assert.match((await next.source.resolve(JSON.parse(JSON.stringify(result)))).debridLink, new RegExp(hash));
  assert.equal(next.calls.length, 0);
});
test('invalid IDs and zero hashes cannot trigger resolution even if a URL is present', async () => {
  const { source } = load();
  for (const id of ['', '123', '../123:'+hash, '0:'+hash, '123:'+'0'.repeat(40), '123:bad']) {
    await assert.rejects(source.resolve({ id, url:'magnet:?xt=urn:btih:'+hash }), /no valid download identity/);
  }
});
test('keeps zero seeders for cached releases; invalid counts and unspecified formats remain unknown', () => {
  const { source } = load();
  assert.equal(source._item(release({ seeders:'0', name:'Book' })).availability, 0);
  assert.equal(source._item(release({ seeders:'bad', name:'Book MP3 M4B' })).availability, undefined);
  assert.equal(source._item(release({ seeders:-1 })).seeders, undefined);
  assert.equal(source._item(release({ seeders:null, size:'bad', added:'bad', name:'Book' })).format, 'audiobook');
  assert.equal(source._item(release({ size:'bad' })).size, undefined);
});
test('deduplicates simultaneous searches and caches results without sharing mutable data', async () => {
  const { source, calls, advance } = load();
  const [a,b] = await Promise.all([source.search('test'), source.search('test')]);
  assert.equal(calls.length, 1); a[0].title = 'mutated'; a[0].extra.sizeBytes = 1;
  assert.notEqual(b[0].title, 'mutated'); assert.equal((await source.search('test'))[0].extra.sizeBytes, 1073741824);
  advance(60001); await source.search('test'); assert.equal(calls.length, 2);
});
test('cache remains bounded and blank or further-page searches never repeat the first page', async () => {
  const { source, calls } = load();
  assert.equal((await source.search('')).length, 0); assert.equal((await source.search('test', 2)).length, 0); assert.equal(calls.length, 0);
  for (let i=0;i<12;i++) await source.search('title '+i);
  assert.equal(source._cache.length, 8);
});

test('browse search page one and download search page zero share the first result set', async () => {
  const { source, calls } = load();
  const browse = await source.search('Book', 1);
  assert.equal(browse.length, 1);
  const download = await source.search('Book', 0);
  const unspecified = await source.search('Book');
  assert.equal(download[0].id, browse[0].id);
  assert.equal(unspecified[0].id, browse[0].id);
  assert.equal(calls.length, 1);
  assert.equal((await source.search('Book', 2)).length, 0);
  assert.equal(calls.length, 1);
});
test('429 Retry-After suppresses extra variants then permits a later retry', async () => {
  const { source, calls, advance } = load(async () => ({ status:429,headers:{'Retry-After':'60'},data:'429 Too Many Requests' }));
  await assert.rejects(source.search('first'), e => e.status === 429 && e.stopSearch === true);
  await assert.rejects(source.search('second'), /limiting requests/); assert.equal(calls.length, 1);
  advance(60001); await assert.rejects(source.search('second')); assert.equal(calls.length, 2);
});
test('HTTP error, malformed JSON and oversized responses never look like a successful empty search', async () => {
  for (const response of [{status:403,data:'blocked'}, {status:500,data:'down'}, {status:200,data:'<html>Challenge</html>'},
    {status:200,data:' '.repeat(2000001)}, {status:200,data:{}}, {status:200,data:Array(1001).fill(null)}]) {
    const { source } = load(async () => response); await assert.rejects(source.search('test'), e => e.stopSearch === true);
  }
});
test('failed requests are not retained in the in-flight cache', async () => {
  let first=true; const { source, calls }=load(async()=>{if(first){first=false;throw new Error('timeout')} return {status:200,data:[release()]};});
  await assert.rejects(source.search('test'), e=>e.stopSearch===true);
  assert.equal((await source.search('test')).length,1); assert.equal(calls.length,2);
});
