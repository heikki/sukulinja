Status: ready-for-agent

# Deepen pins into one module with safe writes

Spec: `.scratch/pins/spec.md`.

## Steps

1. **The module.** Make `pins.ts` export `openPins(dataFolder, { base })`, with `snapshot()`, `stamp()`, `recordMark(ref, target, { volume, linked })` and `recordVision(ref, match)`.
   - Move in from `scans.ts`: `save` (becomes `recordMark`), `saveVisionMatch` (becomes `recordVision`), `pagesFor` and `matchedBox`.
   - `base` defaults to the shipped `pins.json`.
   - Remove `setLocalFolder` and the module-level state.
2. **Safe writes.** Every save works the same way:
   1. Take `data/pins.lock` (exclusive create, holding pid and time; retry every 50 ms; throw after 5 s; take over a lock older than 30 s).
   2. Re-read `pins.local.json`.
   3. Apply all of the save's changes.
   4. Write `pins.local.json.part` and rename it over the file.
   5. Release the lock.

   A Mark is one write.

3. **The app.** `createApi` opens one Pins for the data folder.
   - `scans.ts`: `resolveRef`, `volumeLinks`, `byBook`, `matchCandidates` and `markRef` read `pins.snapshot()` instead of `loadPins()`, which goes away with `addPagePin`, `addRecordPin` and `setReferencePin` as exports.
   - `citations.ts`: reads `pins.stamp()` in place of `localStamp()`.
   - Pass the Pins object in where today a global is read. `useDataFolder` keeps only the Astia and image-cache setters.
4. **Scripts.**
   - `match-citation-scans/run.ts`: opens Pins from its `root` and uses `resolveRef` instead of wiring the files by hand.
   - `map-citation-scans/index.ts`: same; it takes the data folder from an option defaulting to `data`, and stops relying on the cwd.
   - `evaluate-reader`: reads the base and the hand Reference pins through `openPins`.

## Acceptance

- **`src/server/citation-scans/pins.test.ts`** covers:
  - merging, precedence, Record ranges and migration, as it does now, through `openPins`
  - two `openPins` on one folder saving at once, with both saves kept
  - a stale lock taken over, and a held lock throwing after 5 s
  - no reader seeing a partial file
- No module in `citation-scans/` keeps a data folder in a module variable. Astia's cache dir is left to candidate #2.
- `bun run format`, `bun run lint`, `bun run typecheck` and `bun test` pass.
- **On the `ylonen` data:**
  - a Mark in the Scan viewer writes `pins.local.json` once and shows Marked Image
  - a vision pass run alongside the app loses nothing
