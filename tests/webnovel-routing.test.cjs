const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'repo.json'), 'utf8'));
for (const id of ['readnovel', 'novelbin', 'novelfire', 'webnovel', 'witchculttranslation', 'luminaretranslations', 'bronstl']) {
  test(`${id}: chapter-only web novels are not advertised as downloadable books`, () => {
    const entry = manifest.extensions.find(source => source.id === id);
    assert.equal(entry.contentType, 'webnovel');
    assert.deepEqual(entry.contentTypes, ['webnovel']);
    const context = vm.createContext({ cinder: { store: { get: async () => null } } });
    vm.runInContext(readFileSync(path.join(root, id + '.js'), 'utf8'), context);
    const source = context.__cinderExport;
    assert.equal(source.version, entry.version);
    assert.equal(source.contentType, 'webnovel');
    assert.deepEqual(Array.from(source.contentTypes), ['webnovel']);
  });
}
