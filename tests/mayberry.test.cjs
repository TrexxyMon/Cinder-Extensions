const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

function loadSource(fetch, secureStore) {
 const context = vm.createContext({ URL, btoa, cinder: { fetch, secureStore } });
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
 assert.equal(meta.version, '0.1.4-cinder');
 for(const field of ['id', 'name', 'version', 'description', 'language', 'contentType', 'excludeFromDefaultMetadataProviders']) assert.equal(meta[field], source[field]);
 assert.deepEqual(meta.contentTypes, plain(source.contentTypes));
 assert.equal(meta.contentType, 'books');
 assert.deepEqual(meta.contentTypes, ['ebook']);
 assert.equal(meta.minCinderVersion, '1.1.0');
 assert.match(meta.scriptUrl, /^https:\/\/cdn\.jsdelivr\.net\/gh\/TrexxyMon\/Cinder-Extensions@[0-9a-f]{40}\/mayberry\.js$/);
 assert.equal(source.capabilities.searchDownloads, true);
 assert.equal(source.capabilities.download, true);
 assert.equal(source.capabilities.resolve, true);
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

test('An invalid JSON catalog fails clearly and a corrected response is fetched on retry', async () => {
 let count = 0;
 const source = loadSource(async () => ++count === 1
  ? {status:200, data:JSON.stringify({metadata:null, links:[]})}
  : response());
 await assert.rejects(source.search('test', 0), /invalid OPDS catalog/);
 assert.equal((await source.search('test', 0)).length, 1);
 assert.equal(count, 2);
});

test('The settings connection check accepts authenticated OPDS navigation and empty search results', async () => {
 for (const catalog of [{navigation:[{href:'/opds/new',title:'New Arrivals'}]}, {links:[]}, {groups:[]}]) {
  const source = loadSource(async (url, options) => {
   assert.equal(url, 'https://mayberry.pub/opds/search?q=test');
   assert.equal(options.headers.Authorization, 'Basic ' + btoa('fixture:fixture'));
   return {status:200, data:JSON.stringify({metadata:{title:'Mayberry Search'}, ...catalog})};
  }, {get:async () => 'fixture'});
  assert.deepEqual(plain(await source.search('test', 0)), []);
 }
});

test('Search and discovery return grouped publications and preserve the first copy and its authenticated cover', async () => {
 const first = publication();
 const duplicate = {...first, metadata:{...first.metadata, title:'Duplicate'}};
 const second = {...first, metadata:{...first.metadata, identifier:'second', title:'Second book'}};
 for (const rootPublications of [[], [first]]) {
  const catalog = {metadata:{title:'Mayberry Search'}, groups:[
   {navigation:[]}, {publications:[first, duplicate]}, {publications:[second]},
  ]};
  if (rootPublications.length) catalog.publications = rootPublications;
  const source = loadSource(async () => ({status:200, data:JSON.stringify(catalog)}), {get:async () => 'fixture'});
  for (const results of [await source.search('test', 0), await source.getDiscoverItems('new', 0)]) {
   assert.deepEqual(Array.from(results, item => item.title), ['Fixture Book', 'Second book']);
   const details = await source.getBookDetails(results[0].id);
   assert.equal(details.title, 'Fixture Book');
   assert.equal(details.coverHeaders.Authorization, 'Basic ' + btoa('fixture:fixture'));
  }
 }
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
 const [item] = source._parseBooks({
  doc:{querySelectorAll(selector) { assert.equal(selector, 'entry'); return [entry]; }},
  url:'https://mayberry.pub/opds/search',
 });
 assert.equal(item.id, 'urn:mayberry:book:fixture');
 assert.equal(item.cover, 'https://mayberry.pub/cover.jpg');
 assert.equal(item.url, 'https://mayberry.pub/book.epub');
 assert.equal(item.author, 'Atom Author');
 assert.equal(item.extra.description, 'Atom synopsis');
 assert.equal(item.extra.summary, item.description);
 assert.equal(item.format, 'epub');
});

test('Mayberry user ID uses secure storage and authenticates catalog, covers, details and downloads', async () => {
 const calls=[], auth='Basic '+btoa('fixture-user:fixture-user');
 const source=loadSource(async (url,options)=>{calls.push({url,options});return response();}, {get:async key=>key==='user_id'?'fixture-user':null});
 assert.equal(source.getSettings()[0].type,'password');
 const [item]=await source.search('Fixture',0);
 assert.equal(calls[0].options.headers.Authorization,auth);
 assert.equal(item.coverHeaders.Authorization,auth);
 assert.equal((await source.getBookDetails(item.id)).coverHeaders.Authorization,auth);
 assert.equal((await source.search('Fixture',0))[0].coverHeaders.Authorization,auth,'cached feed keeps cover authorization');
 assert.equal((await source.resolve(item)).headers.Authorization,auth);
 assert.equal((await source.resolve({...item,url:'https://federated.example/book.epub'})).headers,undefined);
 assert.equal((await source.resolve({...item,url:'https://mayberry.pub.evil.example/book.epub'})).headers,undefined);
 assert.equal((await source.resolve({...item,url:'http://mayberry.pub/book.epub'})).headers,undefined);
});

test('Mayberry authentication failure is actionable and is never retried', async () => {
 let count=0; const source=loadSource(async()=>{count++;return {status:401,data:'Sign in with your Mayberry user ID as both username and password'};});
 await assert.rejects(source.testConnection(),error=>error.status===401&&error.stopSearch&&/user ID/.test(error.message));
 assert.equal(count,1);
 await assert.rejects(source.resolve({url:'https://mayberry.pub/book.epub'}),/user ID/);
 const rejected = loadSource(async () => ({status:403, data:'Access denied'}), {get:async () => 'fixture'});
 await assert.rejects(rejected.search('test', 0), error => error.stopSearch && /user ID/.test(error.message));
});

test('changing Mayberry credentials invalidates cached results', async () => {
 let identity='first',calls=0;const source=loadSource(async()=>{calls++;return response();},{get:async()=>identity});
 await source.search('Fixture',0);identity='second';
 const [item]=await source.search('Fixture',0);
 assert.equal(calls,2);assert.equal(item.coverHeaders.Authorization,'Basic '+btoa('second:second'));
});

test('Mayberry account changes cannot publish a stale in-flight feed or clear its replacement', async () => {
 let identity='first',release,count=0;
 const source=loadSource(async()=>{if(++count===1)return new Promise(resolve=>release=resolve);return response();},{get:async()=>identity});
 const first=source.search('Fixture',0);await new Promise(resolve=>setImmediate(resolve));
 identity='second';const next=await source.search('Fixture',0);
 release(response());await assert.rejects(first,/account changed/);
 assert.equal(next[0].coverHeaders.Authorization,'Basic '+btoa('second:second'));
 assert.equal((await source.search('Fixture',0))[0].coverHeaders.Authorization,next[0].coverHeaders.Authorization);
 assert.equal(count,2);
});
