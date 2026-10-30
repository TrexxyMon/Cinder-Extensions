const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const sourceFile = process.env.ZLIBRARY_SOURCE || path.join(__dirname, '..', 'zlibrary.js');
const code = fs.readFileSync(sourceFile, 'utf8');
const primary = 'https://primary.example.test', backup = 'https://backup.example.test';
const book = { id: 123, hash: 'abc123', title: 'Example', author: 'Author', extension: 'epub', language: 'english', filesizeString: '2 MB', cover: 'https://covers.example.test/cover.jpg', description: 'Description' };
const item = { id: 'zlibrary:123', title: 'Example', format: 'epub', extra: { livreId: '123', hash: 'abc123' } };
const json = (data, status = 200) => ({ status, data: JSON.stringify(data) });
const good = () => json({ success: 1, books: [book] });
const challenge = () => ({ status: 403, data: '<title>Just a moment</title><script>challenge-platform</script>' });
const plain = value => JSON.parse(JSON.stringify(value));
function harness(t, { values = {}, secrets = {}, fetch, browser, noClearTimeout = false, clock } = {}) {
  const store = new Map(Object.entries({ domaine: primary, ...values }));
  const secure = new Map(Object.entries(secrets)), calls = [], browserCalls = [], logs = [], timers = [];
  const writes = [], secureWrites = [];
  const cinder = {
    store: { get: async key => store.get(key), set: async (key, value) => { writes.push({ key, value }); store.set(key, value); } },
    secureStore: { get: async key => secure.get(key), set: async (key, value) => { secureWrites.push({ key, value }); secure.set(key, value); } },
    normalizeText: value => String(value),
    log: (...args) => logs.push(args.join(' ')), warn: (...args) => logs.push(args.join(' ')),
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === extension._MIRROR_SOURCE) return json({ success: 1, domains: [{ domain: 'remote.example.test' }] });
      if (fetch) return fetch(url, options);
      if (url.includes('/user/login')) return json({ success: 1, user: { id: 12, remix_userkey: 'new-key' } });
      if (url.endsWith('/file')) return json({ success: 1, file: { downloadLink: primary + '/files/book.epub', extension: 'epub' } });
      return good();
    },
  };
  if (browser) cinder.fetchBrowser = async (url, options) => { browserCalls.push({ url, options }); return browser(url, options); };
  const context = vm.createContext({ cinder, setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); timers.push(timer); return timer; }, ...(noClearTimeout ? {} : { clearTimeout }), ...(clock ? { Date: { now: clock } } : {}) });
  vm.runInContext(code, context); const extension = context.__cinderExport;
  extension._SEEDS = [primary, backup];
  t.after(() => timers.forEach(clearTimeout));
  return { source: extension, cinder, store, secure, calls, browserCalls, logs, writes, secureWrites,
    apiCalls: () => calls.filter(call => call.url !== extension._MIRROR_SOURCE) };
}

test('retains legacy settings, identity, anonymous search and saved result schema', async t => {
  const h = harness(t); const settings = h.source.getSettings();
  assert.ok(Array.isArray(settings), 'older hosts require a synchronous settings array');
  for (const key of ['domaine', 'langues', 'email', 'motdepasse']) assert.ok(settings.find(s => s.id === key));
  assert.equal(h.source.id, 'zlibrary');
  const results = await h.source.search('Example', 0);
  assert.equal(results[0].id, 'zlibrary:123');
  assert.equal(results[0].extra.livreId, '123');
  assert.equal(results[0].extra.hash, 'abc123');
  assert.equal(results[0].description, book.description);
  assert.equal(results[0].title, 'Example — english · epub · 2 MB');
  assert.ok(!h.apiCalls()[0].options.headers.Cookie);
  assert.equal(h.apiCalls().length, 1);
  assert.equal(h.secureWrites.length, 0);
});

