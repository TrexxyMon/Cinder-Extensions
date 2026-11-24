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
const expoUrls = appRequire('whatwg-url-minimum');
const parser = { exports: {} };
const parserSource = fs.readFileSync(path.join(app, 'src/extensions/HTMLParser.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(parserSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: parser.exports, require: appRequire });
const script = fs.readFileSync(path.join(root, 'audiozaic.js'), 'utf8');

const base = 'https://audiozaic.com';
const host = 'https://surahsofquran.com';
const id = '/book-slug/';
const bookUrl = base + id;
const player = `${base}/file-audio?slug32=3910`;
const title = 'The Clockwork Map';
const author = 'Tess Reed';
const heading = `${title} Audiobook (Clockwork Series, Book# 1.5) – By ${author}`;
const cover = base + '/wp-content/uploads/2025/01/test-cover.jpg';
const audioUrl = n => `https://audio3.audiobookslab.com/audio3/test/Clockwork%20Map%20${n}.mp3`;
const landingUrl = n => `${host}/download/?file=${encodeURIComponent(audioUrl(n))}`;
const finalUrl = n => `${host}/?fd_download=1&file=${encodeURIComponent(audioUrl(n))}`;
const plain = value => JSON.parse(JSON.stringify(value));

function page(body, canonical = bookUrl, meta = '') {
  return `<!doctype html><html><head><link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}">${meta}</head><body>${body}</body></html>`;
}

function catalog(url) {
  return page(`<main id="primary"><article class="vce-post post post-3910 category-audiobook"><div class="meta-image"><a href="${bookUrl}"><img data-src="${cover}" src="data:image/gif;base64,AA"></a></div>
    <h2 class="entry-title"><a href="${bookUrl}" title="${heading}">The Clockwork Map Au…</a></h2></article>
    <a href="/advertiser/">Advertisement</a></main>`, url);
}

function detail() {
  return page(`<main><article id="post-3910" class="vce-single post post-3910 category-audiobook"><header><h1 class="entry-title">${heading}</h1></header>
    <div class="entry-content"><p>A cartographer searches for a lost city.</p><span id="countdown-number">15</span>
    <button id="listen-button" onclick="window.open('${player}', '_blank')">Listen Now</button></div></article></main>`,
  bookUrl, `<meta property="og:type" content="article"><meta property="og:image" content="${cover}">`);
}

function playlist(parts, changeLink = url => url) {
  const files = parts.map(n => `<audio controls><source src="${audioUrl(n)}?_=${n}" type="audio/mpeg"></audio>`).join('');
  const buttons = parts.map(n => `<a class="rp-download-btn" href="${changeLink(landingUrl(n), n)}"><span class="rp-download-label">Part ${n}</span></a>`).join('');
  return page(`<main>${files}<div class="rp-download-grid">${buttons}</div></main>`, player);
}

function landing(n) {
  return page(`<div id="fd-step-1"><button id="fd-start-btn" onclick="fdStartProcess()">Start</button></div>
    <div id="fd-step-2"></div><div id="fd-step-3"></div><div id="fd-step-4" style="display:none">
    <a class="fd-btn-download" href="${finalUrl(n).replace(/&/g, '&amp;')}">Download</a></div>
    <script>var fdDuration = 35000; function fdStartProcess() {} var dlSecs = 10;</script>`, landingUrl(n));
}

// Run the extension's promises and timers against one clock, including overlapping
// waits, while reproducing ExtensionRuntime's actual 30-second cap on each timer.
function clock() {
  let now = Date.UTC(2026, 0, 1);
  const timers = [];
  const delays = [];
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  function setTimer(fn, ms) {
    delays.push(ms);
    const timer = { fn, at: now + Math.max(0, Math.min(Number(ms) || 0, 30000)) };
    timers.push(timer);
    return timer;
  }
  async function settle(promise) {
    let outcome;
    Promise.resolve(promise).then(value => { outcome = { value }; }, error => { outcome = { error }; });
    for (let iteration = 0; iteration < 2000; iteration++) {
      await new Promise(resolve => setImmediate(resolve));
      if (outcome) {
        if (outcome.error) throw outcome.error;
        return outcome.value;
      }
      timers.sort((a, b) => a.at - b.at);
      const timer = timers.shift();
      assert.ok(timer, 'Extension left an operation pending without scheduling its next stage');
      now = timer.at;
      timer.fn();
    }
    assert.fail('Extension did not finish within the fixture timer budget');
  }
  return { Date: FakeDate, setTimeout: setTimer, now: () => now, settle, delays };
}

function load({ parts = [1, 2], changeLink, landingPage = landing, catalogPage = catalog, playerPage = playlist, responseUrl = url => url, trackMedia = audioUrl } = {}) {
  const time = clock();
  const requests = [];
  let inFlight = 0;
  let peakTraffic = 0;
  const api = {
    parseHTML: parser.exports.parseHTML,
    resolveUrl: (input, relativeTo) => new URL(input, relativeTo).href,
    normalizeText: str => str.replace(/\s+/g, ' ').trim(),
    store: { get: async () => null },
    getBrowserSessionHeaders: async () => ({}),
    fetch: async (input, options = {}) => {
      const url = new URL(input);
      const method = options.method || 'GET';
      requests.push({ url: url.href, method, at: time.now() });
      inFlight++;
      peakTraffic = Math.max(inFlight, peakTraffic);
      await new Promise(resolve => time.setTimeout(resolve, 30));
      inFlight--;
      let data;
      if (url.href === bookUrl) data = detail();
      else if (url.href === player) data = playerPage(parts, changeLink);
      else if (url.origin === base && !url.pathname.includes('file-audio')) data = catalogPage(url.href);
      else if (url.origin === host && url.pathname === '/download/') {
        const n = parts.find(part => url.searchParams.get('file') === trackMedia(part));
        assert.ok(n, 'Download landing must refer to a listed MP3');
        data = landingPage(n);
      } else assert.fail(`Unexpected ${method} request to ${url.hostname}${url.pathname}`);
      return { status: 200, data, url: responseUrl(url.href), headers: { 'content-type': 'text/html; charset=utf-8' } };
    },
  };
  const context = vm.createContext({ cinder: api, URL: expoUrls.URL, URLSearchParams: expoUrls.URLSearchParams, Date: time.Date, setTimeout: time.setTimeout });
  vm.runInContext(script, context);
  return { source: context.__cinderExport, time, requests, peakTraffic: () => peakTraffic };
}

test('catalog, discovery and detail expose the full release without entering the download flow', async () => {
  const { source, time, requests } = load();
  const [item] = await time.settle(source.search('clockwork', 1));
  assert.ok(item);
  assert.equal(item.id, id);
  assert.match(item.title, /The Clockwork Map/);
  assert.doesNotMatch(item.title, /Au…|By Tess Reed/i);
  assert.equal(item.author, author);
  assert.equal(item.cover, cover);
  assert.equal(item.contentType, 'audiobooks');
  assert.deepEqual(plain(item.contentTypes), ['audiobook']);
  assert.equal(requests.length, 1);
  const shelves = await time.settle(source.getDiscoverSections());
  assert.ok(shelves.length);
  const [discovered] = await time.settle(source.getDiscoverItems(shelves[0].id, 1));
  assert.equal(discovered.id, id);
  const details = await time.settle(source.getBookDetails(id));
  assert.match(details.title, /The Clockwork Map/);
  assert.equal(details.author, author);
  assert.match(details.description, /cartographer/);
  assert.equal(details.cover, cover);
  assert.ok(requests.every(req => new URL(req.url).origin === base && req.url !== player));
  assert.ok(time.delays.every(ms => ms < 15000));
});

test('download capability defers resolution until tapped and opts out of remote Listen', () => {
  const { source } = load();
  const entry = JSON.parse(fs.readFileSync(path.join(root, 'repo.json'), 'utf8')).extensions.find(item => item.id === source.id);
  assert.equal(source.id, 'audiozaic');
  assert.equal(source.capabilities.resolve, true);
  assert.equal(source.capabilities.searchDownloads, true);
  assert.equal(source.capabilities.resolveOnDownload, true);
  assert.equal(source.capabilities.audioStreaming, false);
  assert.ok(entry, 'Extension must appear in the public repository');
  assert.equal(entry.scriptUrl.replace(/\/[0-9a-f]{40}\//, '/main/'),
    'https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/audiozaic.js');
  assert.equal(entry.version, source.version);
  assert.equal(entry.capabilities.audioStreaming, false);
  assert.equal(entry.capabilities.resolveOnDownload, true);
});

test('a recognized empty catalog page yields zero results and requests the selected page only', async () => {
  const h = load({ catalogPage: url => page('<main id="primary"><article id="post-0">No posts found</article></main>', url) });
  assert.deepEqual(plain(await h.time.settle(h.source.search('Rye & Sea', 2))), []);
  assert.equal(h.requests.length, 1);
  const url = new URL(h.requests[0].url);
  assert.equal(url.pathname, '/page/2/');
  assert.equal(url.searchParams.get('s'), 'Rye & Sea');
});

test('two concurrent selections complete every timed part once in numeric order within the app deadline', async () => {
  const parts = Array.from({ length: 10 }, (_, index) => index + 1);
  const { source, time, requests, peakTraffic } = load({ parts: [1, 10, ...parts.slice(1, 9)] });
  const item = { id, title, url: bookUrl };
  const started = time.now();
  const [result, duplicate] = await time.settle(Promise.all([source.resolve(item), source.resolve(item)]));
  assert.deepEqual(plain(duplicate.audioFiles), plain(result.audioFiles));
  assert.deepEqual(plain(result.audioFiles).map(({ name, title, url }) => ({ name, title, url })),
    parts.map(n => ({ name: `Part ${String(n).padStart(3, '0')}.mp3`, title: `Part ${n}`, url: finalUrl(n) })));
  const playerRequests = requests.filter(req => req.url === player);
  assert.equal(playerRequests.length, 1);
  assert.ok(playerRequests[0].at - started >= 15000, 'Wait out the book countdown before entering its player');
  for (const n of parts) {
    const visits = requests.filter(req => req.url === landingUrl(n));
    assert.equal(visits.length, 1);
    assert.ok(time.now() - visits[0].at >= 45000, `Part ${n} must complete both advertised countdowns`);
  }
  assert.ok(time.now() - started < 120000, 'Finish while the extension resolver is active');
  assert.ok(peakTraffic() < parts.length, 'The request pool must not open every part at once');
  assert.ok(time.delays.every(ms => ms <= 30000), 'Cinder shortens each timer to 30 seconds');
});

test('a malformed part in the playlist cannot become a partial audiobook or trigger a foreign request', async () => {
  const { source, time, requests } = load({ changeLink: (url, part) => part === 2 ? 'https://ads.example/offer' : url });
  await assert.rejects(time.settle(source.resolve({ id, title, url: bookUrl })));
  assert.ok(requests.every(req => new URL(req.url).hostname !== 'ads.example'));
});

test('resolves all 37 chapter-labelled tracks on the second media host in reading order', async () => {
  const parts = Array.from({ length: 37 }, (_, i) => 37 - i);
  const useChapterHost = html => html.replaceAll('audio3.audiobookslab.com', 'free2.audiobookslab.com');
  const h = load({ parts, trackMedia: n => useChapterHost(audioUrl(n)), landingPage: n => useChapterHost(landing(n)),
    playerPage: list => useChapterHost(playlist(list)).replaceAll('>Part ', '>Chapter ') });
  const result = await h.time.settle(h.source.resolve({ id, title, url: bookUrl }));
  assert.deepEqual(plain(result.audioFiles), parts.slice().reverse().map(n => ({
    url: useChapterHost(finalUrl(n)), title: 'Chapter ' + n, name: 'Chapter ' + String(n).padStart(3, '0') + '.mp3',
  })));
});

test('keeps incomplete chapters, duplicate media and unrelated lookalike hosts out of the transfer queue', async () => {
  for (const [edit, message] of [
    [html => html.replace('>Part 2<', '>Chapter 3<'), /missing or duplicate parts/i],
    [html => html.replace(landingUrl(2), landingUrl(1)), /same audio twice/i],
    [html => html.replaceAll('audio3.audiobookslab.com', 'free2.audiobookslab.com.example'), /unsupported download link/i],
  ]) {
    const h = load({ playerPage: list => edit(playlist(list)) });
    await assert.rejects(h.time.settle(h.source.resolve({ id, title, url: bookUrl })), message);
    assert.ok(h.requests.every(request => new URL(request.url).origin === base));
  }
});

test('a final redirect for another part cannot replace the expected part', async () => {
  const { source, time } = load({ landingPage: n => n === 2 ? landing(1) : landing(n) });
  await assert.rejects(time.settle(source.resolve({ id, title, url: bookUrl })));
});

test('a mismatched list of duplicate audio sources cannot pass as the complete edition', async () => {
  const h = load({ playerPage: parts => playlist(parts).replace(`src="${audioUrl(2)}?_=2"`, `src="${audioUrl(1)}?_=1"`) });
  await assert.rejects(h.time.settle(h.source.resolve({ id, title, url: bookUrl })));
});

test('playback URLs with nonnumeric or unrelated query values cannot identify a bare download', async () => {
  for (const query of ['_=alternate', 'version=2', '_=1&amp;version=2']) {
    const h = load({ playerPage: parts => playlist(parts).replace(`src="${audioUrl(1)}?_=1"`, `src="${audioUrl(1)}?${query}"`) });
    await assert.rejects(h.time.settle(h.source.resolve({ id, title, url: bookUrl })), `Ambiguous query ${query}`);
  }
});

test('a newly advertised wait exceeding the app deadline cannot produce a premature link', async () => {
  const h = load({ landingPage: n => n === 2 ? landing(n).replace('35000;', '110000;') : landing(n) });
  await assert.rejects(h.time.settle(h.source.resolve({ id, title, url: bookUrl })));
  assert.ok(h.requests.every(req => !req.url.includes('fd_download=')));
});

test('retry after one failed part starts fresh and yields every part', async () => {
  let firstAttempt = true;
  const h = load({ landingPage: n => firstAttempt && n === 2 ? page('<main>Temporarily unavailable</main>') : landing(n) });
  const item = { id, title, url: bookUrl };
  await assert.rejects(h.time.settle(h.source.resolve(item)));
  firstAttempt = false;
  const retried = await h.time.settle(h.source.resolve(item));
  assert.deepEqual(plain(retried.audioFiles.map(file => file.url)), [finalUrl(1), finalUrl(2)]);
  assert.equal(h.requests.filter(req => req.url === landingUrl(2)).length, 2);
  assert.ok(h.time.now() - h.requests.filter(req => req.url === landingUrl(2))[1].at >= 45000);
});

test('a foreign redirect carrying otherwise convincing download markup is rejected', async () => {
  const h = load({ responseUrl: url => url === landingUrl(2) ? 'https://other.example/download/' : url });
  await assert.rejects(h.time.settle(h.source.resolve({ id, title, url: bookUrl })));
  assert.ok(h.requests.every(req => !req.url.includes('fd_download=')));
});
