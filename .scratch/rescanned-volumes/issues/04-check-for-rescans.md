Status: ready-for-agent

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
