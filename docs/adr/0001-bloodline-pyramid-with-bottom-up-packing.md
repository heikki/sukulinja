# Bloodline pyramid with bar-midpoint-aligned Ties

The ancestor layout positions each bloodline **Couple** directly above its kid sibship's **Bar** midpoint, with the two spouses straddling that midpoint at ± HALF*PITCH. The parent **Drop** is always vertical (no L-bend ever). **Focus** is pinned at chart X = 0; the pyramid drifts left or right of Focus rather than re-centering. Within every Couple, spouse separation stays fixed at one COUPLE_PITCH and subtree extents grow strictly \_outward* from chart center.

This replaces the previous designs (the original `kidOffset = 2*kidOffset + sign*HALF_PITCH` doubling tilt, and an intermediate "Tie at chart-X = 2 \* ancestorChartX" symmetric pyramid). The doubling tilt produced bloodline-column collisions at depth ≥ 4. The symmetric-pyramid variant fixed the collisions but produced wide L-bends at depth 1 once Aunts/Uncles widened the sibship: Pekka+Hilma sat at chart -318, -106 while Otto's full sibship spanned to chart -1166, so the drop bent ~530px sideways before reaching the bar.

The bar-midpoint rule keeps the drop vertical at every depth, at the cost of giving up "Tie at 2 \* ancestorChartX". Adjacent ancestor couples drift outward by HALF_PITCH per generation when sibships are wide, and at depth ≥ 3 the inner spouse of an outer ancestor can collide with the outer spouse of an inner ancestor. For the current default `levels = 2`, those depths are not rendered.

## Considered options

- **Tie at chart-X = 2 \* ancestorChartX** (symmetric pyramid). Rejected: produces long L-bends at depth 1 with Aunts/Uncles; the kink looks like a drafting error.
- **Sep grows freely.** Each Couple's Tie stretches to fit inner subtree extents. Rejected: long Ties look awkward and erase the visual "couple" tightness.
- **Top-down rigid grid** (power-of-two spacing per generation, lateral overflow tolerated). Rejected: laterals at depth 1 force the grid wider than needed everywhere above.
- **Keep the doubling tilt, accept overlap.** Rejected: the overlap was the original bug.

## Consequences

- `kidOffset` is derived from the sibship's bar midpoint, not parameterized per generation. The `2*kidOffset + sign*HALF_PITCH` formula is gone.
- `buildChildhoodFamily` builds kids first, computes `barMidFBlocal`, then recurses into the GGP couple with `husbandChartX = ancestorChartX + barMidFBlocal - HALF_PITCH` (and `+ HALF_PITCH` for the wife).
- The chart-root parent FB is unaffected — focus + siblings pack such that the bar midpoint equals the parent Tie X by construction.
- At depth ≥ 3 with sibship width > one COUPLE_PITCH, adjacent ancestor couples' inner-vs-outer spouses can land in the same chart column. Out of scope at `levels = 2`; revisit when deeper levels are exposed.
