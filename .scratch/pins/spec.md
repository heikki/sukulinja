Status: ready-for-agent

# Pins: one module for what's known to be on an Image

Vocabulary: `src/server/citation-scans/CONTEXT.md`: Pins, Link, Precision, Certainty, Mark.

## Problem Statement

What the app knows about where things are on Astia's Images lives in `pins.ts` as module globals over one local file, `data/pins.local.json`, and the rules for saving it are split between modules:

- **Split rules.** `pins.ts` holds the merge, the clash rules and hand-beats-vision (`overrides`). `scans.ts` decides what a Mark or a Vision match saves (`save`, `saveVisionMatch`, `pagesFor`, `matchedBox`). A Mark makes up to three separate read-modify-write updates.
- **Unsafe writes.** The app and the vision script both rewrite `pins.local.json`. Each write is atomic (`.part` plus rename), but there's no lock, so saves landing together can drop one.
- **Globals and cwd defaults.** `setLocalFolder` points the module at a folder, and until called it reads and writes `resolve('data/…')`. `map-citation-scans` never calls it and relies on the cwd. The scripts wire `loadPins()` into `resolveChurchBookRef` by hand.

## Solution

One **Pins** module, `openPins(dataFolder, { base })` in `src/server/citation-scans/pins.ts`. It owns the local pins, merges them over a base layer it's given, applies the saving rules, and writes under a lock. Resolution (`locate.ts`) reads a snapshot from it.

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

- **The lock.** `data/pins.lock` is created exclusively and holds the process id and the time.
  - A save retries every 50 ms for up to 5 s, then throws.
  - A lock older than 30 s is taken over.
  - Under the lock, a save re-reads the file, applies its change and writes `.part`, then renames it over the file.
  - Reads take no lock: the rename means a reader always sees a whole file.
- **The base is passed in.** Shipped pins are temporary, until something better comes along, so the module knows only "a base under the local pins". Tests pass their own.
- **Volume ids stay Astia's, unprefixed.** The interface treats them as opaque strings. A second scan destination would mean a one-time key rewrite and an adapter behind the Astia port, which is candidate #2.
- **Vision pins still steer other links.** Vision Page pins count estimates and vision Record pins extend Record ranges. The links they steer stay Estimated.

## Testing

Test through `openPins` on a temp folder with a test base:

- what `pins.test.ts` covers today: merging, precedence, Record ranges, migration
- **two writers:** two `openPins` on the same folder, standing in for the app and the vision script, save at the same time, and both saves survive
- a stale lock is taken over; a held lock past 5 s throws
- a reader never sees a half-written file

`scans.test.ts`, `citations.test.ts` and `run.test.ts` keep their end-to-end cases.

## Out of scope

- An Astia port (#2), typed resolution failures (#3).
- Prefixing Volume ids with their destination.
- Replacing the shipped base with anything else.
