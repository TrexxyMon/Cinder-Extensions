# FreeMagazines.top

Version `1.2.4-cinder` fixes empty **Search Downloads** results for issues whose
article contains a plain **Download PDF** link. The old resolver only recognized
LimeWire links and WordPress masked download buttons. Current issues can instead
link directly to a host preview page such as EasyUpload.

The resolver now reads download links inside the article body, including links
revealed by the existing browser-rendered fallback. Host preview pages use
Cinder's existing browser download-button and blob capture flow; direct PDF URLs
use the existing native download path. LimeWire and masked links remain supported.
No app update or debrid account is required for this extension fix.

In Cinder's Extensions screen, pull to refresh the repository catalog, then open
**Updates** and update **FreeMagazines.top** to `1.2.4-cinder`.

Validation:

- Regression tests run the extension with Cinder's actual HTML parser. They cover
  search-to-resolve, static and rendered article links, signed and relative URLs,
  unrelated links and placeholder controls, missing links, LimeWire and masked links.
- Live HTTP article responses were tested on November 13, 2026 for People USA
  (November 23), Variety (November 11), and Science (Issue 6825, Volume 394,
  November 12). The old resolver failed for all three; the new resolver returned
  each host link after one article request with no browser-rendered fallback.
  Exact-title search through resolution also passed. No magazine files were downloaded.
- All 13 FreeMagazines tests passed. The complete extension suite had 487 passing
  tests and two optional fixture tests skipped. Script syntax, repository JSON,
  version agreement and the versioned script URL were also checked.
- Installed-device download completion still needs confirmation. Host availability
  and changes to its browser download flow are separate from article resolution.

Run from this repository with a sibling Cinder checkout, or set `CINDER_APP` to it:

```sh
node --test tests/freemagazines.test.cjs
```
