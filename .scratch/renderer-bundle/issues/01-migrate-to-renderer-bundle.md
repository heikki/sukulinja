# Migrate chart rendering to swappable Renderer bundle

Status: ready-for-agent

## What to build

Encapsulate the chart's render phase (per ADR-0003's three-phase split) into a single `defaultRenderer` value, exposed as a reactive `renderer` property on `TreeViewElement`. The bundle owns dims (consumed by emit), chart CSS, box paint, and edge paint. The previous `box-renderer.ts` is removed; its responsibilities split between two files in a new `renderer/` subdirectory.

See [ADR-0004](../../../docs/adr/0004-swappable-renderer-bundle.md) for the full rationale and the design choices that produced this shape. Migration steps follow the order below; each step keeps the chart working.

### Migration steps

1. **Tag `DrawnLine` with `kind`** in `emit.ts`: add `kind: 'tie' | 'drop' | 'bar' | 'leg'`. Update `familyLines` (Tie) and `appendSibshipLines` (Drop / Bar / Leg) to populate the tag.
2. **Scaffold `renderer/`** (new files, not yet wired):
   - `renderer/box.ts` — `renderBox` function (extracted from `boxRenderer.render`), `formatName`, `formatDates`, `NAME_TRUNCATE`, `avatarR`, `avatarCx`. Replace `clip-path="url(#sl-avatar)"` on the `<image>` with `class="avatar-img"`.
   - `renderer/index.ts` — `defaultRenderer` object: `dims` (boxW/boxH/gapX/gapY/tieOffset), `styles` (inlined `css\`\``), `renderEdge` (extracted from `index.ts`'s inline `<path>`, dispatches by `line.kind` via class for now), `renderBox` (imported from `./box`). The `styles` block holds the ~65 lines of theme CSS currently in `tree-view/styles.ts` (the `.node*`, `.placeholder-avatar`, `.edge`, `sl-enter` animation, and `@keyframes sl-enter` rules) plus a new `.avatar-img { clip-path: circle(50%); }` rule.
3. **Cut TreeViewElement over**:
   - Add `@property({ attribute: false }) renderer = defaultRenderer`.
   - Replace `boxRenderer.*` → `this.renderer.*` (including the emit call that passes dims).
   - Delete the `<defs><clipPath id="sl-avatar">` block from the SVG markup.
   - Replace the inline edge `<path>` with `this.renderer.renderEdge(line)`.
   - In `tree-view/styles.ts`, remove the moved theme CSS; compose `defaultRenderer.styles` into `treeViewStyles` (chrome rules stay).
4. **Rename**: `EmitTheme` → `Dims` in `emit.ts` and its consumer; `nonprimaryTieYOffset` → `tieOffset` (only used twice, in `emit.ts:117-118`).
5. **Delete `box-renderer.ts`**. Confirm with `grep -rn box-renderer src/` first.

### Resulting layout

```
src/client/components/tree-view/
  emit.ts                  ← exports Dims (renamed from EmitTheme); DrawnLine.kind added
  index.ts                 ← TreeViewElement with `renderer` reactive prop
  styles.ts                ← chrome only (toolbar, results, canvas, :host vars)
  renderer/
    index.ts               ← dims, styles, renderEdge, defaultRenderer assembly
    box.ts                 ← renderBox + formatters + avatar constants
  nodes/
  viewport/
```

### Shape of `defaultRenderer`

```ts
export const defaultRenderer = {
  dims: { boxW: 184, boxH: 90, gapX: 28, gapY: 70, tieOffset: 6 },
  styles,            // css`` block — ~65 lines, inlined in renderer/index.ts
  renderBox,         // imported from ./box
  renderEdge,        // local; dispatches by line.kind via class
};
```

No `Renderer` TypeScript interface — the prop's type is `typeof defaultRenderer`. Interface extraction is the trigger for a second renderer landing.

## Acceptance criteria

- [ ] Chart renders visually identical to the pre-migration behavior (boxes, avatars clipped to circles, edges, focus highlight, hover state, fade-in animation).
- [ ] `TreeViewElement` exposes a `renderer` reactive property defaulting to `defaultRenderer`; all internal references go through `this.renderer.*`.
- [ ] `DrawnLine` carries a `kind` field populated by emit for every line; rendered edges expose the kind via CSS class (`class="edge ${kind}"`).
- [ ] Avatar clipping works via CSS `clip-path: circle(50%)`; the SVG `<defs><clipPath id="sl-avatar">` block is gone.
- [ ] `EmitTheme` renamed to `Dims`; `nonprimaryTieYOffset` renamed to `tieOffset`.
- [ ] `box-renderer.ts` is deleted; no remaining imports reference it.
- [ ] `tree-view/styles.ts` contains chrome rules only (toolbar, search results, canvas, `:host` CSS vars, `.empty`); the moved theme CSS lives in `renderer/index.ts`.
- [ ] `bun run format && bun run lint && bun run typecheck` all pass.

## Blocked by

None - can start immediately.
