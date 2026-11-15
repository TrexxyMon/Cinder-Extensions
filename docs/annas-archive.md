# Anna's Archive search reliability

Version `2.1.17` fixes a missing verification handoff when native requests fail
without returning challenge HTML, including Search Downloads and Test Connection.
It builds on the `2.1.16` user verification flow on hosts exposing `verifyWebsite`.

- **Automatically Open Verification** is enabled by default in extension settings.
  When a search needs an interactive check, Cinder opens the website. Solve it;
  after the original search page becomes accessible, Cinder saves the session,
  closes the window and resumes the search automatically.
- Turning this option off prevents automatic window opening. **Verify Website**
  stays available for manual use. Older app builds retain the previous background
  check and manual fallback, even after this extension update.
- Normal search deadlines pause during human verification. The host bounds the
  full verification wait to three minutes. Cancel stops the search without opening
  another mirror. Leaving Search or replacing a query cancels its browser work.
- Successful sessions are reused. An expired session can request verification
  again; the window closes only after actual search access, not a puzzle callback.

Refresh the extension catalogue and update **Anna's Archive** to `2.1.17`.
**Automatic opening requires the corresponding Cinder app update as well.**
There is no paid service, puzzle solver, or new native dependency.

The existing mirror and background recovery behavior remains:

- Try the current official mirrors sequentially before treating one mirror's
  challenge as a failure of the whole source. No new or unofficial domains are added.
- If native requests cannot reach search, use the visible handoff when supported
  and enabled, even when Android exposes no challenge HTML. Do not exhaust the
  search deadline in an invisible browser first. Older hosts and the off setting
  retain a silent background check. Neither path simulates CAPTCHA answers.
- Reserve time for this browser attempt, allowing up to ten seconds within the
  existing thirteen-second search deadline. Valid results can finish earlier.
- Remember a successful mirror and transport for ten minutes in the loaded
  extension. When a browser session works, reuse it for subsequent queries instead
  of repeating failed native requests. Cinder handles cookie persistence. An
  explicit preferred-domain change takes priority over the remembered hint.
- Give a remembered browser warmup an explicit timeout with time reserved for
  verification. If that warmup fails or returns no usable page, renew through
  the visible handoff. Honoring that timeout requires the accompanying app fix.
- Concurrent searches wait for automatic verification already in progress.
  Identical queries share its result; different queries load their own results
  after it succeeds. Failed checks do not launch a browser for every queued query.
- Preserve cancellation, deadlines, authentication failures, and Retry-After.
  A protection page is an error, never a successful empty catalogue.
- Retain the successful detail-page mirror when resolving relative download links.
  An HTTP 200 DDoS-Guard page no longer qualifies as a valid detail page.

Supported formats, result IDs, supporter keys, and the opt-in TorBox route remain
compatible. Automatic verification currently covers searches; speculative download
mirror attempts retain their existing background behavior.

## Evidence and limits

On November 13, 2026, Anna's [official mirror list](https://annas-archive.gd/faq#mirrors)
advertised `.gl`, `.pk`, and `.gd`, all already present in this extension. A public
search request from this development machine received HTTP 403 DDoS-Guard from
each. A separate rendered-page retrieval also failed to reach search results.
These checks establish the current protection response, not iPhone behavior.

The [official API documentation](https://annas-archive.gd/faq#api) describes a
member fast-download API, not a general public search API. Supporter/TorBox download
settings therefore do not remove the website search requirement.

The previous release passed 502 tests across the extension suite, with two optional
fixture tests skipped; script syntax and release metadata also passed checks.
Tests cover mirror selection, automatic browser fallback, session reuse,
concurrent queries, cancellation, expired tasks, Retry-After, malformed/challenge
pages, download origin, and existing supporter/TorBox behavior. Installed-device
verification is still required. If the site demands a human challenge, rejects
WebViews, or remains unavailable, this update cannot promise unattended access;
**Verify Website** remains the fallback. New regression cases cover the on/off
preference, handoff and resumed results, human-wait budgets, cancellation,
expired sessions, and refusing challenge HTML. They do not establish live
installed-device access, which remains unverified on both iOS and Android.

Version `2.1.16` validation on November 14: 541 public extension tests passed,
with two optional fixture tests skipped. The accompanying app passed 687
extension/layout tests, TypeScript, changed-file lint, and iOS/Android Expo
JavaScript exports. No installed-device verification was performed.

The `2.1.17` regression reproduced an opaque native failure followed by a stalled
hidden browser: the old code timed out without calling verification. The new
flow calls verification once and resumes from its returned page. Separate cases
cover expired browser sessions with no challenge HTML, the off setting, healthy
results, cancellation and rate limits. These tests do not establish live access
on the reporting Android device. The companion app changes present explicit
verification in an Android native window and retain cookie capture before close.

Version `2.1.17` validation: 543 public extension tests passed and two optional
fixture tests were skipped (`CINDER_APP` pointed at the current app checkout).
The app passed 667 extension/layout tests, TypeScript, changed-file lint and
Android/iOS Expo exports. No installed Android or iOS challenge test was run.

```sh
node --test tests/annas-search-protection.test.cjs tests/annas-supporter.test.cjs
```