test('format filtering preserves language filters, pagination and form encoding', async t => {
  const h = harness(t, { values: { langues: 'fr; english', preferred_format: 'pdf' } });
  await h.source.search('A & B', 3);
  const fields = new URLSearchParams(h.apiCalls()[0].options.body);
  assert.equal(fields.get('message'), 'A & B'); assert.equal(fields.get('page'), '3');
  assert.equal(fields.get('languages[0]'), 'french'); assert.equal(fields.get('languages[1]'), 'english');
  assert.equal(fields.get('extensions[]'), 'pdf');
});

test('nullable API error fields do not reject successful responses', async t => {
  const h = harness(t, { fetch: async () => json({ success: 1, error: null, message: null, books: [book] }) });
  assert.equal((await h.source.search('Example', 1)).length, 1);
  assert.equal(h.apiCalls().length, 1);
});

test('verification follows the chosen domain after automatic mirrors are disabled', async t => {
  const h = harness(t, { values: { automatic_mirrors: 'false', working_mirror_v1: JSON.stringify({ preferred: primary, base: backup }) } });
  h.source._lastChallengeBase = backup;
  h.source._lastChallengePreferred = primary;
  assert.equal((await h.source.getSettingsAsync()).find(setting => setting.id === 'verify_website').url, primary);
  assert.equal(h.calls.length, 0);
});

for (const failure of [challenge(), { status: 513, data: 'wall' }, { status: 503, data: '<html>offline</html>' }, new Error('network'), { status: 0, data: '' }, { status: 200, data: '<html>login</html>' }, json({ unrelated: true })]) {
  test('automatically fails over unusable mirror: ' + (failure.status ?? failure.message), async t => {
    const h = harness(t, { fetch: async url => { if (!url.startsWith(primary)) return good(); if (failure instanceof Error) throw failure; return failure; } });
    assert.equal((await h.source.search('Example', 1)).length, 1);
    assert.equal(h.apiCalls().length, 2);
    assert.ok(h.apiCalls()[1].url.startsWith(backup));
    assert.equal(h.store.get('domaine'), primary);
    await h.source.search('Example', 1);
    assert.ok(h.apiCalls()[2].url.startsWith(backup));
  });
}

