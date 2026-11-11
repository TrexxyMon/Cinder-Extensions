# The Pirate Bay Audiobooks

Private Cinder extension `thepiratebay-audiobooks`, version `0.1.2-cinder`.

- Appears in the Audiobooks category and Search Downloads. Ebook results and other audio categories are excluded.
- Uses the website's public JSON search service directly on the device. No account, supporter key, scraper backend or browser window is required.
- Needs a connected Cinder debrid provider. Selecting a release passes its validated magnet to Cinder's existing preparation/caching/download flow. It never downloads torrents on the device.
- Shows release title, available size/format/date and a **Seeders** count. Older apps can read the legacy count field as well. Zero-count results are retained because a debrid provider may already have them cached.
- Does not invent authors, covers or descriptions that the API does not provide. The audiobook selected in Cinder keeps its existing metadata; the debrid file selection/importer handles tracks and archives.
- Search has a 12-second network timeout, one-minute bounded cache and in-flight deduplication. Rate limits are surfaced with a cooldown, rather than silently returning an empty list or retrying indefinitely.
- The API returns up to 100 matches per request; later pages are empty rather than repeating results. Narrow the query if a release is missing. The default display limit is 50, Cinder's maximum. Version 0.1.0 requested an unsupported 100-result display limit, which made Cinder fall back to five. Cinder's explicit download-result limit and ordering preferences still apply.

Requires an audiobook-capable Cinder build (manifest minimum `1.2.4`). Uses the existing `cinder.fetch`, search and resolve contracts; no app or native-module changes are needed.

## Validation

`node --test tests/thepiratebay-audiobooks.test.cjs`

On 2026-11-06 the live website identified `https://apibay.org` as its search server and category `102` as Audio books. A live `librivox` query returned 100 category-102 records. A deliberately nonexistent query returned the API's zero-ID sentinel. A detail endpoint probe returned HTTP 429; resolving search results therefore uses their validated immutable hash without an extra request.

Sources: [website search](https://thepiratebay.org/search.php?q=librivox&cat=102), [website search script](https://thepiratebay.org/static/main.js), [public search endpoint](https://apibay.org/q.php?q=librivox&cat=102).

Automated tests cover filtering, malformed data, cache/restart behavior, throttling, and magnet handoff. Live debrid transfers and installed iOS/Android validation remain separate; an uncached release still depends on upstream availability and the connected service.

## November 10, 2026 audit

Version 0.1.2 accepts both Cinder's zero-based initial Download Search request and
its one-based initial source-browser search. Previously the latter incorrectly
returned an empty array without contacting the API. Pages after the first remain
empty because the upstream endpoint supplies a single bounded list.

The executable extension returned 100 results for a live `librivox` query and
resolved a selected result to a validated magnet without another network request.
The upstream list was already ordered by descending availability; the later 50
results had zero reported peers. `Wind and Truth` and `Isles of the Emberdark`
returned the upstream API's no-result sentinel, not a local parser failure.
Cinder's display cap remains 50; this is not a claim to enumerate the full index.
No audio payloads, debrid account actions, or installed-device tests were run.


## Public repository migration (2026-11-11)

Version `0.1.3-cinder` moves this extension to the public Cinder Reader Extensions
repository. Only the published version and repository location changed; search,
release IDs, settings and debrid handoff are unchanged. Add or refresh the
[public repository](https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/repo.json),
refresh the private repository if it is installed, then update this extension
without uninstalling it. The old private script URL remains available for cached
manifests and older installations.
