# Concentrate ancestor laterals at depth 1

All lateral context in the **Ancestor stack** — Aunts/Uncles, non-Primary spouses (step-fams), and Half-siblings — renders only at depth 1 (Focus's parents). Depth ≥ 2 ancestors render their bloodline Couple alone: no step-spouses, no full siblings, no half-relatives. This narrows the previous CONTEXT.md promise of "one ring of lateral context per generation" to "one ring at depth 1 only."

The change keeps the parts of the chart users actually use — your own parents' siblings, your half-siblings, your parents' other marriages — visible at full detail, and removes the upper-pyramid noise (great-great-uncles, a great-grandfather's third wife) that bloats charts without adding to the user's mental model. It also dovetails with the new bloodline pyramid (see ADR-0001): with no laterals at depth ≥ 2 the pyramid is genuinely pure recursion of `{bloodline Couple → two parent Couples}`, and the "outward-only subtree extent" rule is automatically satisfied above depth 1.

## Considered options

- **Laterals at every depth** (the old promise). Rejected: visually noisy, and the slot-stretching propagation at deep generations cascades width that nobody cares about.
- **Depth ≤ 2** (one extra ring). Rejected: still includes great-aunts/uncles and great-grandparents' step-fams, which most users don't recognise.
- **Step-spouses kept at every depth but kids hidden.** Rejected: lone step-spouse boxes without their context are confusing; users wonder who they are.

## Consequences

- At depth ≥ 2, an Ancestor's PB carries only the bloodline person and their childhood Family — no marriages slot, no step-fams, no full siblings. Step-fam construction lives only at depth 1.
- The depth-1 Step-fam fan places each parent's non-Primary marriages on that parent's own side of the chart-root parent FB: Fa's all sit past the bloodline footprint's left edge; Mo's all sit past its right edge. Chronology determines order within each side — chronologically-adjacent marriages land closest to the parent, more distant ones fan further out.
- The CONTEXT.md "rule of thumb" narrows to: bloodline up and down, with one ring of laterals _at depth 1 only_ in the Ancestor stack.
