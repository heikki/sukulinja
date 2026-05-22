# Sukulinja

A desktop genealogy viewer that renders an **Hourglass chart** centered on a chosen person, with ancestors fanning up and descendants fanning down. This document defines the domain language used by the tree-view layout.

## Language

**Hourglass chart**:
The overall layout: a **Focus** with ancestors stacked above and descendants stacked below. Name is historical — multi-spouse fans and lateral relatives can widen any row.
_Avoid_: Bowtie chart, kinship chart, pedigree chart.

**Focus**:
The single person the chart is built around. Ancestors expand upward, descendants downward.
_Avoid_: Proband, ego, root, center person.

### Horizontal regions

**Focus row**:
The horizontal row at Focus's **Generation** (Y = 0). Contains Focus + full **Siblings** (each with their first marriage's spouse if any) + Focus's **Spouses** (joined by **Ties**) plus any **Half-sibling** sibships beside it.
_Avoid_: Center row, sibship row, generation row.

**Parent row**:
The depth-1 row, just above Focus row. The only row with full lateral context — Fa/Mo's non-Primary spouses (rendered as **Couples**) and **Aunts/Uncles** appear here alongside the bloodline Father and Mother. The **Bloodline footprint** is anchored at this row.
_Avoid_: Depth-1 row, parental row.

