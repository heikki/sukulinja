# Replace `PersonPlacement` with `Anchor` discriminated type

Status: ready-for-agent

## Parent

`.scratch/hybrid-tree-view-layout/PRD.md`

## What to build

Eliminate the `external: true, block: null` correlated pair inside `FamilyBlock`'s adult and kid slots. Introduce a new layout-internal type — `Anchor` — that represents a position-only slot for a person whose box is rendered by an upstream Block.

End-to-end behavior unchanged. The chart renders pixel-identical.

A `FamilyBlock`'s adult slots (`husband`, `wife`) and kid slots become:

- A directly-owned `PersonBlock` (today's `external: false, block: PersonBlock` case), or
- An `Anchor` carrying only the local x needed for the FB's line geometry (today's `external: true, block: null` case), or
- `null` (slot absent).

Type shape (sketch from the grilling decision):

```ts
type Anchor = { id: number; localX: number };
type AdultSlot = PersonBlock | Anchor | null;
type KidSlot = PersonBlock | Anchor;
```

Every site that today reads `placement.external` switches to type-narrowing (`instanceof PersonBlock`, or a discriminator check). The FB's line-drawing code (`appendSibshipLines`, the tie segment) reads the local x off either variant uniformly.

All builders (`build-tree`, `build-ancestor-tree`, `build-owned`, `build-marriages`, `build-step-fams`) produce the new types. No code outside the `tree-view/` module is affected.

## Acceptance criteria

- [ ] No occurrence of `PersonPlacement` or `external` in `src/`.
- [ ] `Anchor` exists as a layout-internal type and is used wherever today's code stores `external: true, block: null`.
- [ ] `FamilyBlock`'s adult and kid slot types are the discriminated union sketched above (or equivalent).
- [ ] The chart renders pixel-identical to `master` for at least one representative genealogy loaded in the app. Verified by eye.
- [ ] `bun run` format → lint → typecheck all pass.

## Blocked by

None — can start immediately.
