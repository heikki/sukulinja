Status: resolved

# An offload folder

Heikki, 2026-11-19: offloading needs a setting, the folder to offload to (an external SSD). With one set, an offload moves the Images it doesn't keep there instead of dropping them, and the Scan cache reads them from there while the drive is attached; without it, or with the drive away, they stay unavailable as now. Builds on the offload of `.scratch/church-books/issues/03-archive-books-keep-cited-pages.md` (`ScanCache.offload`, _Offloaded_ in the citations glossary).

## Open questions

- The folder's layout: the cache's own (`<volumeId>/<fileId>.jpg`), so it's read the same way.
- Whether _Bring back_ moves them back from the folder, or leaves them there.

## Answer

Built 2026-11-19. Settings' _Offload folder_ row, chosen with the app's folder picker (`chooseOffloadFolder`, `Utils.openFileDialog`), cleared with Clear; kept in `settings.local.json`. An offload copies the files it doesn't keep into `<folder>/<volumeId>/<fileId>.jpg` and drops them from the cache; the Scan cache looks there for any Image not on disk, offloaded or not. With the folder set but its drive away, an offload is refused (409) and nothing changes. _Bring back_ leaves them in the folder, still read from there.
