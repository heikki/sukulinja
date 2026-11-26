Status: done
Blocked by: 01

# The Entry pane says where the tree differs from the Entry

ADR-0037. One rule, in `src/common/` beside `entry-naming.ts`, tells where an Entry's people and the tree differ: a marriage's couple who aren't a family; a baptism's father or mother who isn't the child's in the tree, or a parent the tree gives the child not named. The tree-quality check "An Entry names the people the tree gives it" uses the same rule.

- The Entry pane shows each difference above its lines: "Matti and Kaisa aren't a couple in the tree", "The tree gives Juho another father".
- A marriage whose couple isn't a family gets no lines (no _Add Marriage_), its owner being none.
- Nothing is changed for it: Heikki puts another person in the Role, or leaves it empty, in the pane.
