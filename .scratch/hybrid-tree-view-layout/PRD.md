# Hybrid tree-view layout: internal layout tree + flat render output

## Problem Statement

The tree-view module currently couples layout and rendering inside a single Block tree. The Block tree forces every node to have exactly one tree-parent, but a Person is naturally a member of several Families (childhood + each spouseFam). To bridge that mismatch, the codebase carries two wrapper types (`PlacedBlock`, `PersonPlacement`) and an `external: true, block: null` correlated pair that marks "this Family needs this Person's local x for line geometry, but their box is rendered by my owner".

This is a structural shim, not a domain concept. It leaks into rendering: the renderer walks the Block tree, descends through `PlacedBlock` wrappers, and consumes `PersonPlacement` entries with the `external` flag implicit in the line-drawing logic. Anyone reading the rendering code has to learn ownership and the `external` flag before they can answer "what gets drawn where".

It also limits future transition work. The current render walk emits nested `<g transform>` groups composed from each Block's offset. Structural changes (focus re-rooting, generation expansion, sibship reshuffles) move a Person to a different tree-parent, which changes the SVG group they live in — breaking DOM identity and preventing smooth interpolation between layouts.

## Solution

Split layout and rendering along the natural seam.

- **Layout** keeps a tree. Extents bubble up via `children`; packing, ancestor shift, step-fam reservation, Aunts/Uncles placement, and the bloodline pyramid all stay exactly as today — the algorithm is unchanged.
- **Layout emits** a flat ID-keyed output: a list of `{personId, x, y}` boxes in absolute chart coords and a list of `{key, from, to}` lines in absolute chart coords.
- **Rendering** consumes only the flat output. Every box is a top-level SVG group keyed by `personId`; every line is a top-level element keyed by its line key. The renderer has no knowledge of ownership, anchors, or the layout tree.

The `external` concept stops at the layout boundary. Inside layout, it becomes a named `Anchor` type — a layout-internal "position-only" slot for a person whose box is rendered by the LayoutNode above. It never appears in the emit output.

## User Stories

The "user" here is the developer maintaining and extending the tree-view module.

1. As a developer maintaining tree-view, I want the render code to consume a flat ID-keyed list of boxes and lines, so I can read the rendering logic without first learning ownership or wrapper types.
2. As a developer, I want layout algorithms to keep returning a tree with extents that bubble up, so packing and ancestor-shift logic stays unchanged.
3. As a developer, I want the "external person" concept to be a layout-internal type called Anchor, so downstream code never sees `block: null` correlated with `external: true`.
4. As a developer adding transitions later, I want every rendered element to be a top-level ID-keyed sibling in the SVG, so re-parenting inside layout (a person changes ancestor/sibling role across focus changes) doesn't change DOM identity.
5. As a developer testing layout, I want layout output to be a flat data structure, so I can assert on it without walking a tree.
6. As a developer, I want extents computation to be a pure function over a LayoutNode subtree, so I can test it in isolation.
7. As a developer, I want the emit pass (LayoutNode tree → flat output) to be a pure function, so I can test it with snapshot or property-based tests.
8. As a developer reading the layout module, I want LayoutNode types named after the domain (PersonNode, FamilyNode), so the code reads close to CONTEXT.md vocabulary without intermediary wrapper noise.
9. As a developer hit-testing or animating by personId, I want `personId → {x, y}` lookup to be O(1) on the flat output, so I don't need to walk the tree.
10. As a developer who may swap renderers later (Canvas, debug overlay), I want the flat output to be the only interface to rendering, so the renderer can be replaced without touching layout.
11. As a developer expanding a generation or changing focus, I want the same personId to map to the same DOM element across re-renders, so transition libraries can interpolate smoothly.
12. As a developer reading the layout pipeline, I want one consistent term — Anchor — for the layout-internal "I need this person's local x but not their box" slot, so I don't have to decode an `external` flag.
13. As a developer modifying line drawing, I want a FamilyNode's adult/kid slots to be a single discriminated type (PersonNode | Anchor | null), so the type system tells me which case I'm handling.
14. As a developer adding a new layout case, I want the tree-vs-flat boundary to make it obvious whether my change affects layout, emit, or rendering, so I don't accidentally cross-couple them.

## Implementation Decisions

**Modules — what's built, modified, deleted**

