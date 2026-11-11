# Knaben Audiobooks

On-device access to Knaben's official v2 API. No API key, scraping server, or website login is needed. A connected Cinder debrid service is required to prepare/download the selected release. Playback needs an audiobook-capable Cinder build (repository minimum 1.2.4).

- Both search and the optional Latest/Popular Audiobooks shelves request category `1003000` (Audio / Audiobook). Results are also checked locally against this category, excluding ebooks and music from a malformed/mixed response.
- Results retain the release title, source, date, description and size when provided. Knaben does not reliably provide authors or cover art; this extension does not invent either. Existing selected-book metadata remains Cinder's responsibility.
- `availability` and legacy `seeders` expose a valid `liveSeeders` count, falling back to `seeders`. `availabilityLabel` is `Seeders`. Zero remains zero; unknown counts are omitted. Search and exact-hash resolution include inactive releases because a debrid provider may already cache them. The count is a snapshot, not a guarantee of provider completion.
- Search requests use the API's seed-count ordering. Cinder's Search Results settings can override source order/limits. Duplicate hashes from different trackers are collapsed without summing their counts.
- Resolution returns only a validated magnet and known total size to Cinder. It never downloads binaries, follows arbitrary result URLs, invents a single-file name, or starts playback. Collections/file selection and remote waiting belong to Cinder.
- A saved result is looked up by exact hash when its short cache expires. Conflicting hashes are rejected, and a different release with the same title cannot silently replace it.

## Performance and compatibility

Uses existing `cinder.fetch` and standard extension search/resolve/discovery contracts; no new native APIs. The generic count label is used by newer Cinder builds; older audiobook builds still receive `seeders`.

One API request produces a page of up to 40 results. No per-result health or metadata requests. Identical concurrent requests share work; the cache is bounded to 12 pages and 60 seconds. Request starts are spaced by at least 2.1 seconds, queued delay is bounded, and HTTP 429 respects Retry-After. Each network request has a five-second timeout. API unsafe/adult opt-ins are not enabled. The documented `dead` flag includes zero-peer releases without extra requests.

## Evidence and validation (2026-11-03)

- [Official API v2](https://knaben.org/api/v2/): GET search/browse, category filters, hash lookup, sorting and pagination.
- [Official category selector](https://knaben.org/rss/): Audiobook value `001003000`.
- [Official service status](https://knaben.org/status/): temporary one-request-per-two-seconds limit.
- Live unauthenticated search returned audiobook records, valid hashes, sizes and published counts. Read-only tests exercised the extension's search, optional browse and resolution. No provider account was used and no audio payload was downloaded.

Run `node --test tests/knaben-audiobooks.test.cjs`. Fixtures cover category filtering, zero/missing counts, hash conflicts, expired results, deduplication, shared requests, rate limits, response validation, cache bounds and debrid-only resolution. Installed iOS/Android debrid preparation, download/import and playback remain device-validation tasks.

## November 10, 2026 audit

Version 0.1.1 rejects all-zero torrent hashes in either hexadecimal or base32 form;
these malformed identities must not create a downloadable result or provider task.
Both first-page conventions (omitted/zero/one) continue to use the first API page.

Before the inactive-result change, live executable search returned 16 unique
`librivox` releases from 17 upstream rows (requested limit 40), correctly collapsing
repeated hashes from different trackers. Cached
resolution returned the selected exact magnet without an additional request.
`Wind and Truth`, `Wind Truth`, and `Isles of the Emberdark` returned no hits from
the upstream API itself, including checks with its documented inactive-results
flag. No audio payloads or provider account actions were performed.

The API's documented `dead` flag is now enabled on search, browse and exact-hash
resolution. An old result no longer disappears solely because its peer count
drops to zero. Matching, category restrictions, unsafe/adult filters, ordering and
request/page limits remain unchanged. A zero-peer release may still fail if the
chosen debrid provider has no cached copy. Neither this source's 40-row page nor
Cinder's display cap promises a complete index enumeration.

Repeating the executable `librivox` search with that flag returned 39 distinct
releases; the original active results remained first. The two newer-title queries
still returned upstream no-hit responses. The new regression test also verifies
that an expired search-cache entry can resolve the same exact hash after becoming
inactive, rather than substituting another release.


## Public repository migration (2026-11-11)

Version `0.1.2-cinder` moves this extension to the public Cinder Reader Extensions
repository. Only the published version and repository location changed; search,
release IDs, settings and debrid handoff are unchanged. Add or refresh the
[public repository](https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/repo.json),
refresh the private repository if it is installed, then update this extension
without uninstalling it. The old private script URL remains available for cached
manifests and older installations.


## Debrid label update (2026-11-11)

Version `0.1.3-cinder` explicitly labels the extension as requiring
a connected debrid service. Only display metadata changed; search, resolution,
settings and download behavior are unchanged.
