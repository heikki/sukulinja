# Swappable Renderer: paint, styles, and dims in one bundle

The render phase (ADR-0003's third phase) is encapsulated as a single `defaultRenderer` value, passed into `TreeViewElement` as a reactive property. The bundle owns box paint (`renderBox`), edge paint (`renderEdge`), all chart CSS (`styles`), and the layout dimensions (`dims` — `boxW`/`boxH`/`gapX`/`gapY`/`tieOffset`) that emit consumes. A future visual variant (dense print layout, alternate aesthetic) is swapped by replacing the prop value, with no parent-side restructuring.

Emit takes `Dims` as input but knows nothing about the renderer; the renderer imports `Dims` from emit. Directional dependency preserves ADR-0003's three-phase split: emit's `EmitOutput` remains the stable boundary, and a future Canvas/PDF renderer plugs in without touching layout.

`DrawnLine` carries a `kind: 'tie' | 'drop' | 'bar' | 'leg'` field so the renderer can paint per connector kind, surfacing CONTEXT.md's connector vocabulary into the emitted output.

## Considered options

- **Box-only swap.** Extract just `boxRenderer` into a swappable shape; leave edges, styles, dims, and animations where they were (inline in `index.ts`, in `styles.ts`, on `boxRenderer`). Rejected: a coherent visual variant isn't just the box — every other knob (edge stroke, palette, animations, slot pitch) needs to move together to constitute a different look. Half-swapped means callers can't actually produce a complete variant.
- **Visual-only Theme (dims stay with layout).** Theme owns paint + styles; dims remain a separate layout-side concept. Rejected: dims *are* a visual choice. A dense look has smaller boxes; a roomy look has bigger ones. Forcing dims out of the bundle means the bundle can't fully describe its look, and "swap" can't change sizing — which is the most visually obvious lever.
- **Bundle named "Theme".** Same shape, named `theme` / `Theme`. Rejected on naming grounds: "theme" connotes visual-only, but the bundle owns dims (layout-affecting). "Renderer" is honest about scope and aligns with ADR-0003's existing vocabulary ("a future renderer plugs in by consuming `EmitOutput`").
- **Renderer (chosen).** One bundle owning the full render-phase contract: dims (emit input), styles (CSS), paint (`renderBox`, `renderEdge`). Reactive prop on `TreeViewElement`; default supplied so callers without preferences don't think about it.

## Consequences

- Changing renderer invalidates layout — emit re-runs because dims may have changed. Fine: renderer swaps are user-driven (settings preference), not per-frame.
- No `Renderer` TypeScript interface is defined while only one concrete renderer exists. The prop's type is `typeof defaultRenderer`; extracting an interface is the trigger for a second renderer landing.
- Avatar clipping moves from an SVG `<defs><clipPath>` block in `index.ts` to CSS `clip-path: circle(50%)` inside the renderer's `styles`. No `defs?()` slot on the bundle yet — a future renderer needing SVG defs adds it then.
- `box-renderer.ts` is removed; its responsibilities split between `renderer/box.ts` (paint + formatters) and `renderer/index.ts` (dims, styles, edge paint, bundle assembly). `EmitTheme` in `emit.ts` renames to `Dims`.
