# Add `emit` pass producing flat `EmitOutput`; cut renderer over; delete `RenderGroup` / `renderChartBlocks`

Status: ready-for-agent

## Parent

`.scratch/hybrid-tree-view-layout/PRD.md`

## What to build

Introduce a new `emitLayout(root, focusOffset) → EmitOutput` pass that walks the layout tree once, accumulates absolute offsets, and emits a flat ID-keyed output. Cut `buildChart` over to call it. Delete the old nested-rendering path.

End-to-end behavior unchanged. The chart renders pixel-identical, but every box is now a top-level SVG element rather than nested inside `<g>` groups.

`EmitOutput` shape (sketch):

```ts
type PlacedPerson = { personId: number; x: number; y: number };
type DrawnLine = { key: string; from: Point; to: Point };
type EmitOutput = { persons: PlacedPerson[]; lines: DrawnLine[] };
```

Emit pass behavior:

- Walks the layout tree once. At each step, the accumulated absolute offset is the sum of ancestor offsets so far.
- At each `PersonBlock`, emits one `PlacedPerson` at the accumulated absolute position. (Anchors do not emit a `PlacedPerson` — their box belongs to the upstream `PersonBlock`.)
- At each `FamilyBlock`, emits the tie + drop + bar + leg lines translated to absolute coords (same geometry as today's `renderLocal`).
- Returns one flat `persons` list and one flat `lines` list.

`buildChart` in `layout.ts` becomes: build the layout tree → find Focus's absolute position by walking the tree (or via `personLocalPos` then composing) → call `emitLayout(root, focusCenteringOffset)` → return `EmitOutput`. The existing re-centering step (translating the root so Focus lands at chart 0,0) is folded into the emit offset.

The Lit renderer in `tree-view/index.ts` iterates `emitOutput.persons` (one keyed `<g transform="translate(x,y)">` per person) and `emitOutput.lines` (one keyed line element per line). No nested SVG groups.

After cut-over, delete:

- `RenderGroup`, `RenderOutput`
- `renderChartBlocks`, `renderOneBlock`
- The `renderLocal()` method on `Block` subclasses (the line-emit logic moves into the emit pass, or stays as a method called by the emit pass — either is fine; preference for the cleanest result).

## Acceptance criteria

- [ ] `emitLayout` exists as a pure function returning `EmitOutput`.
- [ ] `buildChart` returns `EmitOutput` (or equivalent) — not a `RenderOutput` with a nested `RenderGroup`.
- [ ] The Lit renderer iterates flat lists; no nested SVG groups in the produced SVG.
- [ ] `RenderGroup`, `renderChartBlocks`, `renderOneBlock` are deleted.
- [ ] The chart renders pixel-identical to `master` for at least one representative genealogy loaded in the app. Verified by eye.
- [ ] `bun run` format → lint → typecheck all pass.

## Blocked by

- `01-replace-personplacement-with-anchor.md`
- `02-move-offset-onto-block.md`