test('a new selected domain supersedes a previously remembered mirror', async t => {
  const h = harness(t, { values: { working_mirror_v1: JSON.stringify({ preferred: 'https://old.example.test', base: backup }) } });
  await h.source.search('Example', 1); assert.ok(h.apiCalls()[0].url.startsWith(primary));
});
test('manual-only mode does not refresh or contact any other mirror', async t => {
  const h = harness(t, { values: { automatic_mirrors: 'false' }, fetch: async () => challenge() });
  await assert.rejects(h.source.search('Example', 1), /verification/);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].url, primary + '/eapi/book/search');
});
test('the first successful API call does not wait for mirror list refresh', async t => {
  const h = harness(t); const original = h.cinder.fetch;
  h.cinder.fetch = (url, options) => url === h.source._MIRROR_SOURCE ? new Promise(() => {}) : original(url, options);
  assert.equal((await h.source.search('Example', 1)).length, 1);
});
test('weekly fresh cache skips refresh; stale cache survives refresh failure', async t => {
  const h = harness(t, { values: { mirror_cache_v1: JSON.stringify({ at: Date.now(), domains: ['https://cached.example.test'] }) } });
  await h.source.search('Example', 1); assert.equal(h.calls.length, 1);
  const original = h.cinder.fetch;
  h.store.set('mirror_cache_v1', JSON.stringify({ at: 1, domains: ['https://cached.example.test'] }));
  h.cinder.fetch = (url, options) => url === h.source._MIRROR_SOURCE ? Promise.reject(new Error('offline')) : original(url, options);
  const candidates = await h.source._candidates();
  await h.source._mirrorRefresh;
  assert.ok(candidates.domains.includes('https://cached.example.test'));
  assert.deepEqual(JSON.parse(h.store.get('mirror_cache_v1')).domains, ['https://cached.example.test']);
});
test('mirror list refresh coalesces and excludes invalid, redirect-only and content-disabled entries', async t => {
  const h = harness(t); let finish, refreshes = 0;
  h.cinder.fetch = (url, options) => { if (url !== h.source._MIRROR_SOURCE) return good(); refreshes++; return new Promise(resolve => { finish = resolve; }); };
  await Promise.all([h.source._candidates(), h.source._candidates()]);
  assert.equal(refreshes, 1);
  finish(json({ success: 1, domains: [{ domain: 'new.example.test' }, { domain: 'new.example.test' }, { domain: 'disabled.example.test', contentAvailable: false }, { domain: 'redirect.example.test', isRedirector: true }, { domain: 'evil.example.test/path' }, { domain: 'evil@example.test' }, { domain: '127.0.0.1' }, { domain: 'http://unsafe.example.test' }] }));
  await h.source._mirrorRefresh;
  assert.deepEqual(JSON.parse(h.store.get('mirror_cache_v1')).domains, ['https://new.example.test']);
});
test('legitimate empty results never contact another catalogue', async t => {
  const h = harness(t, { fetch: async () => json({ success: 1, books: [] }) });
  assert.equal((await h.source.search('none', 1)).length, 0); assert.equal(h.apiCalls().length, 1);
});
test('exact matches and alternate results arrays are decoded without losing stable IDs', async t => {
  for (const data of [{ success: 1, books: [], exactMatch: { books: [book] } }, { success: 1, results: [book] }, { success: 1, books: {}, results: [book] }]) {
    const h = harness(t, { fetch: async () => json(data) });
    assert.equal((await h.source.search('Example', 1))[0].id, 'zlibrary:123');
  }
});
test('decodes object, BOM, double-encoded JSON and balanced trailing noise', t => {
  const h = harness(t); const value = { success: 1, books: [], message: 'brace } in "text"' };
  for (const input of [value, '\ufeff' + JSON.stringify(value), JSON.stringify(JSON.stringify(value)), 'prefix ' + JSON.stringify(value) + ' extra { noise']) {
    assert.deepEqual(plain(h.source._parseJson(input)), value);
  }
  for (const input of ['<html><script>{"success":1}</script></html>', 'not json', '{bad', '[]', 'null', '"string"']) assert.equal(h.source._parseJson(input), null);
});
test('public discovery and signed-in shelf identities remain unchanged', async t => {
  const h = harness(t); assert.deepEqual(plain(await h.source.getDiscoverSections()).map(s => s.id), ['populaires']);
  h.secure.set('user_id', '12'); h.secure.set('user_key', 'old-key');
  assert.deepEqual(plain(await h.source.getDiscoverSections()).map(s => s.id), ['populaires', 'recommandes', 'enregistres', 'telecharges']);
  assert.equal((await h.source.getDiscoverItems('populaires', 1)).length, 1);
  const before = h.apiCalls().length; assert.equal((await h.source.getDiscoverItems('populaires', 2)).length, 0); assert.equal(h.apiCalls().length, before);
  await h.source.getDiscoverItems('enregistres', 2); assert.match(h.apiCalls().at(-1).url, /page=2&limit=30/);
});
test('pasted session key is read only from secure storage and bypasses password login', async t => {
  const h = harness(t, { values: { remix_userid: '42' }, secrets: { remix_userkey: 'secret-key' } });
  const result = await h.source.resolve(item);
  assert.match(result.headers.Cookie, /remix_userid=42; remix_userkey=secret-key/);
  assert.equal(h.apiCalls().length, 1); assert.equal(h.secureWrites.length, 0);
  assert.equal((await h.source.getSettings()).find(s => s.id === 'remix_userkey').type, 'password');
});
test('legacy cached session still resolves an old saved result with required download headers', async t => {
  const h = harness(t, { secrets: { user_id: '12', user_key: 'legacy-key' } });
  const result = await h.source.resolve(Object.freeze(item));
  assert.equal(result.url, primary + '/files/book.epub'); assert.equal(result.fileName, 'Example.epub');
  assert.match(result.headers.Cookie, /legacy-key/); assert.equal(result.headers.Referer, primary + '/');
});
test('expired account session reconnects once, preserving secure store keys', async t => {
  let downloads = 0;
  const h = harness(t, { values: { email: 'reader@example.test' }, secrets: { motdepasse: 'password', user_id: '12', user_key: 'old-key' }, fetch: async url => {
    if (url.endsWith('/login')) return json({ success: 1, user: { id: 12, remix_userkey: 'new-key' } });
    if (++downloads === 1) return json({ error: 'authentication required' }, 401);
    return json({ success: 1, file: { downloadLink: primary + '/file.epub' } });
  } });
  assert.match((await h.source.resolve(item)).headers.Cookie, /new-key/);
  assert.equal(h.apiCalls().filter(c => c.url.endsWith('/login')).length, 1);
  assert.equal(h.secure.get('user_key'), 'new-key');
  assert.equal(h.secure.get('session_email_v1'), 'reader@example.test');
});
test('rejected manual keys are actionable and never cause password login or mirror cycling', async t => {
  const h = harness(t, { values: { remix_userid: '42' }, secrets: { remix_userkey: 'expired' }, fetch: async () => json({ error: 'authentication required' }, 401) });
  await assert.rejects(h.source.resolve(item), /Update or clear/); assert.equal(h.apiCalls().length, 1);
});
test('invalid credentials stop login at first definitive API failure', async t => {
  const h = harness(t, { values: { email: 'reader@example.test' }, secrets: { motdepasse: 'private-password' }, fetch: async () => json({ success: 0, error: 'wrong password' }) });
  await assert.rejects(h.source.resolve(item), /rejected the sign-in/);
  assert.equal(h.apiCalls().length, 1); assert.equal(h.secureWrites.length, 0);
  assert.ok(!JSON.stringify(h.writes).includes('private-password'));
});
test('parallel downloads share one login', async t => {
  let finish; const h = harness(t, { values: { email: 'reader@example.test' }, secrets: { motdepasse: 'password' }, fetch: async url => {
    if (url.endsWith('/login')) return new Promise(resolve => { finish = resolve; });
    return json({ success: 1, file: { downloadLink: primary + '/file.epub' } });
  } });
  const one = h.source.resolve(item), two = h.source.resolve(item);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.apiCalls().filter(c => c.url.endsWith('/login')).length, 1);
  finish(json({ success: 1, user: { id: 12, remix_userkey: 'new-key' } }));
  assert.equal((await Promise.all([one, two])).length, 2);
});
test('account changes during login cannot save the old account response', async t => {
  let finish; const h = harness(t, { values: { email: 'old@example.test' }, secrets: { motdepasse: 'password' }, fetch: async () => new Promise(resolve => { finish = resolve; }) });
  const pending = h.source.resolve(item); await new Promise(resolve => setImmediate(resolve));
  h.store.set('email', 'new@example.test'); finish(json({ success: 1, user: { id: 12, remix_userkey: 'old-account-key' } }));
  await assert.rejects(pending, /Account settings changed/); assert.equal(h.secureWrites.length, 0);
});
test('expired session does not break anonymous search or force login', async t => {
  const h = harness(t, { secrets: { user_id: '12', user_key: 'old-key' }, fetch: async (_url, opts) => opts.headers.Cookie ? json({ error: 'authentication required' }, 401) : good() });
  assert.equal((await h.source.search('Example', 1)).length, 1); assert.equal(h.apiCalls().length, 2);
  assert.ok(h.apiCalls().every(c => !c.url.endsWith('/login')));
});
for (const data of [{ success: 1, file: { allowDownload: false } }, { success: 0, message: 'Daily download limit exceeded' }]) {
  test('quota refusal stops all mirror/login/browser retries', async t => {
    const h = harness(t, { secrets: { user_id: '12', user_key: 'key' }, fetch: async () => json(data), browser: async () => { throw Error('must not open'); } });
    await assert.rejects(h.source.resolve(item), /daily.*limit/); assert.equal(h.apiCalls().length, 1); assert.equal(h.browserCalls.length, 0);
  });
}
test('JSON rate limit does not multiply requests across mirrors', async t => {
  const h = harness(t, { fetch: async () => json({ error: 'rate limit' }, 429) });
  await assert.rejects(h.source.search('Example', 1), /limiting requests/); assert.equal(h.apiCalls().length, 1);
});
test('plain HTML rate limit and JSON quota on HTTP 403 do not trigger authentication or mirror retries', async t => {
  for (const response of [{ status: 429, data: '<html>Too many requests</html>' }, json({ error: 'Daily download limit exceeded' }, 403)]) {
    const h = harness(t, { secrets: { user_id: '12', user_key: 'key' }, fetch: async () => response });
    await assert.rejects(h.source.resolve(item), /limiting requests|daily.*limit/);
    assert.equal(h.apiCalls().length, 1);
  }
});
test('browser fallback uses GET only, stays optional, and decodes JSON in a pre element', async t => {
  const h = harness(t, { values: { automatic_mirrors: 'false' }, fetch: async () => challenge(), browser: async () => ({ status: 200, data: '<html><pre>response</pre></html>' }) });
  h.cinder.parseHTML = () => ({ querySelector: () => ({ text: () => JSON.stringify({ success: 1, books: [book] }) }) });
  assert.equal((await h.source.getDiscoverItems('populaires', 1)).length, 1);
  assert.equal(h.browserCalls.length, 1); assert.equal(h.browserCalls[0].options.headers['X-Cinder-Suppress-Interactive'], '1');
  await assert.rejects(h.source.search('Example', 1), /verification/); assert.equal(h.browserCalls.length, 2);
  assert.equal(h.browserCalls[1].url, primary + '/');
  assert.equal(h.browserCalls[1].options.method, 'GET');
  assert.equal(h.browserCalls[1].options.body, undefined);
});
test('older host without browser API or clearTimeout still searches and resolves', async t => {
  const h = harness(t, { noClearTimeout: true, secrets: { user_id: '12', user_key: 'key' } });
  assert.equal((await h.source.search('Example', 1)).length, 1); assert.equal((await h.source.resolve(item)).fileName, 'Example.epub');
});
test('browser failure retains manual verification and configured domain in settings', async t => {
  const h = harness(t, { values: { automatic_mirrors: 'false' }, fetch: async () => challenge(), browser: async () => challenge() });
  await assert.rejects(h.source.getDiscoverItems('populaires', 1), /verification/);
  const settings = await h.source.getSettings(); assert.equal(settings.find(s => s.id === 'verify_website').url, primary);
});
test('settings remain editable when the stored domain is malformed', async t => {
  const h = harness(t, { values: { domaine: 'https://bad@domain.test/path' } });
  assert.ok((await h.source.getSettingsAsync()).find(s => s.id === 'domaine'));
  await assert.rejects(h.source.search('Example', 1), /valid HTTPS/);
  assert.equal(h.calls.length, 0);
});

