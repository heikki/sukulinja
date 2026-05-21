# Write ADR-0003: hybrid layout-and-render

Status: ready-for-agent

## Parent

`.scratch/hybrid-tree-view-layout/PRD.md`

## What to build

Add a new ADR at `docs/adr/0003-hybrid-layout-and-render.md` capturing the decision to split tree-view rendering into a layout tree (extents bubble up, packing logic stays clean) plus a flat `EmitOutput` consumed by the renderer (top-level ID-keyed elements, no nested groups).

The ADR records both the chosen design and the two rejected alternatives, so a future reader doesn't re-litigate the call:

- **Pure-nested (rejected).** Keep the current Block tree end-to-end. Cleanest for "move one transform, subtree follows" gestures — but couples layout to rendering, leaks `external` / wrapper types into the renderer, and breaks DOM identity for elements that change tree-parent across structural updates (focus change, generation expansion).
- **Pure-flat (rejected).** Replace the layout tree with flat per-Person absolute coords. Kills `external` and wrappers cleanly — but the layout algorithm is extents-driven (packing, ancestor shift, step-fam reservation, Aunts/Uncles placement all consume subtree extents), and flat coords give those nowhere natural to live.
- **Hybrid (chosen).** Internal layout tree (extents bubble naturally, algorithm unchanged) + flat `EmitOutput` for rendering (renderer knows nothing about ownership, top-level ID-keyed elements survive structural updates, animation-friendly).

Follow the structure of the existing ADRs (`docs/adr/0001-bloodline-pyramid-directional-ties.md`, `docs/adr/0002-concentrate-ancestor-laterals-at-depth-1.md`). Keep it tight — context, decision, consequences, alternatives.

## Acceptance criteria

- [ ] `docs/adr/0003-hybrid-layout-and-render.md` exists.
- [ ] The ADR records the chosen hybrid model and both rejected alternatives (pure-nested, pure-flat) with the trade-offs that decided each.
- [ ] Structure matches the style of ADR-0001 / ADR-0002 in the same directory.

## Blocked by

None — can start immediately.
