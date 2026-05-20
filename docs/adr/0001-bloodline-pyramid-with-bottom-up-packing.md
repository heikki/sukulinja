# Vertical drops with depth-split Tie placement

The ancestor layout makes every parent **Drop** vertical. The Tie's chart-X depends on depth:

- **Depth 1** (multi-kid sibship with Aunts/Uncles): the Tie sits directly above the kid **Bar** midpoint. The drop lands in the middle of the sibship.
- **Depth ≥ 2** (one bloodline kid only): the Tie sits at chart-X = 2 × ancestorChartX (the symmetric-pyramid position). The bar runs _horizontally_ from the Tie X over to the kid's column, so the drop is still vertical but the bar does the horizontal work.

**Focus** is pinned at chart X = 0; the pyramid drifts left or right of Focus rather than re-centering. Within every Couple, spouse separation stays fixed at one COUPLE_PITCH and subtree extents grow strictly outward from chart center.

The depth split exists because the two regimes pull in opposite directions:

- At depth 1, Aunts/Uncles widen the sibship by many COUPLE_PITCHes. If we kept the symmetric-pyramid rule there, Pekka+Hilma would sit ~530px to the right of the sibship middle, producing a long L-bend that looks like a drafting error. Aligning the Tie with the bar midpoint moves them above the middle of the sibship instead.
- At depth ≥ 2, every sibship is one kid wide (no laterals; ADR-0002). If we kept the bar-midpoint rule there, the Tie would sit directly above each kid — but each ancestor's column then drifts by HALF_PITCH per generation, and at depth ≥ 3 the inner spouse of an outer ancestor collides with the outer spouse of an inner ancestor. Reverting to the symmetric-pyramid rule keeps adjacent gen-N+1 columns COUPLE_PITCH apart, and the horizontal bar carries the drop's landing point over to the bloodline kid.

## Considered options

- **Always Tie at chart-X = 2 × ancestorChartX** (pure symmetric pyramid). Rejected: produces long L-bends at depth 1 with Aunts/Uncles.
- **Always Tie at bar midpoint.** Rejected: collides adjacent gen-N+1 ancestor columns at depth ≥ 3.
- **Always L-bend** (drop kinks to land at bar midpoint regardless of depth). Rejected: vertical drops look cleaner; the bar can do the horizontal work.
- **Doubling-tilt** (original `kidOffset = 2 * kidOffset + sign * HALF_PITCH`). Rejected: produced bloodline-column collisions at depth ≥ 4.

## Consequences

- `kidOffset` is no longer a passed parameter — `buildChildhoodFamily` derives the Tie position from `currentDepth` and (at depth 1) the freshly-packed kid sibship.
- Each Couple's Tie sits at FB-local `tieXFBlocal`, with `tieXFBlocal = sibshipBarMid(kids)` at depth 1 and `tieXFBlocal = ancestorChartX` at depth ≥ 2.
- The kid sibship bar in `block-family.ts` spans `min(childAnchorX, kid Xs)` to `max(childAnchorX, kid Xs)` so a one-kid sibship at depth ≥ 2 still draws a horizontal segment from the Tie's drop over to the kid's leg.
