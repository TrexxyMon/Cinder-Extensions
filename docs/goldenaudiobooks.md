# GoldenAudiobooks

Public Cinder extension `goldenaudiobooks`, version `0.1.1-cinder`. It searches and
parses the website on the device and returns the actual audio files embedded in a
selected book's players. No debrid account, scraping server, or additional API key
is required. An audiobook-capable Cinder build is required for listening and
downloads; the repository minimum is `1.2.4`.

## Browsing and metadata

- Search uses the website's search pages, including subsequent result pages. The
  extension accepts Cinder's zero- and one-based initial-page conventions.
- Bestsellers and Fantasy are optional Discover shelves. The homepage is a static
  landing page, so it is not advertised as a Latest Audiobooks feed.
- Results include the title, author when identifiable in the heading, actual cover
  URL, categories and date when supplied. Search does not fetch every result's
  detail page. It returns up to 40 results from a source page; Cinder's configured
  display limit and ordering still apply.
- Details use the actual book image and supplied larger image where available.
  Description paragraphs are included when present; missing synopsis text is not
  fabricated from promotional download slogans.
- The website's uploader is not the author. Its `Author` taxonomy also contains
  narrators and casts, so those tags are not used to manufacture an author for a
  title whose heading does not identify one.

## Listening and downloads

The resolver returns an ordered `audioFiles` list through Cinder's existing
contract. Cinder owns native duration/format inspection, streaming, downloads,
listening positions, and import. The extension does not download audio bytes into
JavaScript or involve a debrid service.

Each audio player contributes one file. Repeated references in an `audio` element,
its nested `source`, and its fallback link are treated as alternative references,
not additional chapters. The known WordPress player-instance query parameter
`_=` is removed; other query parameters remain intact. Filenames have stable
four-digit prefixes so Cinder's natural sorting preserves the website's player
order, including across content pages. File sizes, durations and chapter names
are not invented.

Older books can span several content pages. Resolution follows only same-book
numbered parts, combines them in order, and checks that none are missing. The
website's Previous/Next Book links are not audiobook parts. A missing page or
unsupported player rejects the resolution rather than returning an incomplete
book. Opening metadata only fetches the first content page.

Only HTTPS audio URLs explicitly present in the selected book's players are
accepted, on the verified `ipaudio.club` and `goldenaudiobooks.com` upload paths.
Supported file suffixes are MP3, M4A, M4B, FLAC and WAV. Advertisements, arbitrary
download links, player HTML, iframes and HLS playlists are not promoted to files.
Unexpected canonical identities or redirects fail rather than selecting another
book. Optional `www` and trailing-slash canonicalization are supported.

## Performance and compatibility

Search and metadata requests have short bounded timeouts. Concurrent identical
requests share work, and the small parsed-result cache expires after 30 seconds.
Raw HTML is not retained in that cache. HTML parsing is limited to two million
characters; resolution is limited to 32 content pages, 5,000 tracks and a
100-second overall budget. Pages over the supported catalog-page range return
empty instead of repeating the last allowed page.

Plain HTTP fetching is used first. If needed, the optional hidden browser fallback
is serialized and bounded, with automatic interactive verification suppressed.
Verify Website remains an explicit setting. Rate limits receive a cooldown and
failed requests are not retained as successful empty searches. Older Cinder API
shapes without optional browser-session or URL helpers remain supported.

Streaming still depends on the remote host offering a usable file with a native
duration and byte-range access. Cinder checks those requirements; the presence of
a URL in the website does not guarantee the recording remains available. If a
host starts requiring media-request authentication, this extension will need a
reviewed update rather than forwarding website credentials to arbitrary hosts.

## Validation — November 10, 2026

First-party structures checked:

- [Search](https://goldenaudiobooks.com/?s=harry+potter) and its second result page.
- [Bestsellers](https://goldenaudiobooks.com/category/bestsellers/) and
  [Fantasy](https://goldenaudiobooks.com/category/audio-fantasy/) category pages.
- [Ready Player One](https://goldenaudiobooks.com/ernest-cline-ready-player-one-audio-book/)
  and [Pride and Prejudice](https://goldenaudiobooks.com/jane-austen-pride-and-prejudice-audio-book/).
- [A multipart book](https://goldenaudiobooks.com/harry-potter-half-blood-prince-audibook-stephen-fry-audiobook/)
  including all four numbered content pages.

Live executable search returned 21 entries on each of two pages without overlap;
category browsing returned 21. Three live detail/resolution samples returned 14,
16 and 30 tracks, respectively. The multipart sample included all four pages.
Names remained unique and kept the same order through Cinder's filename sort.
An unauthenticated HEAD request for a sampled audio file returned HTTP 200 with
an audio content type, content length and byte-range support. No full audiobook
was downloaded or played during those checks.

Independent replay of captured real markup using Cinder's actual HTML parser
also returned 16, 10, 13, 8 and 30 tracks across five old/new book layouts. The
automated suite covers ordering, nested-source deduplication, multipart
completeness, URL identity, cache behavior, missing metadata, unsafe/unsupported
media, source categories, and the existing app's audio-file validation contract.

Run from the public repository, with `CINDER_APP` pointing at the app checkout:

```powershell
node --test tests/goldenaudiobooks.test.cjs
```

Installed iOS and Android streaming, background playback, seeking, complete
downloads/imports and progress restoration remain device-validation tasks. Expo
can exercise search, browsing and metadata, but native playback availability is
determined by the installed app. This is independently written extension code;
no audiobook-dl or third-party reader implementation was copied.


## Public repository migration (2026-11-11)

Version `0.1.1-cinder` moves this extension to the public repository and explicitly
labels it as not requiring debrid. Search, track ordering, streaming, downloads,
IDs and settings are unchanged. Add or refresh the
[public repository](https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/repo.json),
refresh the private repository if installed, then update without uninstalling.
The old private script remains available for cached manifests and older installs.
