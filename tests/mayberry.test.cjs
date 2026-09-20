const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

function loadSource(fetch) {
 const context = vm.createContext({ URL, cinder: { fetch } });
 vm.runInContext(readFileSync(path.join(root, 'mayberry.js'), 'utf8'), context);
 return context.__cinderExport;
}
function publication() {
 return {
  metadata: {
   identifier: 'urn:isbn:9780000000002', title: 'Fixture Book',
   author: [{name:'Fixture Author'}], description: 'Fixture synopsis',
   language: ['en'], subject: ['Fiction'], modified: '2026-09-01T00:00:00Z',
  },
  images: [{href:'/covers/fixture.jpg'}],
  links: [{rel:'http://opds-spec.org/acquisition', type:'application/epub+zip', href:'/files/fixture.epub', properties:{numberOfBytes:2048}}],
 };
}
function response() {
 return {status:200, data:JSON.stringify({metadata:{title:'Mayberry'}, publications:[publication()]})};
}

test('Mayberry public manifest preserves identity, category and backwards-compatible minimum version', () => {
 const manifest = JSON.parse(readFileSync(path.join(root, 'repo.json'), 'utf8'));
 const entries = manifest.extensions.filter(entry => entry.id === 'mayberry');
 assert.equal(entries.length, 1);
 const meta = entries[0];
 const source = loadSource(async () => {throw Error('Unexpected network call');});
 assert.equal(meta.version, '0.1.2-cinder');
 for(const field of ['id', 'name', 'version', 'description', 'language', 'contentType', 'excludeFromDefaultMetadataProviders']) assert.equal(meta[field], source[field]);
 assert.deepEqual(meta.contentTypes, plain(source.contentTypes));
 assert.equal(meta.contentType, 'books');
 assert.deepEqual(meta.contentTypes, ['ebook']);
 assert.equal(meta.minCinderVersion, '1.1.0');
 assert.equal(meta.scriptUrl, 'https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/mayberry.js');
 assert.equal(source.capabilities.searchDownloads, true);
 assert.equal(source.capabilities.download, true);
 assert.equal(source.capabilities.resolve, false);
});

test('Search preserves stable IDs, direct downloads, covers and legacy metadata fields', async () => {
 const calls = [];
 const source = loadSource(async (url, options) => {calls.push({url, options}); return response();});
 const results = await source.search('Fixture & Book', 0);
 assert.equal(calls[0].url, 'https://mayberry.pub/opds/search?q=Fixture%20%26%20Book');
 assert.equal(calls[0].options.timeout, 15000);
 assert.equal(results.length, 1);
 const item = results[0];
 assert.equal(item.id, 'urn:isbn:9780000000002');
 assert.equal(item.title, 'Fixture Book');
 assert.equal(item.author, 'Fixture Author');
 assert.equal(item.url, 'https://mayberry.pub/files/fixture.epub');
 assert.equal(item.cover, 'https://mayberry.pub/covers/fixture.jpg');
 assert.equal(item.coverHighResolution, item.cover);
 assert.equal(item.format, 'epub');
 assert.equal(item.size, '2048');
 assert.equal(item.language, 'English');
 assert.equal(item.isbn, '9780000000002');
 assert.equal(item.extra.description, item.description);
 assert.equal(item.extra.summary, item.description);
 assert.equal(item.extra.downloadUrl, item.url);
 assert.deepEqual(plain(item.genres), ['Fiction']);
 const details = await source.getBookDetails(item.id);
 assert.equal(details.cover, item.cover);
 assert.equal(details.description, item.description);
 assert.equal(calls.length, 1, 'Details reuse search metadata without extra requests');
});

test('Identical concurrent searches share a request and reuse the bounded feed cache', async () => {
 let count = 0;
 const source = loadSource(async () => {count++; await Promise.resolve(); return response();});
 const [a,b] = await Promise.all([source.search('Fixture', 0),source.search('Fixture', 0)]);
 assert.deepEqual(plain(a), plain(b));
 await source.search('Fixture', 0);
 assert.equal(count, 1);
 for(let i=0;i<60;i++) source._rememberFeed('fixture-'+i, '{}');
 assert.equal(source._feedCacheOrder.length, 48);
});

test('All discovery shelves and search pagination retain their original endpoints', async () => {
 const calls = [];
 const source = loadSource(async url => {calls.push(url); return response();});
 const sections = await source.getDiscoverSections();
 assert.deepEqual(plain(sections).map(section=>section.id), ['releases', 'new', 'popular']);
 for(const section of sections) await source.getDiscoverItems(section.id, 2);
 await source.search('Fixture', 3);
 assert.deepEqual(calls, [
  'https://mayberry.pub/opds/releases?page=2',
  'https://mayberry.pub/opds/new?page=2',
  'https://mayberry.pub/opds/popular?page=2',
  'https://mayberry.pub/opds/search?q=Fixture&page=3',
 ]);
 assert.deepEqual(plain(await source.getDiscoverItems('unknown', 0)), []);
 assert.deepEqual(plain(await source.search(' ', 0)), []);
 assert.equal(calls.length, 4);
});

test('Connection checks validate the catalog rather than accepting a generic HTML page', async () => {
 assert.equal(await loadSource(async()=>response()).testConnection(), true);
 const source = loadSource(async()=>({status:200,data:'<html>Not a catalog</html>'}));
 await assert.rejects(source.testConnection(), /web page instead of its OPDS catalog/);
});

test('Legacy Atom entry mapping preserves original IDs, full covers and synopsis aliases', () => {
 const source = loadSource(async()=>{throw Error('Unexpected network call');});
 const text = value => ({text:()=>value});
 const link = attrs => ({attr:name=>attrs[name]});
 const entry = {
  querySelector: selector => ({title:text('Atom Book'),id:text('urn:mayberry:book:fixture'),summary:text('Atom synopsis'),updated:text('2026-09-01')}[selector] || null),
  querySelectorAll: selector => ({
   'author name':[text('Atom Author')], category:[link({term:'Fiction'})],
   link:[link({rel:'http://opds-spec.org/image/thumbnail',href:'/thumb.jpg'}),link({rel:'http://opds-spec.org/image',href:'/cover.jpg'}),link({rel:'http://opds-spec.org/acquisition',type:'application/epub+zip',href:'/book.epub'})],
  }[selector] || []),
 };
 const item = source._parseEntry(entry, 'https://mayberry.pub/opds/search');
 assert.equal(item.id, 'urn:mayberry:book:fixture');
 assert.equal(item.cover, 'https://mayberry.pub/cover.jpg');
 assert.equal(item.url, 'https://mayberry.pub/book.epub');
 assert.equal(item.author, 'Atom Author');
 assert.equal(item.extra.description, 'Atom synopsis');
 assert.equal(item.extra.summary, item.description);
 assert.equal(item.format, 'epub');
});
