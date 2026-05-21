# Move `offset` onto `Block`; remove `PlacedBlock` wrapper

Status: ready-for-agent

## Parent

`.scratch/hybrid-tree-view-layout/PRD.md`

## What to build

Eliminate the `PlacedBlock = { block, offset }` wrapper. Each Block carries its own `offset: Point` (its position relative to its parent) directly. `Block.children` becomes `readonly Block[]` instead of `readonly PlacedBlock[]`.

End-to-end behavior unchanged. The chart renders pixel-identical.

Every site that today reads `child.offset` reads `child.block.offset` instead — i.e., reads directly off the child Block. The render walk (`renderChartBlocks`, `renderOneBlock`) updates to read offsets directly. Builders that today construct `{ block, offset }` wrappers construct the child Block with its offset set on the instance (constructor argument or assignment immediately after construction is fine — keep whichever is simplest).

The lazy `cachedExtents` getter on Block remains as-is; it ignores own offset and composes from children, identical to today.

## Acceptance criteria

- [ ] No occurrence of `PlacedBlock` in `src/`.
- [ ] Every Block instance has an `offset: Point` field set by its parent at construction time.
- [ ] `Block.children` is `readonly Block[]`.
- [ ] The chart renders pixel-identical to `master` for at least one representative genealogy loaded in the app. Verified by eye.
- [ ] `bun run` format → lint → typecheck all pass.

## Blocked by

None — can start immediately.
