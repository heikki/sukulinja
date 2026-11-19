Status: resolved

# Archive downloaded books elsewhere, keep only cited pages

Glossary: **Scan cache**, **Volume**, **Image**, **Citation**.

Heikki, 2026-11-09: archive a cached book, e.g. to an external SSD, maybe keeping only the cited pages downloaded.

Two ideas:

- **Archive a Volume** out of the Scan cache to a folder of one's choosing (an external SSD), so a whole book is kept without taking the cache's space, and read back from there when the drive is attached.
- **Keep the cited Images**: the Images the dataset's Citations link to stay on disk however the cache's cap prunes, so a person's sources open without Astia even if the rest of the book is dropped.

## Open questions

- Archive format: the cache's own folder layout (`<volumeId>/<fileId>.jpg`) copied as is, or something readable outside the app.
- Whether the Scan cache reads an archive folder as a second place to look, and what happens when the drive isn't attached.
- For cited Images: the Link's Image only, or also its neighbours (Retakes, the next spread); and whether they count against the cap (ADR-0015 says downloads do).

## Comments

Heikki, 2026-11-19: both, as one feature. An offload always keeps the cited Images; offloading needs a setting anyway, the folder to offload to.

- Done: _Offload_ in _All books_ drops every full-size Image but the cited ones (any dataset's), thumbnails kept (`offload` app operation, `ScanCache.keepOnly`).
- Heikki, 2026-11-19: nothing fetched from Astia while a Volume is offloaded. Done: `offloaded.json` in its cache folder names the Images kept; others are refused (`OffloadedError`, 409), its download refused, and _Bring back_ undoes it.
- Heikki, 2026-11-19: the cited Images are on disk before it's offloaded, and while it is, entries are cited only on them. Done: `offload` fetches them first (nothing changes if that fails), they're never pruned, nothing at all is fetched for it, and `mark`, `citeEntry` and `editEntry` refuse (409) any other of its Images.
- Left for `.scratch/small/issues/10-offload-folder.md`: an offload folder in Settings (an external SSD). With one set, the rest are moved there instead of dropped, and the Scan cache reads them from there while the drive is attached, falling back to Astia.
