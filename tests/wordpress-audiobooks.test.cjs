const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = process.env.CINDER_APP || [path.resolve(root, '../cinder'), path.resolve(root, '../..')]
  .find(dir => fs.existsSync(path.join(dir, 'src/extensions/HTMLParser.ts')));
if (!app) throw new Error('Set CINDER_APP to the Cinder checkout to use its HTML parser.');
const appRequire = createRequire(path.join(app, 'package.json'));
const ts = appRequire('typescript');
const expo = appRequire('whatwg-url-minimum');
const parser = { exports: {} };
const parserSource = fs.readFileSync(path.join(app, 'src/extensions/HTMLParser.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(parserSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: parser.exports, require: appRequire });

const id = '/the-glass-harbor-audiobook/';
const title = 'The Glass Harbor';
const author = 'Ada Brook';
const sources = [
  { id: 'fulllengthaudiobooks', mediaHost: 'ipaudio.club', directory: 'HQ/PIRMAS', fullLength: true },
  { id: 'bookaudiobooks', mediaHost: 'ipaudio6.com', directory: 'BOOKAUDIO', fullLength: false },
];
const catalogEntries = JSON.parse(fs.readFileSync(path.join(root, 'repo.json'), 'utf8')).extensions;
const versionModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(app, 'src/extensions/ExtensionScriptVersion.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: versionModule.exports });
const base = site => 'https://' + site.id + '.com';
const book = (site, n = 1) => base(site) + id + (n === 1 ? '' : n + '/');
const cover = site => base(site) + '/wp-content/uploads/2021/02/harbor.jpg';
const track = (site, n) => `https://${site.mediaHost}/wp-content/uploads/${site.directory}/Glass%20Harbor/${String(n).padStart(2, '0')}.mp3`;
const heading = site => `${author} – ${title} Audiobook${site.fullLength ? ' Free' : ''}`;
const ad = '<div class="code-block code-block-1"><a href="https://tinyurl.com/offer">Download and Keep Forever</a></div>';

function article(body) {
  return `<article id="post-1871" class="post-1871 post type-post status-publish format-standard has-post-thumbnail hentry">${body}</article>`;
}

function document(site, content, bodyClass, canonical) {
  const region = site.fullLength ? `<section id="content" class="primary">${content}</section>` :
    `<div id="primary"><main id="main" class="site-main">${content}</main></div>`;
  const head = canonical ? `<link rel="canonical" href="${canonical}">` : '';
  return `<!doctype html><html><head>${head}</head><body class="${bodyClass}">${region}</body></html>`;
}

function catalog(site, empty = false) {
  if (empty) {
    const message = site.fullLength ? '<h1 class="archive-title">Search Results for: no results</h1><div class="type-page"><h2 class="page-title entry-title">No matches</h2></div>' :
      '<section class="no-results not-found"><header class="page-header"><h1 class="page-title">Nothing Found</h1></header></section>';
    return document(site, message, 'search search-no-results');
  }
  const link = `<a href="${book(site)}" rel="bookmark">${heading(site)}</a>`;
  const image = `<img class="wp-post-image" src="${cover(site)}">`;
  const card = site.fullLength ?
    `<h2 class="entry-title post-title">${link}</h2><div class="entry clearfix">${ad}<div class="wp-caption aligncenter">${image}</div></div>` :
    `<div class="image-hover-wrapper"><a href="${book(site)}">${image}</a></div><header class="entry-header"><h2 class="entry-title">${link}</h2></header>`;
  return document(site, article(card), 'search search-results');
}

function player(url, index) {
  return `<audio class="wp-audio-shortcode" controls="controls" id="audio-1871-${index}" preload="none"><source type="audio/mpeg" src="${url}?_=${index}"><a href="${url}">${url}</a></audio>`;
}

function detail(site, page, { tracks = [page], links = [], extraNavigation = '', playerMarkup, canonical = book(site, page) } = {}) {
  const linksHtml = links.map(n => n === page ?
    `<span aria-current="page" class="post-page-numbers current">${n}</span>` :
    `<a class="post-page-numbers" href="${book(site, n)}">${n}</a>`).join(' ');
  const numbers = 'Pages: ' + linksHtml + extraNavigation;
  const nav = `<div class="page-links">${links.length ? (site.fullLength ? '<p class="post-nav-links">' + numbers + '</p>' : numbers) : ''}</div>`;
  const image = `<img src="${cover(site)}" alt="${title} Audio Book">`;
  const figure = site.fullLength ? `<div class="wp-caption aligncenter">${image}</div>` : `<figure class="wp-caption aligncenter">${image}</figure>`;
  const audio = playerMarkup === undefined ? tracks.map((n, i) => player(track(site, n), i + 1)).join('') : playerMarkup;
  const body = `${ad}${page === 1 ? figure : ''}${audio}${nav}`;
  const content = site.fullLength ?
    `<h1 class="entry-title post-title">${heading(site)}</h1><div class="entry-meta postmeta clearfix"><a rel="author" href="/author/hq/">hq</a></div><div class="entry clearfix">${body}</div>` :
    `<header class="entry-header"><h1 class="entry-title">${heading(site)}</h1></header><div class="entry-content">${body}</div>`;
  return document(site, article(content), 'single single-post postid-1871', canonical);
}

function load(site, handler) {
  const requests = [];
  async function fetch(input) {
    const url = new URL(input);
    requests.push(url);
    const response = handler(url);
    if (typeof response === 'string') return { status: 200, url: url.href, data: response, headers: {} };
    return { status: 404, url: url.href, data: '', headers: {}, ...response };
  }
  const runtime = vm.createContext({
    URL: expo.URL, URLSearchParams: expo.URLSearchParams,
    cinder: {
      parseHTML: parser.exports.parseHTML, fetch, fetchBrowser: fetch,
      resolveUrl: (input, relativeTo) => new expo.URL(input, relativeTo).href,
      normalizeText: value => value.replace(/\s+/g, ' ').trim(),
      getBrowserSessionHeaders: async () => ({}),
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, site.id + '.js'), 'utf8'), runtime);
  return { source: runtime.__cinderExport, requests };
}

for (const site of sources) {
  test(site.id + ' has an installable catalog version and matching capabilities', () => {
    const [meta, ...duplicates] = catalogEntries.filter(row => row.id === site.id);
    assert.equal(duplicates.length, 0);
    assert.equal(meta.scriptUrl.replace(/\/[0-9a-f]{40}\//, '/main/'),
      `https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/${site.id}.js`);
    const { source } = load(site, () => assert.fail('Installation does not need a title'));
    const script = fs.readFileSync(path.join(root, site.id + '.js'), 'utf8');
    versionModule.exports.assertExtensionScriptVersion(script, meta.version);
    assert.equal(source.id, meta.id);
    assert.equal(source.version, meta.version);
    assert.deepEqual(JSON.parse(JSON.stringify(source.capabilities)), meta.capabilities);
    assert.ok(source.capabilities.audioStreaming && source.capabilities.resolveOnDownload);
  });

  test(site.id + ' preserves encoded book names and media parameters while removing only the player counter', async () => {
    const encoded = '/caf%C3%A9-audiobook/';
    const signed = track(site, 1) + '?token=a%2Fb+c&expires=123';
    const markup = '<audio><source src="' + signed.replace('&', '&amp;') + '&amp;_=1"></audio>';
    const { source } = load(site, url => url.pathname === '/' ? catalog(site).replaceAll(id, encoded) :
      detail(site, 1, { canonical: base(site) + encoded, playerMarkup: markup }));
    const [item] = await source.search('café', 1);
    assert.equal(item.id, encoded);
    const { audioFiles } = await source.resolve(item);
    assert.equal(audioFiles[0].url, signed);
    await assert.rejects(source.getBookDetails('/bad%2f'));
  });

  test(site.id + ' maps search, discovery and detail to one canonical audiobook', async () => {
    const { source, requests } = load(site, url => url.pathname === id ? detail(site, 1) : catalog(site));
    const [result] = await source.search('harbor & sea', 2);
    assert.equal(requests[0].pathname, '/page/2/');
    assert.equal(requests[0].searchParams.get('s'), 'harbor & sea');
    const [discovery] = await source.getDiscoverItems('latest', 1);
    assert.equal(requests[1].pathname, '/');
    const details = await source.getBookDetails(id);
    for (const item of [result, discovery, details]) {
      assert.equal(item.id, id);
      assert.equal(item.title, title);
      assert.equal(item.author, author);
      assert.equal(item.cover, cover(site));
    }
    assert.ok(requests.every(url => url.origin === base(site)));
  });

  test(site.id + ' recognizes its empty-search template', async () => {
    const { source } = load(site, () => catalog(site, true));
    assert.equal((await source.search('no results', 1)).length, 0);
  });

  test(site.id + ' preserves page and player order while deduplicating repeated media URLs', async () => {
    const pages = [1, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    const { source, requests } = load(site, url => {
      const n = pages.find(n => book(site, n) === url.href);
      if (n) return detail(site, n, { links: pages, tracks: n === 1 ? [2, 1, 2] : n === 2 ? [1, 3] : [n + 1] });
    });
    const { audioFiles } = await source.resolve({ id });
    const paths = Array.from(audioFiles, file => new URL(file.url).origin + new URL(file.url).pathname);
    assert.deepEqual(paths, [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(n => track(site, n)));
    assert.deepEqual(requests.map(url => url.href).sort(), pages.map(n => book(site, n)).sort());
  });

  test(site.id + ' cannot resolve a partial book if an advertised continuation is missing or redirects', async () => {
    for (const failure of ['missing', 'redirect', 'repeated page']) {
      const { source, requests } = load(site, url => {
        if (url.href === book(site)) return detail(site, 1, { links: [1, 2] });
        if (url.href === book(site, 2) && failure === 'redirect') {
          return { status: 200, url: base(site) + '/another-book/', data: detail(site, 2) };
        }
        if (url.href === book(site, 2) && failure === 'repeated page') {
          return detail(site, 1, { links: [1, 2] });
        }
      });
      await assert.rejects(source.resolve({ id }), failure);
      assert.ok(requests.some(url => url.href === book(site, 2)));
    }
  });

  test(site.id + ' detects a skipped page number without guessing its address', async () => {
    const { source, requests } = load(site, url => {
      if (url.href === book(site)) return detail(site, 1, { links: [1, 3] });
      if (url.href === book(site, 3)) return detail(site, 3, { links: [1, 3] });
    });
    await assert.rejects(source.resolve({ id }));
    assert.ok(requests.every(url => url.href === book(site) || url.href === book(site, 3)));
  });

  test(site.id + ' never follows a continuation link to another host or book', async () => {
    const foreign = `<a class="post-page-numbers" href="https://ads.example${id}2/">2</a><a class="post-page-numbers" href="${base(site)}/another-book/3/">3</a>`;
    const { source, requests } = load(site, url => {
      if (url.href === book(site)) return detail(site, 1, { links: [1], extraNavigation: foreign });
    });
    // Either ignore unrelated links or reject the broken navigation entirely.
    const result = await source.resolve({ id }).then(value => value, () => null);
    if (result) assert.deepEqual(Array.from(result.audioFiles, file => new URL(file.url).pathname), [new URL(track(site, 1)).pathname]);
    assert.ok(requests.every(url => url.href === book(site)));
  });

  test(site.id + ' rejects an empty or unsupported player even alongside playable audio and an ad', async () => {
    for (const broken of ['', '<audio class="wp-audio-shortcode" controls></audio>', player('https://ads.example/offer.mp3', 2)]) {
      const { source, requests } = load(site, url => {
        if (url.href === book(site)) return detail(site, 1, { links: [1, 2] });
        if (url.href === book(site, 2)) {
          return detail(site, 2, { links: [1, 2], playerMarkup: broken && player(track(site, 2), 1) + broken });
        }
      });
      await assert.rejects(source.resolve({ id }));
      assert.ok(requests.some(url => url.href === book(site, 2)));
      assert.ok(requests.every(url => url.origin === base(site)));
    }
  });
}