test('newer hosts can load the verification URL from saved settings without any network requests', async t => {
  const h = harness(t); const settings = await h.source.getSettingsAsync();
  assert.equal(settings.find(s => s.id === 'verify_website').url, primary);
  assert.equal(h.calls.length, 0);
});
test('the shared budget stops hanging requests and no late response starts another mirror', async t => {
  let finish; const h = harness(t, { values: { automatic_mirrors: 'false' }, fetch: () => new Promise(resolve => { finish = resolve; }) });
  const run = h.source._run; h.source._run = function (_budget, options, work) { return run.call(this, 20, options, work); };
  const keepAlive = setTimeout(() => {}, 1000);
  await assert.rejects(h.source.search('Example', 1), /timed out/); clearTimeout(keepAlive);
  finish(challenge()); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.apiCalls().length, 1); assert.equal(h.writes.length, 0);
});
test('cancelled operations start no network requests', async t => {
  const h = harness(t); await assert.rejects(h.source.search('Example', 1, null, { signal: { aborted: true } }), /cancelled/);
  assert.equal(h.calls.length, 0);
});
test('a failed cache write cannot turn a successful request into a failed search', async t => {
  const h = harness(t); h.cinder.store.set = async () => { throw Error('disk failure'); };
  assert.equal((await h.source.search('Example', 1)).length, 1);
});
test('download cookies stay on the mirror and its subdomains, never unrelated signed hosts', async t => {
  for (const [link, sendCookie] of [[primary + '/file.epub', true], [backup + '/file.epub', true], ['https://files.primary.example.test/file.epub', true], ['https://signed.example.test/file.epub?token=opaque', false], ['https://evilprimary.example.test/file.epub', false], ['/file.epub', true]]) {
    const h = harness(t, { secrets: { user_id: '12', user_key: 'private-key' }, fetch: async () => json({ success: 1, file: { downloadLink: link } }) });
    const result = await h.source.resolve(item); assert.equal(Boolean(result.headers.Cookie), sendCookie, link);
    assert.ok(!h.logs.join(' ').includes('private-key'));
  }
});
for (const link of ['http://unsafe.example.test/file.epub', 'javascript:alert(1)', 'https://user:pass@host.example.test/file.epub', 'https://host.example.test/file\nepub']) {
  test('rejects unsafe download link ' + JSON.stringify(link), async t => {
    const h = harness(t, { secrets: { user_id: '12', user_key: 'key' }, fetch: async () => json({ success: 1, file: { downloadLink: link } }) });
    await assert.rejects(h.source.resolve(item), /invalid download link/);
  });
}

