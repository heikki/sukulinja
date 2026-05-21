# Rename `PersonBlock` / `FamilyBlock` → `PersonNode` / `FamilyNode`; rewrite `tree-view/` file headers

Status: ready-for-agent

## Parent

`.scratch/hybrid-tree-view-layout/PRD.md`

## What to build

Mechanical rename of the layout types to signal the new model, then rewrite the header comments at the top of each file in `src/client/components/tree-view/` to describe the LayoutNode / Anchor / emit vocabulary.

End-to-end behavior unchanged. The chart renders pixel-identical.

Renames:

- `PersonBlock` → `PersonNode`
- `FamilyBlock` → `FamilyNode`
- `FamilyBlockSpec` → `FamilyNodeSpec`
- `Block` (abstract base) → `LayoutNode`
- File renames in line with the type renames (e.g. `block-person.ts` → `node-person.ts`, `block-family.ts` → `node-family.ts`, `block.ts` → `node.ts`). Adjust imports accordingly.

File header comments:

- Every `.ts` file in `src/client/components/tree-view/` has a top-of-file comment block describing its role and the types it works with. These currently reference `PersonBlock`, `FamilyBlock`, `PlacedBlock`, `PersonPlacement`, `external` — none of which survive the earlier slices.
- Rewrite each header to describe the post-refactor model: LayoutNode tree built bottom-up with `extents` bubbling, Anchor as the layout-internal position-only slot, emit pass producing a flat `EmitOutput`.
- Keep the headers tight — one short paragraph per file is plenty.

## Acceptance criteria

- [ ] No occurrence of `PersonBlock`, `FamilyBlock`, `FamilyBlockSpec`, or `Block` (as a base-class name) in `src/`. The corresponding `*Node` names are used everywhere.
- [ ] File names under `tree-view/` reflect the new naming (`node-person.ts`, `node-family.ts`, `node.ts` instead of `block-*.ts`); imports updated accordingly.
- [ ] Every file in `tree-view/` has a header comment that describes the post-refactor model — no stale references to Block / PlacedBlock / PersonPlacement / external.
- [ ] The chart renders pixel-identical to `master` for at least one representative genealogy loaded in the app. Verified by eye.
- [ ] `bun run` format → lint → typecheck all pass.

## Blocked by

- `03-emit-pass-and-flat-output.md`
