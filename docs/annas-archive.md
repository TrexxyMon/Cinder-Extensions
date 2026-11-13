# Anna's Archive search reliability

Version `2.1.15` improves automatic recovery when search receives a browser check.

- Try the current official mirrors sequentially before treating one mirror's
  challenge as a failure of the whole source. No new or unofficial domains are added.
- If native requests cannot reach search, let the website run its own browser
  check automatically through Cinder's normal mobile WebView. Use the existing
  rendered background layout, without opening a verification modal or simulating
  CAPTCHA answers.
- Reserve time for this browser attempt, allowing up to ten seconds within the
  existing thirteen-second search deadline. Valid results can finish earlier.
- Remember a successful mirror and transport for ten minutes in the loaded
  extension. When a browser session works, reuse it for subsequent queries instead
  of repeating failed native requests. Cinder handles cookie persistence. An
  explicit preferred-domain change takes priority over the remembered hint.
- Concurrent searches wait for automatic verification already in progress.
  Identical queries share its result; different queries load their own results
  after it succeeds. Failed checks do not launch a browser for every queued query.
- Preserve cancellation, deadlines, authentication failures, and Retry-After.
  A protection page is an error, never a successful empty catalogue.
- Retain the successful detail-page mirror when resolving relative download links.
  An HTTP 200 DDoS-Guard page no longer qualifies as a valid detail page.

Search settings, supported formats, result IDs, supporter keys, and the opt-in
TorBox route remain compatible. Refresh the extension catalogue and update
**Anna's Archive** to `2.1.15`. This is an extension update, with no Cinder build required.

## Evidence and limits

On November 13, 2026, Anna's [official mirror list](https://annas-archive.gd/faq#mirrors)
advertised `.gl`, `.pk`, and `.gd`, all already present in this extension. A public
search request from this development machine received HTTP 403 DDoS-Guard from
each. A separate rendered-page retrieval also failed to reach search results.
These checks establish the current protection response, not iPhone behavior.

The [official API documentation](https://annas-archive.gd/faq#api) describes a
member fast-download API, not a general public search API. Supporter/TorBox download
settings therefore do not remove the website search requirement.

Automated validation: 502 tests passed across the extension suite, with two optional
fixture tests skipped; script syntax and release metadata also passed checks.
Tests cover mirror selection, automatic browser fallback, session reuse,
concurrent queries, cancellation, expired tasks, Retry-After, malformed/challenge
pages, download origin, and existing supporter/TorBox behavior. Installed-device
verification is still required. If the site demands a human challenge, rejects
WebViews, or remains unavailable, this update cannot promise unattended access;
**Verify Website** remains the fallback.

```sh
node --test tests/annas-search-protection.test.cjs tests/annas-supporter.test.cjs
```