test('a remembered working mirror does not rewrite the cache on each search', async t => {
  const h = harness(t, { values: { working_mirror_v1: JSON.stringify({ preferred: primary, base: primary }) } });
  await h.source.search('Example', 1);
  assert.equal(h.writes.filter(write => write.key === 'working_mirror_v1').length, 0);
});

test('manual website clearance is combined with explicit account keys on the same origin only', async t => {
  const h = harness(t, { values: { remix_userid: '42' }, secrets: { remix_userkey: 'manual-key' } });
  const origins = [];
  h.cinder.getBrowserSessionHeaders = async origin => { origins.push(origin); return { Cookie: 'remix_userid=99; remix_userkey=other-key; cf_clearance=verified' }; };
  const result = await h.source.resolve(item);
  assert.match(h.apiCalls()[0].options.headers.Cookie, /cf_clearance=verified/);
  assert.match(result.headers.Cookie, /remix_userid=42; remix_userkey=manual-key/);
  assert.ok(!result.headers.Cookie.includes('other-key'));
  assert.ok(origins.every(origin => origin === primary));
});

test('failed optional browser-cookie lookup never breaks old API downloads', async t => {
  const h = harness(t, { secrets: { user_id: '12', user_key: 'key' } });
  h.cinder.getBrowserSessionHeaders = async () => { throw Error('missing native support'); };
  assert.equal((await h.source.resolve(item)).fileName, 'Example.epub');
});

