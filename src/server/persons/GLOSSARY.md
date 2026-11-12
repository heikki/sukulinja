# Tree

The people of a dataset and the families that join them, now that the tree is worked on in the app (ADR-0021): added, linked, changed, taken out of a family and deleted from a card's menu, or as a new relative in the Scan viewer's and Photo viewer's picker. Spec: `.scratch/add-people/spec.md`.

## Language

**Person**:
One `INDI` record: a name (given names and surname; one for now), a sex (`M`, `F`, `X` or `U`, GEDCOM 7's), a `UID` that says who they are across files (ADR-0013), and an xref no import gave when the app made them. Everyone is in a place in the **Tree**, but a new dataset's first person.
_Avoid_: individual, member, entry (an Entry is in a church book).

**Family**:
One `FAM` record: up to two parents and the children in it. Its first parent is its husband, the second its wife, whatever their sex, as entered (GEDCOM 7 allows two of the same). A family left with no one in it goes; one left with one person stays.
_Avoid_: household (the person panel's list of a person's family), marriage (a **Fact** of a family).

**Relative**:
Someone put in place as a person's father, mother, spouse, child or sibling, the words the card menu and the picker use: a parent goes into the family the person is a child in, a spouse starts a new family with them, a child goes into one of their families, a sibling into their parents'. A new person, or someone already in the tree **linked** there.
_Avoid_: kin, connection.

**Link**:
Someone already in the tree put in place as a person's relative, in place of a new person: what _Is it one of these?_ offers when the name typed is like someone's.
_Avoid_: merge (two people found to be one are merged, a later feature).

**Unlink**:
A person taken out of a family, as a child or as a parent, they themself staying in the tree: _Remove as child of …_, _Remove as spouse of …_ in a card's menu.
_Avoid_: detach, remove (alone; a person removed is **deleted**).

**Cut**:
What a deletion or an **Unlink** would do if it left someone no longer connected, through families, to those they were connected to: the tree in two. One that would cut isn't in the menu, with no word why, and the server refuses it; the way out is from the outside in. A part already unconnected before doesn't count.
_Avoid_: orphan, disconnect.

**Nearest relative**:
Whom the chart moves to when the person it's on is deleted: a parent, else a spouse, else a child. The last person in a dataset can't be deleted.

**Child order**:
A family's children in the order they were born, by their birth date, or baptism when there's none, else as they were added. Only the child added, or whose date changed, moves, so an imported order stays.
_Avoid_: sort order (the column it's kept in).

**New dataset**:
A dataset started from its first person, beside an import, who the chart starts from; everyone after them is a **Relative**.
