Status: ready-for-agent
Blocked by: none

# Move a person to other parents, or another spouse

Spec: `.scratch/add-people/spec.md`. Heikki, 2026-11-12: there's no way yet to move a child linked to the wrong parents. Linking refuses a second parent family, and an unlink on its own would cut the tree.

A card's menu gets _Move to other parents…_. It opens the person search used for linking. Pick the new father or mother; if they have more than one family, pick which one ("with Liisa Malli", as in Add child). Saving moves the child there in one go: out of their old family (which goes if left empty, as in 05) and into the new one, placed by birth date (04). _Move to another spouse…_ works the same way for a spouse, and is used less often.

- One server call and one transaction. The check that nothing cuts the tree in two (`src/common/tree-cut.ts`) is judged on the result, not on the step in between. Moving to parents already in the tree keeps it whole, so it's allowed.
- No moving into the family the person is in already, nor under their own descendants.
- One `person` Change on the person (`did: 'move'`, relation, of the new family's people): "Moved as child · of …".
- CHAN of the person and of both families.

Tests: a child moved from one family to another ends up in the new one in birth order, with no cut refused; an emptied old family goes; a move under their own descendant is refused; one Change.
