# DownMagaz

DownMagaz requires Debrid-Link for its current Downup file-host links.

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
