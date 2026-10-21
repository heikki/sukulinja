Status: resolved

# A script that catches the next re-scan of a pinned Volume

Parent: `01-detect-a-rescan.md`.

Astia gives no notice of a re-scan, and the Scan cache only notices one when an Image of the Volume is opened. Shipped Page pins are facts about one filming, so a re-scan should be caught before users open the Volume.

## Do

- `scripts/check-rescans`: for every Volume with pins in the shipped `pins.json` (and a data folder's `pins.local.json` when given one), fetch the Volume's list fresh, bypassing `.astia-cache`, and compare it with the file ids the pins saved.
- Report each Volume whose pins no longer match: old and new Image counts, and each stale pin with its Image number and pages or record. Exit non-zero when any is found.
- Requests go out one at a time with Astia's usual gap (about 200 Volumes, a few minutes).
- `--update-cache` also replaces the data folder's cached list for each changed Volume, as the Scan cache would on its own.

## Tests

- Over a `memoryAstia` with one re-scanned Volume, the report names that Volume and its stale pins, and nothing else.

## Answer

- `scripts/check-rescans/index.ts [--data <folder>] [--update-cache]`; the check itself is `check.ts`, given each Volume's list now (and the folder's cached one, for its old Image count). Pins without a file id are counted, not checked. Hand pins are listed first, with the Image they were on, as a hint for marking them again.
- Old pins aren't carried over to the new filming: Astia keeps no old photographs to match against, a Box is of one photograph, and page counting from the new filming's Page pins already gives a reference citing a page its Image. Record ranges and villages stay; vision matches come back on the next vision run, as their references are Estimated again; hand marks are what the report is for.
- Run on 2026-10-21 against Astia with the repo `data/` folder: 146 pinned Volumes, one re-scanned: I Ab:9, 455 → 434 Images, its local vision Record pin of record 11185142 at Image 247. The shipped pins all fit.
