# Bloodline pyramid with bottom-up packing

The ancestor layout positions each bloodline **Couple** at the midpoint of its two parent Couples one row up (or above its lone parent when one side is missing) — producing a locally-symmetric, globally-lopsided pyramid. **Focus** is pinned at chart X = 0; the pyramid drifts left or right of Focus rather than re-centering. Within every Couple, spouse separation stays fixed at one COUPLE_PITCH and subtree extents grow strictly _outward_ from chart center (never inward past the Tie midpoint). The kid's offset within its parents' Tie is **derived** by bottom-up packing of each ancestor PB's `leftWidth`/`rightWidth`, not parameterised per generation.

This replaces the previous design where `kidOffset` was passed down with a `2*kidOffset + sign*HALF_PITCH` doubling rule (`build-tree.ts`, before this ADR). The doubling rule kept bloodline ancestors on distinct columns for symmetric inputs but couldn't keep adjacent ancestor rows non-overlapping when subtree widths diverged — bloodline columns at depth ≥ 3 could collide under realistic data.

## Considered options

- **Sep grows freely.** Each Couple's Tie stretches to fit inner subtree extents. Rejected: long Ties look awkward and erase the visual "couple" tightness.
- **Top-down rigid grid** (power-of-two spacing per generation, lateral overflow tolerated). Rejected: laterals at depth 1 force the grid wider than needed everywhere above; uneven ancestry produces visible gaps.
- **Keep the doubling tilt, accept overlap.** Rejected: the overlap is the bug.

## Consequences

- `kidOffset` becomes a derived quantity computed by the packing pass, not a parameter passed into `buildChildhoodFamily`. The `2*kidOffset + sign*HALF_PITCH` formula is removed.
- Each ancestor PB's `leftWidth` and `rightWidth` are asymmetric — the outward side reflects the full subtree extent, the inward side is bounded close to BOX_W/2.
- The chart-root parent FB Tie sep stays at COUPLE_PITCH regardless of ancestry shape. Lopsidedness is absorbed entirely by `Fa.PB` / `Mo.PB` width differences.
