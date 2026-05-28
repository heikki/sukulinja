# Renderer module: chart paint and dims co-located

The chart's render-phase concerns (per ADR-0003's three-phase split) live in a single `tree-view/renderer.ts` module with named exports: `dims` (consumed by emit), `styles` (chart CSS), `renderBox`, `renderEdge`, and the `formatName` / `formatDates` helpers the search-results UI also uses. `TreeViewElement` and `tree-view/styles.ts` import names directly; there is no bundle value and no renderer-related reactive state.

`dims` co-locates with paint because dimensions are a paint choice that emit happens to need as input. The directional dependency `renderer → emit` holds: emit owns the `Dims` type as its input contract; the renderer satisfies it and the parent (`TreeViewElement`) plumbs `dims` into the emit call.

`DrawnLine` carries a `kind: 'tie' | 'drop' | 'bar' | 'leg'` field so the renderer can paint per connector kind (today surfaced as a CSS class on each edge), and so CONTEXT.md's connector vocabulary reaches the emit output.

## Considered options

- **Box-only renderer; edges inline.** Keep `box-renderer.ts`'s shape, leave edges as inline `<path>` in `index.ts`. Rejected: boxes and edges are both paint concerns and were already living in separate places. Co-locating them as one module makes the chart's visual identity readable in one file.
- **Visual-only "theme" with dims kept on the layout side.** Theme owns paint + styles; dims remain a separate emit-side concept. Rejected: dims are a paint choice (a dense look has smaller boxes; a roomy one has bigger). Forcing them out of the paint module splits a single decision across two files.
- **Bundle the render-phase exports into `defaultRenderer` + reactive `renderer` prop on `TreeViewElement`.** Considered (and shipped briefly) as preparation for runtime renderer-swap — e.g., a user-selected visual variant. Reverted: with only one concrete renderer planned and no runtime-swap UX in flight, the bundle was overdesign — extra ceremony at every call site (`this.renderer.X`) for an affordance not in use. Restoring it is mechanical if a swap requirement emerges; until then, named imports stand on their own.

## Consequences

- Avatar clipping moves from an SVG `<defs><clipPath>` block in `index.ts` to CSS `clip-path: circle(50%)` on `.avatar-img` inside the renderer's `styles`. No SVG defs are allocated at the chart level.
- `box-renderer.ts` is removed; `EmitTheme` (in `emit.ts`) renames to `Dims`; `nonprimaryTieYOffset` renames to `tieOffset`.
- No `Renderer` TypeScript interface. With one module and named imports, the contract is structural; an interface is the trigger if a second renderer ever lands.
- The class's private `renderBox` method on `TreeViewElement` renamed to `renderPersonBox` to avoid colliding with the imported `renderBox` function. The method exists because it adds the per-call wiring (person lookup, focus comparison, click handler with viewport pin) that the pure paint function shouldn't know about.
