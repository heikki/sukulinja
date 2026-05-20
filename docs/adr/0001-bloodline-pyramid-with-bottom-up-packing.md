# Vertical drops with depth-split Tie placement

The ancestor layout makes every parent **Drop** vertical. The Tie's chart-X depends on depth:

- **Depth 1** (multi-kid sibship with Aunts/Uncles): the Tie sits directly above the kid **Bar** midpoint. The drop lands in the middle of the sibship.
- **Depth ≥ 2** (one bloodline kid only): the Tie sits one HALF_PITCH off the kid's column in the direction set by the kid's sex — males' parents fan to their left, females' to their right. The bar runs horizontally from the Tie X over to the kid's column, so the drop is still vertical but the bar does the horizontal work. This keeps each Couple's great-grandparents centered around the Couple itself, instead of stacked far off to one side.

**Focus** is pinned at chart X = 0; the pyramid drifts left or right of Focus rather than re-centering. Within every Couple, spouse separation stays fixed at one COUPLE_PITCH and subtree extents grow strictly outward from chart center.

The depth split exists because the two regimes pull in opposite directions:

- At depth 1, Aunts/Uncles widen the sibship by many COUPLE_PITCHes. If we kept the symmetric-pyramid rule there, Pekka+Hilma would sit ~530px to the right of the sibship middle, producing a long L-bend that looks like a drafting error. Aligning the Tie with the bar midpoint moves them above the middle of the sibship instead.
- At depth ≥ 2, every sibship is one kid wide (no laterals; ADR-0002). If we kept the bar-midpoint rule there, the Tie would sit directly above each kid — but adjacent ancestors then have their Mo/Fa parents collide at the next gen. Pulling each ancestor's Tie one HALF_PITCH outward (males to their left, females to their right) keeps gen-N+1 columns distinct and visually centers each Couple's great-grandparents around the Couple itself.

## Considered options

- **Always Tie at chart-X = 2 × ancestorChartX** (pure symmetric pyramid). Rejected: produces long L-bends at depth 1 with Aunts/Uncles.
- **Always Tie at bar midpoint.** Rejected: collides adjacent gen-N+1 ancestor columns at depth ≥ 3.
- **Always L-bend** (drop kinks to land at bar midpoint regardless of depth). Rejected: vertical drops look cleaner; the bar can do the horizontal work.
- **Doubling-tilt** (original `kidOffset = 2 * kidOffset + sign * HALF_PITCH`). Rejected: produced bloodline-column collisions at depth ≥ 4.

## Consequences

- `kidOffset` is no longer a passed parameter — `buildChildhoodFamily` derives the Tie position from `currentDepth` and (at depth 1) the freshly-packed kid sibship.
- Each Couple's Tie sits at FB-local `tieXFBlocal`, with `tieXFBlocal = sibshipBarMid(kids)` at depth 1 and `tieXFBlocal = sex === 'F' ? +HALF_PITCH : -HALF_PITCH` at depth ≥ 2.
- The kid sibship bar in `block-family.ts` spans `min(childAnchorX, kid Xs)` to `max(childAnchorX, kid Xs)` so a one-kid sibship at depth ≥ 2 still draws a horizontal segment from the Tie's drop over to the kid's leg.