test('challenged search warms the public origin then retries the exact POST with fresh cookies', async t => {
  let cleared = false;
  const h = harness(t, { values: { automatic_mirrors: 'false', langues: 'english', preferred_format: 'epub' },
    fetch: async (_url, options) => options.headers.Cookie === 'cf_clearance=fresh' ? good() : challenge(),
    browser: async () => { cleared = true; return { status: 200, data: '<html><body>Catalogue</body></html>' }; } });
  h.cinder.getBrowserSessionHeaders = async base => { assert.equal(base, primary); return cleared ? { Cookie: 'cf_clearance=fresh' } : {}; };
  assert.equal((await h.source.search('Private & query', 3)).length, 1);
  assert.equal(h.browserCalls.length, 1);
  const request = h.browserCalls[0];
  assert.equal(request.url, primary + '/'); assert.equal(request.options.method, 'GET');
  assert.equal(request.options.body, undefined); assert.equal(request.options.headers.Cookie, undefined);
  assert.equal(request.options.headers['Content-Type'], undefined);
  assert.equal(request.options.headers['User-Agent'], h.apiCalls()[0].options.headers['User-Agent']);
  assert.equal(request.options.headers['X-Cinder-Suppress-Interactive'], '1');
  assert.ok(request.options.timeout <= 5000);
  assert.equal(h.apiCalls().length, 2);
  assert.equal(h.apiCalls()[0].options.body, h.apiCalls()[1].options.body);
  assert.equal(h.apiCalls()[1].options.method, 'POST');
  assert.ok(!JSON.stringify(request).includes('Private'));
});

