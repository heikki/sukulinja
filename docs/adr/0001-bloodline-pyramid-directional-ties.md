# Vertical drops with unified directional Tie placement

The ancestor layout makes every parent **Drop** purely vertical at every depth. The Tie sits off the bloodline kid's column in the direction set by the kid's sex — male ancestor's parents fan to his left, female's to her right. The bar runs horizontally from the Tie X over to the kid's column, so the drop is still vertical but the bar does the horizontal work. The shift magnitude scales with remaining levels above: `(2^max(1, levels − depth) − 1) × half-slot` (half-slot at the topmost row, 1.5 slots one row lower, 3.5 slots two rows lower, etc.).

The same rule applies at depth 1, even when the sibship widens with **Aunts/Uncles**: the Tie stays at the directional shift and the bar reaches out to whichever Aunt/Uncle sits farthest from the Tie. This places each Couple as close to chart center as the inter-couple spacing allows, keeps each Couple's great-grandparents centered around the Couple itself, and gives the upper pyramid enough horizontal slack to keep gen-N+1 columns distinct.

**Focus** is pinned at chart X = 0; the pyramid drifts left or right of Focus rather than re-centering. Within every Couple, spouse separation stays fixed at one slot and subtree extents grow strictly outward from chart center.

## Considered options

- **Always Tie at chart-X = 2 × ancestorChartX** (pure symmetric pyramid). Rejected: produces long L-bends at depth 1 when Aunts/Uncles widen the sibship.
- **Tie at bar midpoint at depth 1, directional at depth ≥ 2** (the earlier two-regime rule). Rejected: with the depth-1 bar-midpoint rule, the GP couple drifts far off chart center whenever Aunts/Uncles are skewed to one side — the new unified rule keeps every ancestor couple as close to chart center as one slot allows, and the bar absorbs any horizontal slack.
- **Always Tie at bar midpoint.** Rejected: collides adjacent gen-N+1 ancestor columns at depth ≥ 3.
- **Always L-bend** (drop kinks to land at bar midpoint regardless of depth). Rejected: vertical drops look cleaner; the bar can do the horizontal work.
- **Doubling-tilt** (original `kidOffset = 2 * kidOffset + sign * 0.5`). Rejected: produced bloodline-column collisions at depth ≥ 4.

## Consequences

- The childhood-Family builder takes only the bloodline kid's depth and sex; it never inspects sibship width. The Tie's directional shift is intrinsic to the kid, not negotiated with the rest of the row.
- Each Couple's Tie sits at the directional shift defined above (sign by the bloodline kid's sex, magnitude growing exponentially with levels remaining above). The bloodline kid itself stays on its own column.
- The kid sibship Bar spans the union of the Child anchor X and every kid X — so a one-kid sibship at depth ≥ 2 still draws a horizontal segment from the Drop to the kid's Leg, and a wide depth-1 sibship reaches from the Tie out to the farthest Aunt/Uncle.
