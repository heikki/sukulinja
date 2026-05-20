# Vertical drops with unified directional Tie placement

The ancestor layout makes every parent **Drop** purely vertical at every depth. The Tie sits off the bloodline kid's column in the direction set by the kid's sex — male ancestor's parents fan to his left, female's to her right. The bar runs horizontally from the Tie X over to the kid's column, so the drop is still vertical but the bar does the horizontal work. The shift magnitude scales with remaining levels above: `(2^max(1, levels − depth) − 1) × HALF_PITCH` (HALF_PITCH at the topmost row, 3 × HALF_PITCH one row lower, 7 × HALF_PITCH two rows lower, etc.).

The same rule applies at depth 1, even when the sibship widens with **Aunts/Uncles**: the Tie stays at the directional shift and the bar reaches out to whichever Aunt/Uncle sits farthest from the Tie. This places each Couple as close to chart center as the inter-couple spacing allows, keeps each Couple's great-grandparents centered around the Couple itself, and gives the upper pyramid enough horizontal slack to keep gen-N+1 columns distinct.

**Focus** is pinned at chart X = 0; the pyramid drifts left or right of Focus rather than re-centering. Within every Couple, spouse separation stays fixed at one COUPLE_PITCH and subtree extents grow strictly outward from chart center.

## Considered options

- **Always Tie at chart-X = 2 × ancestorChartX** (pure symmetric pyramid). Rejected: produces long L-bends at depth 1 when Aunts/Uncles widen the sibship.
- **Tie at bar midpoint at depth 1, directional at depth ≥ 2** (the earlier two-regime rule). Rejected: with the depth-1 bar-midpoint rule, the GP couple drifts far off chart center whenever Aunts/Uncles are skewed to one side — the new unified rule keeps every ancestor couple as close to chart center as COUPLE_PITCH allows, and the bar absorbs any horizontal slack.
- **Always Tie at bar midpoint.** Rejected: collides adjacent gen-N+1 ancestor columns at depth ≥ 3.
- **Always L-bend** (drop kinks to land at bar midpoint regardless of depth). Rejected: vertical drops look cleaner; the bar can do the horizontal work.
- **Doubling-tilt** (original `kidOffset = 2 * kidOffset + sign * HALF_PITCH`). Rejected: produced bloodline-column collisions at depth ≥ 4.

## Consequences

- `buildChildhoodFamily` derives the Tie position from `currentDepth` and the bloodline kid's sex alone — no `kidOffset` parameter, no sibship-width feedback.
- Each Couple's Tie sits at FB-local `tieXFBlocal = ±(2^max(1, levels − depth) − 1) × HALF_PITCH`, sign by sex.
- The kid sibship bar in `block-family.ts` spans `min(childAnchorX, kid Xs)` to `max(childAnchorX, kid Xs)` so a one-kid sibship at depth ≥ 2 still draws a horizontal segment from the Tie's drop over to the kid's leg, and a wide depth-1 sibship draws a long bar reaching from the Tie out to the farthest Aunt/Uncle.
