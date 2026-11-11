const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const script = fs.readFileSync(path.join(__dirname, '../knaben-audiobooks.js'), 'utf8');
const HASH = '0123456789abcdef0123456789abcdef01234567';
const OTHER = 'a'.repeat(40);
function row(patch = {}) { return { hash: HASH, title: 'Synthetic Title - Author [M4B]', categoryId: [1000000, 1003000],
  seeders: 8, liveSeeders: 12, bytes: 1073741824, date: '2026-11-01T12:00:00+00:00', tracker: 'Example tracker',
  magnetUrl: `magnet:?xt=urn:btih:${HASH}&tr=udp%3A%2F%2Ftracker.example.org%3A6969%2Fannounce`, ...patch }; }
function load(fetcher = async () => ({ status: 200, data: { hits: [row()] } })) {
  const calls = [], delays = []; let now = 1800000000000;
  class Clock extends Date { static now() { return now; } }
  const ctx = { Date: Clock, setTimeout: (fn, ms) => { delays.push(ms); now += ms; fn(); },
    cinder: { fetch: async (url, options) => { calls.push({ url, options, at: now }); return fetcher(url, options); } } };
  vm.runInNewContext(script, ctx);
  return { source: ctx.__cinderExport, calls, delays, advance: ms => { now += ms; } };
}

test('published manifest and executable extension agree on identity and audiobook requirements', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../repo.json'), 'utf8').replace(/^\uFEFF/, ''));
  const s = load().source, entry = manifest.extensions.find(item => item.id === s.id);
  assert.ok(entry);
  for (const key of ['name', 'version', 'contentType', 'debridSupport', 'excludeFromDefaultMetadataProviders']) assert.equal(entry[key], s[key]);
  assert.deepEqual(entry.contentTypes, Array.from(s.contentTypes));
  assert.equal(entry.language, s.language);
  assert.equal(entry.minCinderVersion, '1.2.4');
  assert.equal(new URL(entry.scriptUrl).pathname, '/TrexxyMon/Cinder-Extensions/main/knaben-audiobooks.js');
  assert.equal(s.capabilities.searchDownloads, true);
  assert.equal(s.capabilities.resolve, true);
});
test('uses audiobook category on the documented GET endpoint and returns real counts', async () => {
  const h = load(); const result = (await h.source.search('Title & Author', 2))[0];
  const u = new URL(h.calls[0].url);
  assert.equal(u.origin + u.pathname, 'https://api.knaben.org/v2/search');
  assert.equal(u.searchParams.get('q'), 'Title & Author'); assert.equal(u.searchParams.get('c'), '1003000');
  assert.equal(u.searchParams.get('f'), '40'); assert.equal(u.searchParams.get('s'), '40');
  for (const key of ['xxx', 'unsafe']) assert.equal(u.searchParams.has(key), false);
  assert.equal(u.searchParams.has('dead'), true);
  assert.equal(h.calls[0].options.timeout, 5000);
  assert.equal(result.contentType, 'audiobooks'); assert.equal(result.availability, 12); assert.equal(result.seeders, 12);
  assert.equal(result.availabilityLabel, 'Seeders'); assert.equal(result.size, '1.0 GB'); assert.equal(result.format, 'm4b');
  assert.equal(result.cover, undefined); assert.equal(result.author, undefined);
});
test('retains zero, distinguishes unavailable counts, and rejects invalid counts', () => {
  const s = load().source;
  assert.equal(s._item(row({ liveSeeders: 0 })).availability, 0);
  assert.equal(s._item(row({ liveSeeders: null })).availability, 8);
  assert.equal(s._item(row({ liveSeeders: -1, seeders: '10' })).availability, 10);
  for (const bad of [null, false, -1, 0.4, 'many', '', Infinity, 1e20]) {
    assert.equal(s._item(row({ liveSeeders: bad, seeders: bad })).availability, undefined);
  }
});

test('zero-peer releases stay discoverable and exact-hash resolution survives source inactivity', async () => {
  const h = load(async url => ({ status: 200, data: { hits: new URL(url).searchParams.has('dead')
    ? [row({ liveSeeders: 0, seeders: 0 })] : [] } }));
  const [item] = await h.source.search('Book');
  assert.ok(item);
  assert.equal(item.availability, 0);
  h.advance(61000);
  const resolved = await h.source.resolve(item);
  assert.match(resolved.debridLink, new RegExp('^magnet:\\?xt=urn:btih:' + HASH));
  assert.equal(h.calls.length, 2);
  const lookup = new URL(h.calls[1].url);
  assert.equal(lookup.searchParams.get('sf'), 'hash');
  assert.equal(lookup.searchParams.get('q'), HASH);
  assert.equal(lookup.searchParams.get('dead'), '');
  assert.equal(lookup.searchParams.get('c'), '1003000');
});
test('rejects non-audiobook results even if the server ignores its category filter', async () => {
  const h = load(async () => ({ status: 200, data: { hits: [row({ categoryId: [7001000] }), row({ categoryId: [1001000] }), row({ categoryId: null }), row()] } }));
  assert.equal((await h.source.search('Book')).length, 1);
});
test('never guesses an audio file name or uses page/ad URLs as a download', async () => {
  const h = load(); const items = await h.source.search('Title'); const resolved = await h.source.resolve(items[0]);
  assert.match(resolved.debridLink, new RegExp('^magnet:\\?xt=urn:btih:' + HASH));
  assert.match(resolved.debridLink, /tr=udp%3A/); assert.equal(resolved.fileSize, 1073741824);
  assert.equal(resolved.url, undefined); assert.equal(resolved.fileName, undefined); assert.equal(resolved.audioFiles, undefined);
  assert.equal(h.calls.length, 1);
});
test('rejects conflicting or malformed identity, including encoded conflicts', () => {
  const s = load().source;
  for (const patch of [{ hash: 'bad' }, { magnetUrl: 'https://example.org/ad' }, { magnetUrl: 'magnet:?xt=urn:btih:' + OTHER },
    { magnetUrl: 'magnet:?xt=urn%3Abtih%3A' + HASH + '&xt=urn:btih:' + OTHER }, { magnetUrl: 'magnet:?xt=%xx' },
    { hash: null, magnetUrl: null }]) assert.equal(s._item(row(patch)), null);
  assert.equal(s._item(row({ hash: null })).id, HASH);
  assert.equal(s._item(row({ magnetUrl: null })).id, HASH);
  assert.equal(s._hash('A'.repeat(32)), '');
});

