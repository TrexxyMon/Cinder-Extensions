# DownMagaz

DownMagaz requires Debrid-Link for its current Downup file-host links.

## 4.0.16: recover file identity when redirect metadata is unavailable

The 4.0.15 fallback assumed that Downup's forms contained absolute action URLs.
The live Commando #6000 page instead has empty form actions, with the file ID and
filename in hidden inputs. Replaying that exact page with a missing final URL,
or with the original shortcut as the response URL, reproduced the old shortcut
being submitted to Debrid-Link. A successful desktop redirect check did not
exercise this case.

The resolver now recognizes those download forms, including omitted and relative
actions, and recovers the file page from their validated identity. Free/premium
forms for the same file are deduplicated by file ID. Conflicting IDs, unrelated
form targets, login forms, and untrusted redirects cannot choose a different
file. No form is submitted, and no network request is added.

Validation on November 14, 2026:

- All 31 focused tests passed using Cinder's HTML parser.
- The public extension suite passed: 533 passed, 2 optional-fixture skips.
- Three live issue pages were checked with final, original, and omitted response
  URLs. All nine fixed results matched Debrid-Link's public Downup URL pattern
  and reopened HTTP 200 pages containing the same file ID and filename. Version
  4.0.15 failed the six original/omitted URL cases.
- Authenticated Debrid-Link link generation and installed-device downloads are
  still unverified. This fixes a reproduced resolver defect, not a demonstrated
  provider-side failure. The app was unchanged; no Expo build was required.

After updating, select the issue again from search. Retrying an existing failed
download reuses its saved URL and does not rerun the updated extension resolver.

## 4.0.15: resolve Downup shortcuts before debrid submission

Issue pages can use `https://dwp.la/d/<short-id>` instead of a full Downup file
URL. Live checks on November 13, 2026 found that HEAD requests to these shortcuts
redirect to Downup's homepage, while GET requests redirect to the specific file.
Previously the extension ignored that distinction and submitted the shortcut.

This release uses one bounded GET for the selected Downup shortcut and submits
the resulting file page first. It retains the shortcut as a provider fallback.
Clients without a final response URL can read the file URL from Downup's download
form actions; no form is submitted. A homepage, login page, failed request,
unrelated redirect, or ambiguous forms cannot replace the original link.
Existing full Downup URLs and direct file URLs keep their existing request path.

Downup shortcuts receive the same host priority as full Downup links. Host
matching uses domain boundaries. Failed HEAD responses are never accepted as
direct downloads based only on their content headers.

## Validation

- 17 focused tests use Cinder's actual HTML parser, including the Commando #6000
  article/link shape, older-client fallback, failed/ambiguous redirects,
  deduplication, direct files, and the existing full-URL route.
- The full public extension suite passed: 519 passed, 2 optional-fixture skips.
- Live resolver checks for Commando #6000, The Christian Science Monitor
  November 23, 2026, and Hi-Fi News December 2026 produced full file URLs matching
  Debrid-Link's public Downup URL pattern. The old shortcut URLs did not match it.
- No authenticated Debrid-Link download or installed-device validation was run.
  The app was unchanged; no Expo export or TestFlight build was needed or run.

Debrid-Link documents `notDebrid` as a failure to generate a download link, with
a suggestion to retry later. This is distinct from `hostNotValid` (unsupported
host) and `fileNotFound`. The shortcut correction does not guarantee that a
temporarily failing or unavailable file will download.

Sources:

- https://downmagaz.net/comics_magazine/487698-commando-no-6000.html
- https://debrid-link.com/api_doc/v2/errors
- https://debrid-link.com/api_doc/v2/downloader-hosts
