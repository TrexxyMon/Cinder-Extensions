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

function source() {
  const context = vm.createContext({ URL, cinder: { ...parser.exports, normalizeText: String, store: { get: async () => undefined } } });
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