test('challenged sign-in retries privately and preserves explicit account keys for download', async t => {
  let cleared = false;
  const h = harness(t, { values: { automatic_mirrors: 'false', email: 'user@example.test' }, secrets: { motdepasse: 'secret-password' },
    fetch: async (url, options) => {
      if (!cleared || !options.headers.Cookie?.includes('cf_clearance=fresh')) return challenge();
      if (url.endsWith('/login')) return json({ success: 1, user: { id: 12, remix_userkey: 'new-key' } });
      assert.match(options.headers.Cookie, /remix_userid=12; remix_userkey=new-key/);
      return json({ success: 1, file: { downloadLink: primary + '/book.epub' } });
    }, browser: async () => { cleared = true; return { status: 200, data: '<html>Catalogue</html>' }; } });
  h.cinder.getBrowserSessionHeaders = async () => cleared ? { Cookie: 'cf_clearance=fresh; remix_userid=99; remix_userkey=stale-key' } : {};
  assert.equal((await h.source.resolve(item)).fileName, 'Example.epub');
  assert.equal(h.browserCalls.length, 1);
  assert.ok(!JSON.stringify(h.browserCalls).includes('secret-password'));
  assert.ok(!JSON.stringify(h.browserCalls).includes('user@example.test'));
  assert.equal(h.apiCalls()[0].options.body, h.apiCalls()[1].options.body);
  assert.equal(h.secure.get('user_key'), 'new-key');
});

test('healthy API and successful mirror fallback never start browser warm-up', async t => {
  for (const primaryFails of [false, true]) {
    const h = harness(t, { fetch: async url => primaryFails && url.startsWith(primary) ? challenge() : good(), browser: async () => { throw Error('unexpected browser'); } });
    assert.equal((await h.source.search('Example', 1)).length, 1);
    assert.equal(h.browserCalls.length, 0);
  }
});

for (const response of [challenge(), { status: 0, data: '' }, { status: 200, data: '' }, { status: 200, data: '  ' }, { status: 503, data: '<html>Unavailable</html>' }]) {
  test('unsuccessful warm-up leaves manual verification available: ' + response.status + '/' + response.data.length, async t => {
    const h = harness(t, { values: { automatic_mirrors: 'false' }, fetch: async () => challenge(), browser: async () => response });
    await assert.rejects(h.source.search('Example', 1), /Verify Website/);
    assert.equal(h.apiCalls().length, 1); assert.equal(h.browserCalls.length, 1);
    assert.equal((await h.source.getSettingsAsync()).find(s => s.id === 'verify_website').url, primary);
  });
}

test('a browser transport rejection stays an actionable verification error', async t => {
  const h = harness(t, { values: { automatic_mirrors: 'false' }, fetch: async () => challenge(), browser: async () => { throw Error('native browser unavailable'); } });
  await assert.rejects(h.source.search('Example', 1), /Verify Website/);
  assert.equal(h.apiCalls().length, 1); assert.equal(h.source._browserTask, null);
});

test('persistent challenge after warm-up retries only once', async t => {
  const h = harness(t, { values: { automatic_mirrors: 'false' }, fetch: async () => challenge(), browser: async () => ({ status: 200, data: '<html>Home</html>' }) });
  await assert.rejects(h.source.search('Example', 1), /Verify Website/);
  assert.equal(h.apiCalls().length, 2); assert.equal(h.browserCalls.length, 1);
  assert.ok(!h.writes.some(write => write.key === 'working_mirror_v1'));
});

