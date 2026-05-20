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
The slab above the focus row. At each generation: the bloodline **Ancestor**, that ancestor's spouses (**Couples**), full siblings (**Aunts/Uncles**), and children of non-bloodline Couples (**Half-siblings** at parent gen, half-aunts/uncles deeper). Bounded by **Generation limit**.
_Avoid_: Ascendancy, pedigree, ancestor tree (that's a recursive unit).

**Descendant stack**:
The slab below the focus row. Bloodline **Descendants** and each of their spouses (**Couples**), down to **Generation limit**.
_Avoid_: Descendancy, descendant tree (that's a recursive unit).

### Relatives

**Sibling**:
Another child in the same **Family**. Children of one Family are always full siblings; cross-Family is a **Half-sibling**.

**Half-sibling**:
Shares exactly one parent with **Focus**. Rendered at Focus's row, hanging from the non-Primary **Child anchor** of the corresponding parent-Couple (directly under the step-parent).

**Spouse**:
A partner in a **Family**. Rendered (forming a **Couple** joined by a **Tie**) when paired with Focus, a bloodline Ancestor, or a bloodline Descendant. Lateral relatives' spouses are not rendered. Multiple spouses fan outward in chronological order — see **Primary spouse**.
_Avoid_: Partner (this codebase models marriage only).

**Aunt/Uncle**:
A full **Sibling** of an **Ancestor**. Rendered alongside the bloodline ancestor in the same sibship.
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

### Structures

**Family**:
A nuclear unit: (optional) husband + (optional) wife + zero or more children. A person is a child in at most one Family and a spouse in zero or more.

**Couple**:
A spouse pair drawn side-by-side, joined by a horizontal **Tie**. With only one party known, degenerates to a single person with no Tie.

**Ancestor tree**:
The bloodline ancestry above a person, plus one ring of lateral context per generation (Aunts/Uncles, step-spouses, Half-siblings). Recurses upward through the bloodline only. Bounded by **Generation limit**.
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
- Focus's bloodline **Ancestors** at every depth + each ancestor's spouses + each ancestor's full siblings (**Aunts/Uncles**).
- Children of non-bloodline Couples at every ancestor generation — Focus's **Half-siblings** at parent gen; half-aunts/uncles deeper.
- Focus's bloodline **Descendants** + each descendant's spouses.

**Not** rendered: spouses or children of lateral relatives (no in-laws, no nieces/nephews, no cousins).

Rule of thumb: Focus's bloodline up and down, plus one ring of lateral context per generation, no further expansion off the laterals.

## Flagged ambiguities

- **"Tree"** is overloaded between recursive data structures (**Ancestor tree** / **Descendant tree**) and slabs (**Ancestor stack** / **Descendant stack**). Disambiguate by adjective.
- A **Family** is one record but takes two roles relative to any person: the family they are a child in vs. one of the families they are a spouse in. Roles, not separate kinds.
