Status: needs-triage

# Shrink ancestor shift when one grandparent subtree is empty

## Symptom

At `gen=5` on a focus person whose paternal line goes 4 deep while the maternal line is empty, the paternal grandparents land ~3.5 slots to the left of the father, far outside the column above him. With nothing on the maternal side to balance the offset, the whole paternal pyramid hangs out to the left.

## Why it happens (ADR-0001 math)

`buildAncestorStack` uses `ancestorShift(kidSex, kidDepth, effectiveLevels)` with magnitude `(2^remainingAbove − 1) / 2`. `effectiveLevels` is `actualMaxAncestorDepth` across the whole chart (the global max), not the depth of the specific grandparent subtree being placed.

For the repro chart:

- `ancestorLevels = 4` (focus → father → paternal grandfather → paternal great-grandfather).
- At `kidDepth=1`, `remainingAbove = 3`, magnitude = `(2^3 − 1)/2 = 3.5` slots.
- Father is male, so the paternal grandparent tie sits at chartX `father − 3.5`. Paternal grandfather ends up 4 slots left of father, paternal grandmother 3 slots left.

The pyramid is sized for a hypothetical balanced 4-deep tree, even though the maternal branch is empty. Net effect: visually unbalanced layouts whenever ancestry is lopsided.

## Options to evaluate

1. **Per-subtree levels.** Compute `effectiveLevels` from this side's own depth inside `buildAncestorPersonAtParentRow` / `buildAncestorStack`, not the chart-wide max. Filled side keeps its current spread; empty side tucks in.
2. **Empty-sibling collapse.** When one of the two grandparent subtrees is empty (or much shallower), shrink magnitude so the filled side doesn't reserve space that will never be used.

Either changes the chart-X of many ancestor boxes — check downstream consumers (e.g. step-fam fan, focus-row footprint clearance) before picking.

## Repro

1. Open `/d/ylonen/#/person/1177?gen=5` on the local dev server (focus person with 4-deep paternal ancestry and an empty maternal side).
2. Observe the paternal great-grandparents at chartX ≈ −4.5 and ≈ −3.5 vs. the father at chartX ≈ −0.5.
