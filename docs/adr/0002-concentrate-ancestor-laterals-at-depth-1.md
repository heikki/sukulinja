# Concentrate ancestor laterals at depth 1

All lateral context in the **Ancestor stack** — Aunts/Uncles, non-Primary spouses (step-fams), and Half-siblings — renders only at depth 1 (Focus's parents). Depth ≥ 2 ancestors render their bloodline Couple alone: no step-spouses, no full siblings, no half-relatives. This narrows the previous CONTEXT.md promise of "one ring of lateral context per generation" to "one ring at depth 1 only."

The change keeps the parts of the chart users actually use — your own parents' siblings, your half-siblings, your parents' other marriages — visible at full detail, and removes the upper-pyramid noise (great-great-uncles, a great-grandfather's third wife) that bloats charts without adding to the user's mental model. It also dovetails with the new bloodline pyramid (see ADR-0001): with no laterals at depth ≥ 2 the pyramid is genuinely pure recursion of `{bloodline Couple → two parent Couples}`, and the "outward-only subtree extent" rule is automatically satisfied above depth 1.

## Considered options

- **Laterals at every depth** (the old promise). Rejected: visually noisy, and the slot-stretching propagation at deep generations cascades width that nobody cares about.
- **Depth ≤ 2** (one extra ring). Rejected: still includes great-aunts/uncles and great-grandparents' step-fams, which most users don't recognise.
- **Step-spouses kept at every depth but kids hidden.** Rejected: lone step-spouse boxes without their context are confusing; users wonder who they are.

## Consequences

- At depth ≥ 2 the ancestor PB is the bloodline person + their childhood FB only. `buildAncestorPBWithStepFams` is called at depth 1 only; `buildPlainAncestorPB` covers all deeper gens.
- The depth-1 step-fam fan keeps its current behaviour: chronologically-pre-bloodline marriages outside the left edge of the bloodline footprint, post-bloodline outside the right edge (same hand-off rule applied to both Fa's and Mo's marriages — Fa's later wives and Mo's later husbands pile up on the chart's right margin in chronological order).
- The CONTEXT.md "rule of thumb" narrows to: bloodline up and down, with one ring of laterals _at depth 1 only_ in the Ancestor stack.
