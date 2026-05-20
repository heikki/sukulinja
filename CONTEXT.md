# Sukulinja

A desktop genealogy viewer that renders an **Hourglass chart** centered on a chosen person, with ancestors fanning up and descendants fanning down. This document defines the domain language used by the tree-view layout.

## Language

**Hourglass chart**:
The overall layout: a **Focus** with ancestors stacked above and descendants stacked below. Name is historical — multi-spouse fans and lateral relatives can widen any row.
_Avoid_: Bowtie chart, kinship chart, pedigree chart.

**Focus**:
The single person the chart is built around. Ancestors expand upward, descendants downward.
_Avoid_: Proband, ego, root, center person.

### The three slabs

**Focus row**:
The horizontal row at Focus's **Generation** (Y = 0). Contains Focus + full **Siblings** + Focus's **Spouses** (joined by **Ties**) plus any **Half-sibling** sibships beside it.
_Avoid_: Center row, sibship row, generation row.

**Ancestor stack**:
The slab above the focus row. At depth 1 (Focus's parents): the bloodline **Ancestor**, that ancestor's non-Primary spouses (rendered as **Couples**), full siblings (**Aunts/Uncles**), and **Half-siblings** of Focus (children of the non-Primary Couples, rendered at Focus row). At depth ≥ 2: the bloodline pair only — no step-spouses, no Aunts/Uncles, no half-relatives. Lateral context is concentrated entirely in depth 1; depth ≥ 2 is a pure bloodline pyramid. Bounded by **Generation limit**.
_Avoid_: Ascendancy, pedigree, ancestor tree (that's a recursive unit).

**Descendant stack**:
The slab below the focus row. Bloodline **Descendants** and each of their spouses (**Couples**), down to **Generation limit**.
_Avoid_: Descendancy, descendant tree (that's a recursive unit).

### Relatives

**Sibling**:
Another child in the same **Family**. Children of one Family are always full siblings; cross-Family is a **Half-sibling**.

**Half-sibling**:
Shares exactly one parent with **Focus**. Rendered at Focus's row, hanging from the non-Primary **Child anchor** of the corresponding parent-Couple (directly under the step-parent). Only Focus's own half-siblings render; half-aunts/uncles (children of step-fams at depth ≥ 2) are not rendered.

**Spouse**:
A partner in a **Family**. Rendered (forming a **Couple** joined by a **Tie**) when paired with Focus, a bloodline Ancestor, or a bloodline Descendant. Lateral relatives' spouses are not rendered. Multiple spouses fan outward in chronological order — see **Primary spouse**.
_Avoid_: Partner (this codebase models marriage only).

**Aunt/Uncle**:
A full **Sibling** of Focus's **Father** or **Mother**. Rendered alongside the bloodline parent in the depth-1 childhood FB sibship. Siblings of deeper bloodline ancestors (great-aunts/uncles and beyond) are not rendered.
_Avoid_: Treating them as ancestors — they're collaterals.

**Ancestor**:
A blood ascendant of Focus. Each has two bloodline parents above; the chart recurses through them.

### Layout rules

**Husband-left convention**:
Husband on the left, wife on the right in every **Couple**. With multiple spouses, the shared partner sits at one end (left if husband, right if wife); marriages fan outward in chronological order with the **Primary spouse** adjacent.

**Primary spouse**:
The spouse rendered adjacent to its partner when multiple spouses exist; other marriages fan outward in chronological order. The selection rule depends on context — for an **Ancestor** it's the bloodline partner; for Focus and Descendants it's the most recent marriage. Pure layout role.

**Child anchor**:
The point a **Drop** to children originates. Primary marriage (or single-marriage **Couple**): **Tie** midpoint. Non-Primary marriage: bottom edge of the non-shared parent's box. Lone parent: bottom edge of their box.

**Focus pinning**:
Focus's column sits at chart X = 0. With uneven ancestry, the ancestor pyramid drifts left or right of Focus rather than re-centering. Everything above Focus is positioned by propagation; Focus itself is the only fixed point.

**Bloodline pyramid**:
Each ancestor **Couple** sits centered between its two parent Couples above (or, when one is missing, above its lone parent). Geometry is _locally symmetric_ (every Couple centered over its child Couple below) but _globally lopsided_ when one branch has more laterals or step-fams than the other. Spouse separation inside every Couple — including the chart-root parent FB — stays fixed at one COUPLE_PITCH; subtree extents grow outward (away from chart center), never inward past the Tie midpoint.

**Aunts/Uncles placement**:
At depth 1, **Aunts/Uncles** share the childhood FB sibship with their bloodline sibling (Father or Mother). The bloodline sibling sits at the _inward_ end of the sibship (Father at the rightmost slot of his sibship, Mother at the leftmost slot of hers); Aunts/Uncles fan outward in birth order. The slot widens to fit them — driving the parent FB Tie outward and propagating up.

**Step-fam fan**:
Non-Primary marriages of a bloodline **Ancestor** render at depth 1 only (Fa's and Mo's). Depth ≥ 2 ancestors show their bloodline Couple only — earlier or later marriages are hidden. At depth 1, all chronologically-pre-bloodline marriages render _outside the left edge_ of the bloodline footprint (Fa + Mo + their kid sibship), and all chronologically-post-bloodline marriages render _outside the right edge_. Same hand-off rule applies to both Fa's and Mo's marriages — so Fa's later wives and Mo's later husbands both pile up on the chart's right margin (in chronological order, each one further out). The chart-root parent FB sep stays at COUPLE_PITCH.

### Structures

**Family**:
A nuclear unit: (optional) husband + (optional) wife + zero or more children. A person is a child in at most one Family and a spouse in zero or more.

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

### Vertical structure

**Generation**:
A horizontal row. Focus row is generation 0; above are 1↑, 2↑, …; below are 1↓, 2↓, ….

**Depth**:
Generations away from the focus row at the current recursion step. Always ≥ 0; direction (↑ vs ↓) is implicit.

**Generation limit**:
The maximum **Depth** rendered in each direction. Beyond it, the sub-layout becomes a single box.

## Rendering scope

- **Focus** + Focus's full **Siblings** + Focus's **Spouses**.
- Focus's bloodline **Ancestors** at every depth; depth ≥ 2 shows only the bloodline pair.
- At depth 1 (Focus's parents): Fa/Mo's non-Primary spouses (each as a **Couple**), Fa/Mo's full siblings (**Aunts/Uncles**), and Focus's **Half-siblings** (children of those non-Primary Couples) at Focus row.
- Focus's bloodline **Descendants** + each descendant's spouses.

**Not** rendered: spouses or children of lateral relatives (no in-laws, no nieces/nephews, no cousins). Above depth 1 in the ancestor stack, even step-spouses and full siblings of bloodline ancestors are hidden.

Rule of thumb: Focus's bloodline up and down, with one ring of lateral context **at depth 1 only** of the ancestor stack. Above that, only the bloodline pair per generation.

## Flagged ambiguities

- **"Tree"** is overloaded between recursive data structures (**Ancestor tree** / **Descendant tree**) and slabs (**Ancestor stack** / **Descendant stack**). Disambiguate by adjective.
- A **Family** is one record but takes two roles relative to any person: the family they are a child in vs. one of the families they are a spouse in. Roles, not separate kinds.