**Ancestor stack**:
The slab above Parent row, containing only the bloodline Ancestor pair at each depth (depth ≥ 2). No step-spouses, no **Aunts/Uncles**, no half-relatives — pure bloodline (ADR-0002). Bounded by **Generation limit**.
_Avoid_: Ascendancy, pedigree, ancestor tree (that's a recursive unit).

**Descendant stack**:
The slab below Focus row. Bloodline **Descendants** and each of their spouses (**Couples**), down to **Generation limit**.
_Avoid_: Descendancy, descendant tree (that's a recursive unit).

### Relatives

**Sibling**:
Another child in the same **Family**. Children of one Family are always full siblings; cross-Family is a **Half-sibling**.

**Half-sibling**:
Shares exactly one parent with **Focus**. Rendered at Focus's row, hanging from the non-Primary **Child anchor** of the corresponding parent-Couple (directly under the step-parent). Only Focus's own half-siblings render; half-aunts/uncles (children of step-fams that would belong above **Parent row**) are not rendered.

**Spouse**:
A partner in a **Family**. Rendered (forming a **Couple** joined by a **Tie**) when paired with Focus, a bloodline Ancestor, a bloodline Descendant, or a full **Sibling** of Focus. A Sibling renders only their first meaningful marriage's spouse (no kids); Focus and Descendants render every meaningful marriage. **Aunts/Uncles** do not render any spouses. Multiple spouses fan outward in chronological order — see **Primary spouse**.
_Avoid_: Partner (this codebase models marriage only).

**Aunt/Uncle**:
A full **Sibling** of Focus's **Father** or **Mother**. Rendered alongside the bloodline parent at **Parent row** (in Fa or Mo's childhood FB sibship). Siblings of deeper bloodline ancestors (great-aunts/uncles and beyond) are not rendered.
_Avoid_: Treating them as ancestors — they're collaterals.

**Ancestor**:
A blood ascendant of Focus. Each has two bloodline parents above; the chart recurses through them.

### Layout rules

**Husband-left convention**:
Husband on the left, wife on the right in every **Couple**. With multiple spouses, the shared partner sits at one end (left if husband, right if wife); marriages fan outward in chronological order with the **Primary spouse** adjacent. Exception: non-Primary step-spouses at **Parent row** (the **Step-fam fan**) sit on the bloodline parent's own side regardless of sex, so the convention can be violated there. The **Tie** endpoints adapt by X order, not by husband/wife role.

**Primary spouse**:
The spouse rendered adjacent to its partner when multiple spouses exist; other marriages fan outward in chronological order. The selection rule depends on context — for an **Ancestor** it's the bloodline partner; for Focus and Descendants it's the most recent marriage. Pure layout role.

**Child anchor**:
The point a **Drop** to children originates. Primary marriage (or single-marriage **Couple**): **Tie** midpoint. Non-Primary marriage: bottom edge of the non-shared parent's box. Lone parent: bottom edge of their box.

**Focus pinning**:
Focus's column sits at chart X = 0. With uneven ancestry, the ancestor pyramid drifts left or right of Focus rather than re-centering. Everything above Focus is positioned by propagation; Focus itself is the only fixed point.

**Bloodline pyramid**:
Every parent **Drop** is purely vertical — never an L-bend. For every kid sibship at **Parent row** or above (including Parent row itself, where the sibship widens with **Aunts/Uncles**), the Tie sits off the bloodline kid's column in the direction set by the kid's sex — male ancestor's parents fan to his left, female's to her right. The kid **Bar** runs horizontally from the Tie X over to the bloodline kid's column; the bar — not the drop — does the horizontal work. The chart-root parent FB above Focus row is a separate case: its Tie sits centered, because **Focus pinning** fixes Focus at chart X = 0.

The shift magnitude grows with how many more levels are rendered above: HALF_PITCH at the topmost ancestor row, 3 × HALF_PITCH one level lower, 7 × HALF_PITCH two levels lower — the (2^n − 1) sequence. This places each Couple as close to chart center as the inter-couple spacing allows, keeps each Couple's great-grandparents centered around the Couple itself, and gives the upper pyramid enough room to keep gen+1 columns distinct.

Spouse separation inside every Couple — including the chart-root parent FB — stays fixed at one COUPLE_PITCH; subtree extents grow outward (away from chart center).

**Aunts/Uncles placement**:
At **Parent row**, **Aunts/Uncles** share the childhood FB sibship with their bloodline sibling (Father or Mother). The bloodline sibling sits at the _inward_ end of the sibship (Father at the rightmost slot of his sibship, Mother at the leftmost slot of hers); Aunts/Uncles fan outward in birth order, pushed past the **Step-fam fan** reservation so step-spouses and **Half-siblings** of Focus fit between the bloodline parent and the Aunts/Uncles. The GP couple's Tie position (see **Bloodline pyramid**) is independent of the sibship width — the bar reaches out to whichever Aunt/Uncle sits farthest from the Tie.

**Bloodline footprint**:
The chart frame anchoring the chart-root parent FB at **Parent row**: where Fa and Mo sit (their chart-X positions) and how far the bloodline's own rows reach left and right — the union of Focus's sibship at Focus row and Fa/Mo's own boxes at Parent row (_not_ Aunts/Uncles, which get pushed out past the footprint). **Aunts/Uncles** and the **Step-fam fan** sit past the outer edge on each side, so the footprint is what they must clear.

**Step-fam fan**:
Non-Primary marriages of a bloodline **Ancestor** render at **Parent row** only (Fa's and Mo's). Ancestors above Parent row show their bloodline Couple only — earlier or later marriages are hidden. At Parent row, each parent's non-Primary marriages fan outward on that parent's own side of the chart-root parent FB — Fa's pile up past the bloodline footprint's left edge, Mo's pile up past the right edge — regardless of whether each marriage is chronologically pre- or post-bloodline. Within each side, chronologically-adjacent marriages (one step before or after the bloodline marriage) land closest to the parent, and progressively-distant marriages fan further outward. The chart-root parent FB sep stays at COUPLE_PITCH.

### Structures

**Family**:
A nuclear unit: (optional) husband + (optional) wife + zero or more children. A person is a child in at most one Family and a spouse in zero or more.

**Sibship**:
The row of children of one **Family** — full **Siblings** of each other. The horizontal layout unit between the parent **Tie**/**Drop** above and each child's **Leg** below; the **Bar** spans the row.

**Couple**:
A spouse pair drawn side-by-side, joined by a horizontal **Tie**. With only one party known, degenerates to a single person with no Tie.

**Ancestor tree**:
The bloodline ancestry above a person. At depth 1, includes lateral context (Aunts/Uncles, step-spouses, Half-siblings of Focus); at depth ≥ 2, the bloodline pair only. Recurses upward through the bloodline only. Bounded by **Generation limit**.
_Avoid_: Ancestor branch (it's a tree), ancestor line.

**Descendant tree**:
A person + each of their spouses (Couples) + each child's Descendant tree. Bounded by **Generation limit**.

### Connectors

**Tie**:
Horizontal segment between husband and wife inside a **Couple**, at row-center Y.

**Drop**:
Vertical line from the **Child anchor** down to the **Bar**. Top of the drop/bar/leg trio.

**Bar**:
Horizontal line spanning the sibship between two generations. Collapses to a point with a single child.

**Leg**:
Short vertical from the **Bar** to one sibling's box top. One per sibling.

### Layout units

**Slot**:
The unit of horizontal position. One slot = the distance between adults in a **Couple** (= COUPLE_PITCH; half-slot = HALF_PITCH). Each person occupies a slot footprint 1 slot wide, with implicit half-gap padding on each side; adjacent slots share their padding, so the visible gap between adjacent boxes is one full gap composed of half-padding from each neighbour. Horizontal layout reasons in slot units only — gap pixel values never appear in the layout algorithm; they're folded into the slot's footprint. Pixel resolution happens at the render seam.

**Generation**:
The unit of vertical position — a horizontal row. Focus row is generation 0; above are 1↑, 2↑, …; below are 1↓, 2↓, ….

**Depth**:
Generations away from the focus row at the current recursion step. Always ≥ 0; direction (↑ vs ↓) is implicit.

**Generation limit**:
The maximum **Depth** rendered in each direction. Beyond it, the sub-layout becomes a single box.

## Rendering scope

- **Focus row**: Focus + full **Siblings** (each with their first marriage's spouse, no kids) + Focus's **Spouses** + Focus's **Half-siblings** (hanging from step-fam Couples at Parent row).
- **Parent row**: Fa and Mo, their non-Primary spouses (each as a **Couple**), and their full siblings (**Aunts/Uncles**).
- **Ancestor stack**: the bloodline Couple at each depth — no laterals.
- **Descendant stack**: bloodline **Descendants** + each descendant's spouses.

**Not** rendered: children of lateral relatives (no nieces/nephews, no cousins), spouses of **Aunts/Uncles**, second/third marriages of full Siblings, or any step-spouses / lateral siblings above Parent row.

Rule of thumb: Focus's bloodline up and down, with one ring of lateral context at **Parent row** only.

## Flagged ambiguities

- **"Tree"** is overloaded between recursive data structures (**Ancestor tree** / **Descendant tree**) and chart regions (**Ancestor stack** / **Descendant stack**). Disambiguate by adjective.
- A **Family** is one record but takes two roles relative to any person: the family they are a child in vs. one of the families they are a spouse in. Roles, not separate kinds.
- **Depth** is a count from Focus row in the recursion; **Parent row** / **Ancestor stack** / **Descendant stack** name spatial regions. Parent row is depth 1; the Ancestor stack starts at depth 2.