test('zero torrent identities cannot become downloadable search results', async () => {
  const h = load(async () => ({ status: 200, data: { hits: [
    row({ hash: '0'.repeat(40), magnetUrl: null }),
    row({ hash: null, magnetUrl: 'magnet:?xt=urn:btih:' + 'A'.repeat(32) }), row(),
  ] } }));
  const results = await h.source.search('Book');
  assert.equal(results.length, 1);
  assert.equal(results[0].id, HASH);
  await assert.rejects(h.source.resolve({ id: '0'.repeat(40) }), /Invalid/);
  assert.equal(h.calls.length, 1);
});
test('deduplicates the same release across trackers without adding their counts', async () => {
  const h = load(async () => ({ status: 200, data: { hits: [row(), row({ tracker: 'Second', liveSeeders: 300 }), row({ hash: OTHER, magnetUrl: null })] } }));
  const items = await h.source.search('Book'); assert.equal(items.length, 2); assert.equal(items[0].availability, 12); assert.equal(items[1].id, OTHER);
});
test('concurrent identical searches coalesce and callers cannot mutate cached identity', async () => {
  const h = load(); const [a, b] = await Promise.all([h.source.search('Book'), h.source.search('Book')]);
  assert.equal(h.calls.length, 1); a[0].extra.magnet = 'bad'; b[0].title = 'edited';
  assert.equal((await h.source.search('Book'))[0].title, row().title);
  assert.match((await h.source.resolve(a[0])).debridLink, /magnet:/);
});
test('after expiry, lookup is by exact hash and refuses similarly named other releases', async () => {
  let hits = [row()]; const h = load(async () => ({ status: 200, data: { hits } }));
  const original = (await h.source.search('Book'))[0]; h.advance(61000);
  hits = [row({ hash: OTHER, magnetUrl: null })];
  await assert.rejects(h.source.resolve(original), /no longer available/);
  const u = new URL(h.calls[1].url); assert.equal(u.searchParams.get('sf'), 'hash'); assert.equal(u.searchParams.get('q'), HASH);
  const count = h.calls.length; await assert.rejects(h.source.resolve({ id: 'https://unrelated.test' }), /Invalid/); assert.equal(h.calls.length, count);
});
test('serial request spacing and response cooldown prevent rapid repeat traffic', async () => {
  const h = load(); await h.source.search('One'); await h.source.search('Two');
  assert.equal(h.delays[0], 2100); assert.ok(h.calls[1].at - h.calls[0].at >= 2100);
  const limited = load(async () => ({ status: 429, headers: { 'Retry-After': '90' } }));
  await assert.rejects(limited.source.search('One'), /limiting/); limited.advance(31000);
  await assert.rejects(limited.source.search('Two'), /limiting/); assert.equal(limited.calls.length, 1);
});
test('malformed data and timeouts are actionable, not an empty successful search', async () => {
  for (const response of [{ status: 200, data: '<html>Unavailable</html>' }, { status: 200, data: { other: [] } }, { status: 503, data: {} }]) {
    await assert.rejects(load(async () => response).source.search('Book'), /Knaben/);
  }
  await assert.rejects(load(async () => { throw Error('timeout'); }).source.search('Book'), /could not be reached/);
  assert.equal((await load(async () => ({ status: 200, data: '{"hits":[]}' })).source.search('Absent')).length, 0);
});
test('only documented discovery sections browse and use the same category', async () => {
  const h = load(); assert.equal((await h.source.getDiscoverSections()).length, 2);
  await h.source.getDiscoverItems('latest', 1); assert.equal(new URL(h.calls[0].url).pathname, '/v2/browse');
  assert.equal(new URL(h.calls[0].url).searchParams.get('o'), 'date');
  assert.equal(new URL(h.calls[0].url).searchParams.has('dead'), true);
  assert.equal((await h.source.getDiscoverItems('unknown')).length, 0); assert.equal(h.calls.length, 1);
});
test('cache, response size and page inputs are bounded', async () => {
  const h = load(); for (let i = 0; i < 15; i++) await h.source.search('Query ' + i);
  assert.equal(h.source._cache.length, 12);
  await h.source.search('Page', Infinity); assert.equal(new URL(h.calls.at(-1).url).searchParams.get('f'), '0');
  await assert.rejects(load(async () => ({ status: 200, data: { hits: Array(301).fill(row()) } })).source.search('Book'), /unsupported/);
});
