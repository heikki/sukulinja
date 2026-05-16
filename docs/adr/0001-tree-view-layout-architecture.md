# Tree-view layout architecture

The hourglass chart in `src/client/components/tree-view/` composes from recursive **Sub-layouts** (per `docs/tree-view.html`). Each recursive unit — **AncestorTree**, **DescendantTree**, **Couple**, **Sibship**, **FocusRow** — returns `{ leftWidth, rightWidth, pivot, nodes, lines }` in local coordinates with its pivot at x=0, and composers stitch units together by shifting each by the delta needed to land its pivot at a target X. This matches the doc's vocabulary one-to-one and lets multi-spouse fans, aunts/uncles, and half-sibships compose without special-casing.

## Sibship orientation rule (load-bearing, asymmetric on purpose)

Two different rules apply at two different rows:

- **Focus row** uses **birth-order across the whole sibship**, with the Primary spouse inserted **adjacent to Focus** per the Husband-left convention. The sibship Bar spans from the leftmost to the rightmost full sibling and visually passes _behind_ any inserted spouse box (boxes render above the bar by z-order). This keeps Focus genealogically truthful (birth order) and visually centred (spouse adjacent) at the cost of one bar-crosses-box artefact.
- **Ancestor rows** use **bloodline person at the inner edge** of their sibship — Father at the right edge of his sibship (spouse-facing), Mother at the left edge of hers — with aunts/uncles fanning outward in birth order. Strict birth order across the whole row is _not_ preserved here.

The asymmetry exists because the two rows have different shapes: Focus row has one bloodline person flanked by siblings on both sides; ancestor rows have a Couple of two bloodline people each with their own sibship. Applying Focus's rule (a) recursively at ancestor rows produces visually unworkable layouts where the two sibship bars overlap and the central Couple gets sandwiched between non-bloodline siblings. The inner-edge rule keeps each sibship visually distinct and matches the canonical diagram in the doc.

## Why this is hard to reverse

The Sub-layout calculus is the **shape of every recursive call**: composers consume `{ leftWidth, rightWidth, pivot, nodes, lines }`. Switching to a cumulative-cursor model (the previous implementation's shape) or a constraint solver would mean rewriting every recursive unit. The sibship rule is similarly load-bearing: the inner-edge rule at ancestor rows decides where the bloodline person sits within their sub-tree's local coordinate system, which determines the sub-tree's `pivot`, which feeds upward into how the parent Couple aligns. Reversing it changes every ancestor-tree's pivot.

## Consequences

- Layouts can be wider than feels minimal — fanning aunts/uncles outward at every ancestor generation, plus multi-spouse Primary-then-fan, plus half-sib sibships beside the Focus row, all add to row width. The chart accepts width.
- The Focus row bar visually crosses spouse boxes when Focus has siblings on the spouse-facing side. This is intentional and mirrors how multi-spouse Ties cross intervening boxes in the complex diagram.
- Primary spouse ordering currently uses GEDCOM file order as a proxy for marriage chronology (no MARR-date data on the API). Swapping to a date-driven ordering is a one-line client change once the API exposes it — the layout doesn't care how the list is ordered, only what comes first.