- **LayoutNode types (new).** Introduce `PersonNode` and `FamilyNode`, each carrying their own `offset: Point` (relative to parent) plus the child references needed for tree traversal. These replace `PersonBlock`/`FamilyBlock`.
- **Anchor type (new).** Layout-internal type representing the position-only slot inside a FamilyNode. A FamilyNode's husband/wife slots are `PersonNode | Anchor | null`; its kids are `(PersonNode | Anchor)[]`. Anchor carries only the local x needed for line geometry. This replaces `PersonPlacement{external: true, block: null}`.
- **Extents algebra (extracted).** Pure function `extents(node)` returning `{left, right}`. Operates on a LayoutNode subtree, ignoring its own offset (composition uses children's offsets + extents). Cached per node. Deep module — narrow interface, lots of behavior.
- **Packing (`packBlocks`, unchanged).** Already a pure function over `Extents[]`. Keep as-is.
- **Builders (modified, same shape).** `build-tree`, `build-ancestor-tree`, `build-owned`, `build-marriages`, `build-step-fams` keep their algorithmic roles. They construct LayoutNode trees instead of Block trees. `buildExternalAdultFB` becomes "build a FamilyNode whose anchor adult is owned upstream" — same logic, returns a FamilyNode with an Anchor in the appropriate slot.
- **Bloodline footprint (unchanged).** `bloodline-footprint.ts` still computes the footprint from layout-tree data.
- **Emit pass (new — deep module).** `emitLayout(root: LayoutNode, focusOffset: Point): EmitOutput`. Walks the tree once with an accumulated absolute offset, collecting `PlacedPerson` records at every PersonNode (boxes) and `DrawnLine` records at every FamilyNode (tie + drop + bar + legs translated to absolute chart coords). Anchors contribute to line endpoints but never produce a PlacedPerson.
- **`buildChart` (modified).** Becomes: build LayoutNode root → find focus's absolute position via a tree walk → call `emitLayout(root, focusOffset)` → return `EmitOutput`. The current re-centering step (`block.ts:69-88`, `layout.ts`) is folded into the emit offset.
- **Renderer (modified).** Top-level Lit template iterates `emitOutput.persons` (each `<g transform="translate(x,y)">` keyed by `personId`) and `emitOutput.lines` (each keyed by line key). No nested groups, no descent through wrappers.
- **Deleted.** `PlacedBlock`, `PersonPlacement`, `RenderGroup`, `renderChartBlocks`, the abstract `Block` class, the `external` flag, the `block: null` correlation. `block.ts` shrinks to just the `Point`/`Line`/`PersonBox` value types (or those move to `helpers.ts`).

**Boundaries**

- `external` is no longer a public concept. The only thing the renderer sees is `EmitOutput`. Anchor is layout-internal.
- `PersonNode.offset` is set at construction time by its parent builder. Builders compute child extents first (so they can place children), then construct each child with its decided offset. This preserves bottom-up extents flow without the lazy `cachedExtents` indirection of today's Block.
- The emit pass is the only place that knows how to translate layout-local coords to absolute chart coords. Layout builders work entirely in parent-relative offsets, exactly as today.

**Naming**

- `PersonNode` / `FamilyNode` over `PersonBlock` / `FamilyBlock` — signals the new model, and "Node" matches the tree-of-data role better than "Block" (which carried implementation connotations like `renderLocal`).
- `Anchor` for the layout-internal position-only slot.
- `EmitOutput`, `PlacedPerson`, `DrawnLine` for the flat output types.

**Documentation**

- **New ADR (`0003-hybrid-layout-and-render.md`).** Captures the three-way choice (pure-nested, pure-flat, hybrid) and why hybrid wins here: extents-bubbling is load-bearing for layout; top-level ID-keyed rendering preserves DOM identity across structural changes; `external` becomes layout-internal.
- **File header comments.** Every file in `tree-view/` has a header comment describing the module's role and the types it works with. These get rewritten to reflect the new LayoutNode/Anchor/emit vocabulary. Today's headers reference `PersonBlock`, `FamilyBlock`, `PlacedBlock`, `PersonPlacement`, and `external` — none of which survive.
- **CONTEXT.md unchanged.** Anchor and LayoutNode are implementation-only. The domain glossary describes the *chart*, not the code, and stays as-is. ADR-0001 and ADR-0002 likewise stay untouched — they describe layout decisions that survive the refactor verbatim.

## Testing Decisions

**No automated tests are added by this work.** The repo has no existing test infrastructure, and this refactor is behavior-preserving — no coordinate math changes, only how the same numbers are routed through types and layers. The risk of subtle drift is low enough that manual visual verification is sufficient.

**Verification per slice.** Each slice's acceptance criteria include: run the app, load a known genealogy, confirm the rendered chart is pixel-identical to before. The chart's correctness is visually obvious — an 8px shift or a missing line jumps out. A flat coordinate dump diff is harder to read than the actual rendered chart for this kind of change.

**When this changes.** If the codebase grows past a single consumer, a second developer joins, or future changes start touching the layout algorithm itself (rather than just restructuring the same algorithm), regression snapshot tests pay back fast and should be added then. The natural test runner is Bun's built-in (the project's existing toolchain is `bun.lock` / `bunfig.toml`).

## Out of Scope

- **Animation/transition implementation.** This refactor's main forward-looking motivation, but the work here stops at unlocking it. No CSS transitions, no JS-driven tweens, no FLIP-style choreography are added. A follow-up PRD owns that.
- **Visual layout changes.** The chart looks pixel-identical before and after. The layout algorithm (packing, ancestor shift, bloodline pyramid, step-fam fan, Aunts/Uncles placement, bloodline footprint) is preserved exactly. If the diff changes any rendered coordinate, that's a regression, not progress.
- **Performance work.** No micro-optimization, no benchmarking, no caching beyond what falls out naturally. If the new model is meaningfully slower than today on a realistic chart, that's worth a follow-up, but tuning is not part of this PRD.

## Further Notes

- The `external`/Anchor concept is structural, not a domain term. It must NOT enter CONTEXT.md (per the grilling decision earlier — domain glossary stays clean).
- The new ADR should sketch the rejected alternatives (pure-nested, pure-flat) so future readers don't re-litigate the choice.
- Building the LayoutNode tree top-down (parent computes child extents, then constructs child with its offset) is a small but real shift from today's bottom-up-with-lazy-extents model. If that turns out to be awkward for any specific builder (step-fam fan reservations especially), keep the lazy `extents` getter on LayoutNode as an internal optimization — it's compatible with everything else here.
- After deletion, `block.ts` either disappears entirely or shrinks to a small value-types file. The `RenderGroup` type and `renderChartBlocks` walker go away.
- Verify each slice by running the app, loading a known genealogy, and confirming the rendered chart is pixel-identical before and after the slice. This replaces automated tests for the duration of this refactor (see Testing Decisions).