test('quota or rate limit on the retried POST never starts another fallback', async t => {
  for (const response of [json({ success: 0, message: 'Daily download limit exceeded' }), json({ error: 'rate limited' }, 429)]) {
    let cleared = false;
    const h = harness(t, { values: { automatic_mirrors: 'false' }, fetch: async () => cleared ? response : challenge(), browser: async () => { cleared = true; return { status: 200, data: '<html>Home</html>' }; } });
    await assert.rejects(h.source.search('Example', 1), /daily.*limit|limiting requests/);
    assert.equal(h.apiCalls().length, 2); assert.equal(h.browserCalls.length, 1);
  }
});

test('in-flight warm-up is shared for one origin and blocked for a different origin', async t => {
  let finish;
  const h = harness(t, { browser: () => new Promise(resolve => { finish = resolve; }) });
  const ctx = () => ({ deadline: Date.now() + 13500 });
  const first = h.source._warmPostOrigin(primary, ctx());
  const second = h.source._warmPostOrigin(primary, ctx());
  assert.equal(await h.source._warmPostOrigin(backup, ctx()), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.browserCalls.length, 1);
  finish({ status: 200, data: '<html>Home</html>' });
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(h.source._browserTask, null); assert.equal(h.source._warmupTask, null);
});

test('deadline/cancellation during warm-up prevents a late POST or remembered mirror', async t => {
  for (const cancel of [false, true]) {
    const signal = { aborted: false };
    let now = Date.now();
    const h = harness(t, { values: { automatic_mirrors: 'false' }, clock: () => now, fetch: async () => challenge(),
      browser: async () => { if (cancel) signal.aborted = true; else now += 14000; return { status: 200, data: '<html>Home</html>' }; } });
    await assert.rejects(h.source.search('Example', 1, null, { signal }), /cancelled|timed out/);
    assert.equal(h.apiCalls().length, 1); assert.equal(h.browserCalls.length, 1);
    assert.equal(h.writes.length, 0);
  }
});

test('slow failing mirrors reserve time for warm-up and a POST retry inside the search budget', async t => {
  let now = Date.now(), cleared = false;
  const h = harness(t, { clock: () => now, fetch: async url => {
    if (url.startsWith(primary)) { if (cleared) return good(); now += 1000; return challenge(); }
    now += 5000; return { status: 503, data: 'Unavailable' };
  }, browser: async (_url, options) => { assert.ok(options.timeout <= 3500); now += options.timeout; cleared = true; return { status: 200, data: '<html>Home</html>' }; } });
  h.source._SEEDS = [primary, backup, 'https://another.example.test'];
  assert.equal((await h.source.search('Example', 1)).length, 1);
  assert.equal(h.apiCalls().length, 3);
  assert.ok(!h.apiCalls().some(call => call.url.startsWith('https://another.example.test')));
});

test('older hosts without cookie accessor can reuse their own browser cookie jar', async t => {
  let cleared = false;
  const h = harness(t, { noClearTimeout: true, values: { automatic_mirrors: 'false' }, fetch: async () => cleared ? good() : challenge(), browser: async () => { cleared = true; return { status: 200, data: '<html>Home</html>' }; } });
  assert.equal((await h.source.search('Example', 1)).length, 1);
  assert.equal(h.apiCalls().length, 2);
});

test('network-only failures and ordinary empty results do not start browser verification', async t => {
  for (const response of [{ status: 503, data: 'Unavailable' }, json({ success: 1, books: [] })]) {
    const h = harness(t, { values: { automatic_mirrors: 'false' }, fetch: async () => response, browser: async () => { throw Error('unexpected'); } });
    if (response.status === 503) await assert.rejects(h.source.search('Example', 1));
    else assert.deepEqual(plain(await h.source.search('Example', 1)), []);
    assert.equal(h.browserCalls.length, 0);
  }
});
