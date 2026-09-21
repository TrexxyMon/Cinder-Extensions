const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'repo.json'), 'utf8'));
const versions = {
 readnovel: '0.1.2-cinder', novelbin: '0.1.7-cinder', novelfire: '0.1.9-cinder',
 webnovel: '0.1.4-cinder', witchculttranslation: '0.1.4',
 swaytranslations: '0.1.1-cinder', elscione: '0.1.1-cinder',
};
function load(id) {
 const context = vm.createContext({ cinder: { store: { get: async () => null } } });
 vm.runInContext(readFileSync(path.join(root, id + '.js'), 'utf8'), context);
 return context.__cinderExport;
}
for (const [id, version] of Object.entries(versions)) {
 test(id + ': published metadata and runtime select novels, not general books', () => {
  const entries = manifest.extensions.filter(entry => entry.id === id);
  assert.equal(entries.length, 1);
  const entry = entries[0];
  const source = load(id);
  assert.equal(source.id, id);
  assert.equal(source.version, version);
  assert.equal(entry.version, source.version);
  assert.equal(source.contentType, 'webnovel');
  assert.equal(entry.contentType, source.contentType);
  const expectedTypes = id === 'elscione' ? ['webnovel', 'manga'] : ['webnovel'];
  assert.deepEqual(Array.from(source.contentTypes), expectedTypes);
  assert.deepEqual(entry.contentTypes, expectedTypes);
  assert.deepEqual(Array.from(source.contentSubtypes), entry.contentSubtypes);
  assert.ok(entry.contentSubtypes.includes('lightNovel'));
  assert.ok(entry.language);
  assert.equal(entry.scriptUrl, 'https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/' + id + '.js');
  assert.equal(typeof source.search, 'function');
  assert.equal(source.capabilities.search, true);
  if (id === 'swaytranslations' || id === 'elscione') {
   assert.equal(source.capabilities.searchDownloads, true);
   assert.equal(source.capabilities.resolve, true);
   assert.equal(typeof source.resolve, 'function');
  } else {
   assert.equal(source.capabilities.bookChapters, true);
   assert.equal(typeof source.getBookChapters, 'function');
   assert.equal(typeof source.getBookChapter, 'function');
  }
 });
}

test('ElScione retains mixed file access while tagging light novel results correctly', () => {
 const source = load('elscione');
 assert.deepEqual(Array.from(source.ROOTS, root => root.id), [
  'official-light-novels', 'lnwncentral', 'manga', 'books', 'tmw-ebooks', 'untranslated-light-novels',
 ]);
 for (const id of ['official-light-novels', 'untranslated-light-novels', 'lnwncentral']) {
  const root = source.ROOTS.find(root => root.id === id);
  assert.equal(root.contentType, 'webnovel');
  const item = source._resultFromFile({href: root.href + 'Fixture.epub', size: 2048}, root);
  assert.equal(item.extra.contentType, 'webnovel');
  assert.equal(item.extra.rootId, id);
  assert.equal(item.format, 'epub');
 }
 assert.equal(source.ROOTS.find(root => root.id === 'manga').contentType, 'manga');
 assert.equal(source.ROOTS.find(root => root.id === 'books').contentType, 'ebook');
 assert.equal(source.ROOTS.find(root => root.id === 'tmw-ebooks').contentType, 'ebook');
 assert.deepEqual(Object.keys(source.SUPPORTED_EXTENSIONS).sort(), ['cbr','cbz','epub','pdf']);
});
