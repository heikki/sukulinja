Status: ready-for-agent

# Rename to pins, and give the Scan methods their new meanings

Spec: `.scratch/pins/spec.md`. This issue changes names, the file shape and the Scan methods. It doesn't introduce the Pins module or the lock (issue 02). Where behaviour changes, it's only that the Scan method no longer needs `by`.

## Steps

1. **Types** (`locate.ts`, `common/types.ts`):
   - `Anchor` → `PagePin`, `SeenRecord` → `RecordPin`, `Placement` → `ReferencePin`.
   - The per-Volume `Anchors` shape → `Pins`, with keys `pages`, `records`, `ranges`, `villages`, `title`; Reference pins live under `references`.
   - `ScanMethod` becomes `'exact' | 'vision' | 'estimated' | 'volume'`, with `from: 'pins' | 'numbering'` on an estimated `Scan`.
   - Remove `Scan.by`.
2. **Resolution** (`locate.ts`):
   - A Record or Reference pin gives `'exact'` when `by` is hand and `'vision'` when it's the model's.
   - `anchoredImage` becomes the `from: 'pins'` estimate.
   - Keep the rule that drops a pin-counted Volume with no Image.
   - The vision-beats-estimate ranking stays as today.
3. **Files:**
   - Rename `src/server/citation-scans/anchors.ts` to `pins.ts`, keeping today's functions under pin names.
   - Convert `anchors.json` into `pins.json` with a one-off script. Don't commit the script.
   - Read and write `data/pins.local.json` in the new shape, and migrate on first load as in the spec: convert `anchors.local.json` and `placements.local.json`, then rename them `*.migrated`.
4. **Client:**
   - `scan-viewer/citations.ts`: the METHODS table is keyed by the four methods (Exact, Vision match, Estimated with its hint from `from`, Volume only), and `methodLabel` and `methodHint` take only the `Scan`.
   - `groupCitations` groups by method, not by label.
   - `people.ts` shows Confirm for `method === 'vision'`.
   - `person-panel/helpers.ts` follows.
5. **Scripts:**
   - `match-citation-scans/run.ts` skips a reference whose first scan is `'exact'` or `'vision'`.
   - `map-citation-scans/index.ts` skips estimates with `from === 'pins'`.
   - `evaluate-reader` uses the new names; its hand-only filters stay.
6. **Docs:**
   - Make code comments use the glossary's pin terms.
   - In `.scratch/gedcom-export/issues/01-storage-not-lossless-for-export.md`, update the local file names.
   - Leave the chart's `Anchor` in `tree-view/build/` (ADR-0003) alone.

## Acceptance

- `grep -rnw "Anchor\|Anchors\|SeenRecord\|Placement\|Placements\|anchored" src/server src/common src/client/components/scan-viewer src/client/components/person-panel scripts` finds nothing except history notes.
- `grep -rn "'placed'\|\.by ===\|scan\.by" src/client src/common` finds nothing.
- Existing tests pass, with only names, file shapes and method values changed in them. Add tests for migration, and for the new methods (exact vs vision, and the estimate's `from`).
- `bun run format`, `bun run lint`, `bun run typecheck` and `bun test` pass.
- **On the `ylonen` data:**
  - first open migrates `anchors.local.json` (1,756 Record pins, 283 Page pins, all vision) into `pins.local.json` with the same counts
  - person 196's rippikirja source shows "Vision match"
  - a Mark shows "Exact"
