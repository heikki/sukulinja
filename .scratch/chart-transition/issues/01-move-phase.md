Status: ready-for-agent

# Extract the Move phase into a TransitionController + pure Planner

## Parent

`.scratch/chart-transition/PRD.md`

## What to build

Stand up the **TransitionController** (a Lit ReactiveController, sibling to the
viewport controller) and a pure **Planner**, and move the **Move** phase into
them with no behaviour change.

The Planner takes the previous and next **Hourglass chart**, the **Relayout**
kind (**Focus** change vs **Generation limit** change), and a chart→screen
mapping, and returns the `moving` set — boxes and edges present in both charts,
each with its from→to screen position. Matching is by **Box key** (the path key)
for a Generation-limit Relayout and by personId / base key for a Focus Relayout,
so pedigree-collapse duplicates (one person drawn as several boxes) match
correctly.

The controller captures old screen positions before the Relayout, plays the FLIP
slide/morph after the **Pin** settles, owns cancellation of an in-flight Move,
and owns paint-order so sliders render behind the stationary cards. The element
delegates Move to the controller and keeps only the 3-line Pin handshake
(`applyPendingPin()` then `transition.settle()`). The **Enter** phase (new-card
fade) stays in the element for this slice.

Consume the flat `EmitOutput`, never the layout tree (ADR-0003). The Pin stays
the viewport's (ADR-0004).

## Acceptance criteria

- [ ] Move on a Focus Relayout and a Generation-limit Relayout looks identical
      to today: persisting cards slide, edges morph, Focus stays pinned, sliders
      paint behind stationary cards, no first-frame flash.
- [ ] The pedigree-collapse case still animates correctly — one person rendered
      as two boxes with distinct Box keys both slide (gen 4↔5 on the ylonen
      dataset around person 242).
- [ ] The Planner is a pure module unit-tested with two charts + a fake mapping:
      asserts the `moving` set and each item's from→to, including a
      duplicate-Box-key case.
- [ ] The Move-phase fields/methods no longer live on the element; they live in
      the controller. Enter may remain in the element for now.
- [ ] Reduced-motion still suppresses the Move.
- [ ] `bun run` format → lint → typecheck → tests all pass.

## Blocked by

None - can start immediately.
