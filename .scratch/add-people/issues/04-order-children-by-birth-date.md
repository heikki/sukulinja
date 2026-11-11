Status: ready-for-agent
Blocked by: 01, fact-editing 04

# Order children by birth date

Spec: `.scratch/add-people/spec.md`.

A family's children are ordered by birth date (or baptism date when there's no birth) when it's known, else in the order they were added. The order is written to `family_children.sort_order` when a child is added and when a child's birth or baptism date is added, changed or deleted (fact-editing). An imported order isn't rewritten until one of those happens.

Tests: a child added with an earlier birth goes before; one with no date goes last; changing a date moves the child.
