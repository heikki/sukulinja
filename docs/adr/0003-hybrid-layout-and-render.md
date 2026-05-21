# Hybrid layout-and-render: internal layout tree + flat EmitOutput

The tree-view module splits responsibilities between two distinct phases. **Layout** builds a tree of `LayoutNode`s — `PersonNode`s (one person box each) and `FamilyNode`s (one Couple Tie + sibship), with `Anchor` slots marking positions of people whose nodes live in an upstream parent. Extents bubble up through the tree via the `LayoutNode.extents` getter, which composes children's extents with `selfHalfWidth`; the packing algorithm, ancestor-shift rule (ADR-0001), step-fam fan, Aunts/Uncles placement, and bloodline footprint all consume this composed information.

**Rendering** consumes only `EmitOutput` — a pair of flat ID-keyed lists: `PlacedPerson` records (one per PersonNode, with absolute chart coordinates) and `DrawnLine` records (one per Tie / Drop / Bar / Leg, with absolute endpoints). The `emit` pass walks the layout tree once with an accumulated absolute offset and produces the output; the renderer has no knowledge of ownership, anchors, the tree shape, or who-owns-what. Every SVG element is a top-level sibling keyed by its stable id.

`Anchor` is layout-internal. It never appears in the emitted output, so the renderer is decoupled from the structural shim that lets a Family reference a Person whose box is rendered by an upstream PersonNode.

## Considered options

- **Pure-nested (all-Block-tree).** Keep the original `Block` tree end-to-end, with the renderer walking it directly and emitting nested SVG `<g transform>` groups. Rejected: couples layout to rendering, leaks the `external` flag and the `PlacedBlock` / `PersonPlacement` wrappers into the renderer, and (the load-bearing reason) breaks DOM identity for any element that changes tree-parent across structural updates — focus re-rooting, generation expansion, sibship reshuffles all force re-mounting boxes that should have stayed continuous.
- **Pure-flat (no layout tree).** Replace the layout tree with flat per-Person absolute coords; the layout algorithm threads positions through return values instead of via a tree. Rejected: extents-bubbling is load-bearing for layout (packing, ancestor shift, step-fam reservation, Aunts/Uncles placement, bloodline footprint all consume subtree extents). With no tree, "how wide is the subtree rooted at this person?" has nowhere natural to live — either every layout function grows a return shape carrying extents, or you build a transient measurement tree, at which point you're effectively doing the hybrid.
- **Hybrid (chosen).** Tree-shaped layout (where extents naturally bubble) + flat ID-keyed render output (where DOM identity survives structural changes). Each phase has the data structure that fits its work; the seam between them is the emit pass.

## Consequences

- `Block`, `PlacedBlock`, `PersonPlacement`, `external`, `RenderGroup`, `renderChartBlocks` all gone. `LayoutNode` is the abstract base; `Anchor` and `OwnedPersonSlot` are the discriminated slot types inside a `FamilyNode`.
- Builders construct `LayoutNode` subtrees and pass them upward. The emit pass is the only place that translates layout-local offsets to absolute chart coordinates.
- The renderer iterates two flat lists. No nested SVG groups; no walking through wrappers. A future renderer (Canvas, debug overlay, animation engine) plugs in by consuming `EmitOutput` without touching layout.
- Animation and transitions become straightforward: every rendered element has a stable identity at the top level of the SVG, so re-parenting in the layout tree (which is common across focus changes) never changes the DOM element a transition library is animating.
- The Aunts/Uncles concentration at depth 1 (ADR-0002) and the bloodline pyramid rule (ADR-0001) are unaffected — they describe layout algorithm decisions, which survive the split intact.
