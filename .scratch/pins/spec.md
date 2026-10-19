Status: ready-for-agent

# Pins: one module for what's known to be on an Image

Vocabulary: `src/server/citation-scans/CONTEXT.md`, the Pins section and Scan method, as updated for this spec.

## Problem Statement

What the app knows about where things are on Astia's Images is stored in `anchors.ts` as module globals over two local files, and the rules for saving it are split between modules:

- **Split rules.** `anchors.ts` holds the merge, the clash rules and hand-beats-vision (`overrides`). `scans.ts` decides what a Mark or a Vision match saves (`save`, `saveVisionMatch`, `pagesFor`, `matchedBox`). A Mark makes up to three separate read-modify-write updates across the two files.
- **Unsafe writes.** The app and the vision script both rewrite `anchors.local.json` (now 541 KB) and `placements.local.json` with a plain overwrite: no lock, no atomic rename. Saves landing together can drop one; a crash mid-write truncates the file, and every link then fails to resolve. The reading and image caches already write with `.part` plus rename.
- **Globals and cwd defaults.** `setLocalFolder` points the module at a folder, and until called it writes to `resolve('data/…')`. `map-citation-scans` never calls it and relies on the cwd. The scripts wire `loadAnchors()` and `loadPlacements()` into `resolveChurchBookRef` by hand.
- **Names that don't say what they pin.** Anchor, Seen record and Placement are now **Page pin**, **Record pin** and **Reference pin**. The Scan method mixed exactness with who saved it: Placed meant both a hand pin and a vision suggestion, and the client re-derived "Verified" from `method` plus `by`, then grouped rows by comparing chip text.

## Solution

One **Pins** module, `openPins(dataFolder, { base })` in `src/server/citation-scans/pins.ts`. It owns the pins in one local file, merges them over a base layer it's given, applies the saving rules, and writes atomically under a lock. Resolution (`locate.ts`) reads a snapshot from it.

The Scan methods become **Exact** (a hand pin), **Vision match** (a vision pin, a suggestion), **Estimated** (counted from Page pins, or guessed from the Book's numbering) and **Volume**. `Scan` drops `by`.

## Interface

```ts
const pins = openPins(dataFolder, { base }); // base defaults to the shipped pins.json

pins.snapshot(); // what resolution reads: every Volume's Page pins, Record pins, Record ranges and villages, and the Reference pins
pins.stamp(); // changes whenever the local pins do, from any process
pins.recordMark(ref, { volumeId, image }, { volume, linked });
pins.recordVision(ref, { volumeId, volume, image, onCitedPage, box });
```

`markRef` in `scans.ts` still checks the Image against Astia and works out `linked`, then calls `recordMark`. `saveVisionMatch` becomes `pins.recordVision`.

Behind it:

- merging local pins over the base: newer Page pins replace any on the same Image or claiming one of its pages, and a record has one Record pin
- hand beats vision, everywhere
- what a Mark or a Vision match saves: a Page pin, a Reference pin, a Record pin
- `pagesFor` and `matchedBox`
- Record range extension, never across another Volume's range
- the stamp cache
- one atomic write per save, under the lock

## Decisions

- **One local file, `data/pins.local.json`.** The shipped file is renamed `src/server/citation-scans/pins.json`. Shape:

  ```json
  {
    "volumes": {
      "<Astia volume id>": {
        "title": "…",
        "pages": [{ "image": 82, "pages": [143], "note": "…", "by": "hand" }],
        "records": [
          { "record": 8506062, "image": 82, "by": "vision", "box": {} }
        ],
        "ranges": [{ "from": 8500000, "to": 8510000 }],
        "villages": ["…"]
      }
    },
    "references": {
      "<reference URL>": {
        "volumeId": "…",
        "volume": "…",
        "image": 45,
        "by": "hand"
      }
    }
  }
  ```

  The shipped file has only `volumes`, and in them only `title`, `pages`, `ranges` and `villages`. Citation matches are never shipped.

- **Migration.** On first open, if `pins.local.json` is missing and `anchors.local.json` or `placements.local.json` exists, they're converted into `pins.local.json`, written atomically, and renamed `*.migrated`. Any other files in the folder, such as `*.before-full.json` backups, are left alone. The shipped `anchors.json` is converted once, in the repo.
- **The lock.** `data/pins.lock` is created exclusively and holds the process id and the time.
  - A save retries every 50 ms for up to 5 s, then throws.
  - A lock older than 30 s is taken over.
  - Under the lock, a save re-reads the file, applies its change and writes `.part`, then renames it over the file.
  - Reads take no lock: the rename means a reader always sees a whole file.
- **The base is passed in.** Shipped pins are temporary, until something better comes along, so the module knows only "a base under the local pins". Tests pass their own.
- **Volume ids stay Astia's, unprefixed.** The interface treats them as opaque strings. A second scan destination would mean a one-time key rewrite and an adapter behind the Astia port, which is candidate #2.
- **Scan methods.** `ScanMethod` becomes `'exact' | 'vision' | 'estimated' | 'volume'`, ranked in that order.
  - Exact is a Record or Reference pin saved by hand; Vision match is one saved by the model.
  - An estimate carries `from: 'pins' | 'numbering'`.
  - `Scan.by` is removed. Provenance stays on the pins.
- **Vision pins still steer other links.** Vision Page pins count estimates and vision Record pins extend Record ranges. The links they steer stay Estimated.
- **One word per method, everywhere.** The chips read Exact (was Verified), Vision match, Estimated and Volume only. The person panel and the Scan viewer group by method, never by chip text.
- **The chart's `Anchor` is unrelated.** It's a layout slot (ADR-0003) in `tree-view/build/` and keeps its name.

## Testing

Test through `openPins` on a temp folder with a test base:

- what `anchors.test.ts` covers today: merging, precedence, Record ranges
- **migration:** old files in, `pins.local.json` out, old files kept as `*.migrated`; opening again changes nothing
- **two writers:** two `openPins` on the same folder, standing in for the app and the vision script, save at the same time, and both saves survive
- a stale lock is taken over; a held lock past 5 s throws
- a reader never sees a half-written file

`scans.test.ts`, `citations.test.ts` and `run.test.ts` keep their end-to-end cases, with the new method names.

## Out of scope

- An Astia port (#2), typed resolution failures (#3).
- Prefixing Volume ids with their destination.
- Replacing the shipped base with anything else.
