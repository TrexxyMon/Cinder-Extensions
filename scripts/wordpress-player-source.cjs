// Keep this factory self-contained. The builder embeds it in each installable script.
function createPlayerSource(config, version) {
  const base = new URL(config.browser.startUrl).origin;
  const pending = new Map();
  const text = element => element ? element.text().replace(/\s+/g, ' ').trim() : '';
  const fail = message => new Error(config.name + ': ' + message);

  function httpsUrl(raw, relativeTo) {
    if (typeof raw !== 'string' || !raw.trim() || /[\u0000-\u001f\\]/.test(raw)) return null;
    try {
      const url = new URL(raw, relativeTo);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url : null;
    } catch (_) { return null; }
  }

  function bookId(raw) {
    const url = httpsUrl(raw, base + '/');
    if (!url || url.origin !== base || url.search || url.hash) return '';
    // WordPress can percent-encode accented characters in the post slug.
    // Validate its decoded shape while retaining the site's original permalink.
    let path;
    try { path = decodeURIComponent(url.pathname); } catch (_) { return ''; }
    if (/%(?:2f|5c)/i.test(url.pathname) ||
        !/^\/[a-z0-9\u00c0-\uffff][a-z0-9_\u00c0-\uffff-]*\/?$/i.test(path)) return '';
    return url.pathname.replace(/\/?$/, '/');
  }

  async function documentAt(address, signal, allowMissing) {
    const response = await cinder.fetch(address, { headers: { Accept: 'text/html' }, timeout: 8500, signal });
    if (allowMissing && response.status === 404) return null;
    if (response.status !== 200) {
      const error = fail(response.status ? 'website returned HTTP ' + response.status + '. Try again later.' : 'website could not be reached.');
      error.status = response.status;
      throw error;
    }
    const requested = new URL(address);
    const final = httpsUrl(response.url || address, address);
    if (!final || final.origin !== base || final.pathname.replace(/\/$/, '') !== requested.pathname.replace(/\/$/, '') ||
        final.searchParams.toString() !== requested.searchParams.toString()) throw fail('the website redirected to a different page.');
    if (typeof response.data !== 'string' || !response.data || response.data.length > 4000000) throw fail('unreadable website response.');
    return cinder.parseHTML(response.data);
  }

  function metadata(post, heading, id, fallbackCover) {
    const label = text(heading);
    const names = /^(.+?)\s+[–—-]\s+(.+)$/.exec(label);
    const title = (names ? names[2] : label).replace(/\s+audio[\s-]?books?(?:\s+(?:free|online))*(?=\s*(?:\(|$))/ig, '').trim();
    const img = post.querySelector(config.layout.cover);
    const cover = httpsUrl(img && (img.attr('data-lazy-src') || img.attr('data-src') || img.attr('src')), base) ||
      httpsUrl(fallbackCover, base);
    return {
      id, title: title || label, author: names ? names[1].trim() : undefined, url: base + id,
      cover: cover ? cover.href : undefined,
      genres: post.querySelectorAll(config.layout.categories).map(text).filter(Boolean),
      contentType: 'audiobooks', contentTypes: ['audiobook'], format: 'audiobook', source: config.name,
    };
  }

  async function list(query, page, signal) {
    const number = Math.max(1, Math.floor(Number(page) || 1));
    if (!Number.isFinite(number) || number > 10000) return [];
    const address = base + (number === 1 ? '/' : '/page/' + number + '/') + (query ? '?s=' + encodeURIComponent(query) : '');
    const doc = await documentAt(address, signal, number > 1);
    if (!doc) return [];
    const results = [], seen = new Set();
    for (const post of doc.querySelectorAll('article.post')) {
      const heading = post.querySelector('h2.entry-title a');
      const id = heading && bookId(heading.attr('href'));
      if (!id || !text(heading) || seen.has(id)) continue;
      seen.add(id);
      results.push(metadata(post, heading, id));
    }
    if (!results.length && !doc.querySelector('body.search-no-results, .no-results, .not-found') &&
        !/nothing found|no results|no posts/i.test(text(doc.querySelector('h1.page-title, h2.page-title')))) {
      throw fail('the catalog layout could not be recognized.');
    }
    return results;
  }

  async function readPost(id, page) {
    const address = base + id + (page > 1 ? page + '/' : '');
    const doc = await documentAt(address);
    const canonical = doc.querySelector('link[rel="canonical"]');
    const expected = new URL(address);
    const actual = canonical && httpsUrl(canonical.attr('href'), address);
    if (canonical && (!actual || actual.origin !== base || actual.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, ''))) {
      throw fail('the website returned a different book or part.');
    }
    const post = doc.querySelector('article.post');
    const heading = post && post.querySelector('h1.entry-title');
    const body = post && post.querySelector(config.layout.body);
    if (!text(heading) || !body) throw fail('the book page could not be read.');
    const current = post.querySelector('.page-links .post-page-numbers.current');
    if (current && Number(text(current)) !== page) throw fail('the website returned the wrong part.');
    return { doc, post, heading, body, address };
  }

  function pageNumbers(record, id) {
    const numbers = [];
    for (const link of record.post.querySelectorAll('.page-links a[href]')) {
      const url = httpsUrl(link.attr('href'), record.address);
      if (!url || url.origin !== base || !url.pathname.startsWith(id) || url.search) throw fail('invalid book pagination.');
      const tail = url.pathname.slice(id.length);
      if (!tail) continue;
      if (!/^[1-9]\d*\/?$/.test(tail)) throw fail('unrecognized book pagination.');
      const number = Number(tail.replace('/', ''));
      if (number > 96) throw fail('this audiobook exceeds the supported page count.');
      numbers.push(number);
    }
    return numbers;
  }

  function mediaAddress(raw, relativeTo) {
    const url = httpsUrl(raw, relativeTo);
    if (!url || !/\.mp3$/i.test(url.pathname) ||
        !(url.origin === base || /^ipaudio\d*\.(?:club|com)$/i.test(url.hostname))) return '';
    // WordPress restarts this counter on every page. Preserve all other query bytes.
    const query = url.search.slice(1).split('&').filter(part => part && !/^_=\d+$/.test(part)).join('&');
    return url.origin + url.pathname + (query ? '?' + query : '');
  }

  function trackUrls(record) {
    const players = record.body.querySelectorAll('audio');
    if (!players.length) throw fail('no audio tracks are available on this book page.');
    return players.map(player => {
      const candidates = [player.attr('src')];
      for (const child of player.querySelectorAll('source[src], a[href]')) candidates.push(child.attr('src') || child.attr('href'));
      for (const raw of candidates) {
        const url = mediaAddress(raw, record.address);
        if (url) return url;
      }
      throw fail('a player has no supported audio file. The complete audiobook is unavailable.');
    });
  }

  async function resolveBook(id) {
    const first = await readPost(id, 1);
    const postId = first.post.attr('id');
    const heading = text(first.heading);
    const deadline = Date.now() + 105000;
    const advertised = new Set([1]);
    const seen = new Set(), audioFiles = [];
    let lastPage = 1;
    for (let page = 1; page <= lastPage; page++) {
      if (!advertised.has(page)) throw fail('the website omitted a numbered book page.');
      if (Date.now() >= deadline) throw fail('loading the complete track list timed out. Try again.');
      const record = page === 1 ? first : await readPost(id, page);
      if (text(record.heading) !== heading || (postId && postId !== record.post.attr('id'))) throw fail('book pages belong to different titles.');
      for (const number of pageNumbers(record, id)) {
        advertised.add(number);
        lastPage = Math.max(lastPage, number);
      }
      const before = audioFiles.length;
      for (const url of trackUrls(record)) {
        if (seen.has(url)) continue;
        seen.add(url);
        const index = audioFiles.length + 1;
        if (index > 5000) throw fail('this audiobook exceeds the supported track count.');
        audioFiles.push({ url, name: 'Part ' + String(index).padStart(4, '0') + '.mp3', title: 'Part ' + index });
      }
      if (audioFiles.length === before) throw fail('a numbered page repeated earlier tracks. Try again later.');
    }
    return { audioFiles };
  }

  return {
    id: config.id, name: config.name, version, description: config.description, icon: 'headset-outline',
    language: 'English', contentType: 'audiobooks', contentTypes: ['audiobook'], debridSupport: 'none',
    excludeFromDefaultMetadataProviders: true, capabilities: config.capabilities, browser: config.browser,
    async search(query, page, selection, context) {
      return list(String(query || '').trim(), page, context && context.signal);
    },
    async getDiscoverSections() { return [{ id: 'latest', title: 'Latest Audiobooks', type: 'latest' }]; },
    async getDiscoverItems(section, page) { return section === 'latest' ? list('', page) : []; },
    async getBookDetails(raw) {
      const id = bookId(raw);
      if (!id) throw fail('invalid book link.');
      const { doc, post, heading, body } = await readPost(id, 1);
      const og = doc.querySelector('meta[property="og:image"]');
      const item = metadata(post, heading, id, og && og.attr('content'));
      item.description = body.querySelectorAll(config.layout.description)
        .filter(p => !p.querySelector('audio, source, script, style, ins, iframe'))
        .map(text).filter(value => value.length >= 55 && !/^https?:\/\//i.test(value))
        .slice(0, 5).join('\n\n').slice(0, 4000) || undefined;
      return item;
    },
    async resolve(item) {
      const id = bookId(item && (item.id || item.url));
      if (!id) throw fail('invalid book link.');
      if (pending.has(id)) return pending.get(id);
      const result = resolveBook(id);
      pending.set(id, result);
      try { return await result; } finally { pending.delete(id); }
    },
  };
}

module.exports = createPlayerSource;
