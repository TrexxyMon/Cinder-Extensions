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
const title = 'The Sea of Monsters: Percy Jackson and the Olympians: Book 2 (Unabridged)';
const work = 'The Sea of Monsters';
const hash = '0123456789abcdef0123456789abcdef01234567';
function load(id) {
  const requests = [];
  const context = { setTimeout, clearTimeout, cinder: { parseHTML: parser.exports.parseHTML,
    fetch: async url => {
      requests.push(url);
      const parsed = new URL(url), query = parsed.searchParams.get(id === 'audiobookbay' ? 's' : 'q');
      const found = query?.toLowerCase() === work.toLowerCase();
      let data;
      if (id === 'audiobookbay') data = `<div id="content"><h1 class="archiveTitle">Search results</h1>${found
        ? `<div class="post"><div class="postTitle"><h2><a href="https://audiobookbay.lu/abss/example/">${work} - Rick Riordan</a></h2></div></div>`
        : 'Please try again with another query'}</div>`;
      else if (id === 'knaben-audiobooks') data = { hits: found ? [{ hash, title: work, categoryId: [1003000] }] : [] };
      else data = found ? [{ id: '12345', name: work, category: '102', info_hash: hash }] : [];
      return { status: 200, data };
    } } };
  vm.runInNewContext(fs.readFileSync(path.join(root, id + '.js'), 'utf8'), context);
  return { source: context.__cinderExport, normalize: context.cinderAudiobookCatalogQuery, requests };
}

for (const id of ['audiobookbay', 'knaben-audiobooks', 'thepiratebay-audiobooks']) {
  test(id + ': exact iTunes title works through the existing search API, without new host helpers', async () => {
    const h = load(id);
    const results = await h.source.search(title, 0);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, work);
    assert.equal(h.requests.length, 1);
    assert.equal(new URL(h.requests[0]).searchParams.get(id === 'audiobookbay' ? 's' : 'q'), id === 'audiobookbay' ? work.toLowerCase() : work);
    // Same cache/first-page behavior applies to direct search and installed builds.
    const direct = await h.source.search(work, 1);
    assert.equal(direct[0].id, results[0].id);
    assert.equal(h.requests.length, 1);
  });
  test(id + ': old Cinder query variants reach the normalized raw-title attempt', async () => {
    const h = load(id);
    const oldPrimary = 'The Sea of Monsters: Percy Jackson and the Olympians';
    assert.equal((await h.source.search(oldPrimary, 0)).length, 0);
    assert.equal((await h.source.search(oldPrimary + ' Rick Riordan', 0)).length, 0);
    assert.equal((await h.source.search(title, 0)).length, 1);
    assert.ok(h.requests.length <= 3);
  });
  test(id + ': only explicit split-series suffixes change; meaningful titles and malformed annotations stay intact', () => {
    const h = load(id);
    for (const query of [title, title.replace('2', 'Two'), title.replace('Book 2', 'Volume II'), title.replace(/:/g, ' —'), title.replace(' (Unabridged)', ''), title + ' (English Edition)', title.replace(' (Unabridged)', ': Unabridged')]) {
      assert.equal(h.normalize(query), work, query);
    }
    assert.equal(h.normalize('Hidden City: The Beginning: Example Series: Book 2'), 'Hidden City: The Beginning');
    for (const query of [work, 'The Hobbit (Unabridged)', 'Example Universe: Hidden City', 'Hidden City: Part 2: Aftermath',
      'Hidden City: Aftermath: Part 2', 'Hidden City: Example Series: Book IIII', 'Hidden City: Example Series: Book Mix',
      'Hidden City: Example Series: Book 2: Aftermath', 'Hidden City: Example Series: Book 2 (Revised)',
      'Hidden City (Notes: Example Series: Book 2)', 'Hidden City: Example Series: Book 2 (Unabridged',
      'Universe, Book 1: Example Series: Book 2', title + ' Rick Riordan']) {
      assert.equal(h.normalize(query), query, query);
    }
    assert.equal(h.normalize('x'.repeat(2049)), 'x'.repeat(2049));
    assert.equal(h.normalize(null), '');
  });
}
