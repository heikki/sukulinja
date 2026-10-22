Status: needs-triage

Blocked by: 01

# Cite an entry from the Scan viewer, and delete one made there

Spec: `../spec.md` (decided 2026-10-22). Glossary: **Citation**, **Scan viewer**, **Box**, **Mark**, **Vision match**, **Estimated**.

## Do

- **Cite this entry for**, in the scan's right-click menu (`scan-viewer/menu.ts`), beside _Mark entry_, only over the full Image (`canBox`). It lists:
  - the Selected person, then their parents, siblings, spouses and children, each named with how they're related;
  - _Someone else…_, which opens the person search (`sl-person-search`, from the tree view).
  - Left out, of both: anyone whose Citation already links the Image shown, Marked, Vision match or Estimated: the people listed beside the scan. With nobody left in the family, only _Someone else…_ shows.
- **Picking a person** places a pending Box where the menu was opened, as _Mark entry_ does, and the nav ends with Cancel / Save. While it's pending, a one-line text field, empty, takes what the entry is (e.g. "Baptism 12.3.1795").
- **Save** creates the Citation (01). The new Citation shows beside the scan with the Image's Marked rows, and the viewer stays where it was.
- **A way out while it's pending** asks to save first, as for a Mark's pending Box.
- **Delete citation:** on the Box of a Citation made in the app, the Box menu offers _Edit mark_ and _Delete citation_ instead of _Discard mark_. Delete asks to confirm, then removes it (01).

## Tests

- The menu's people: the family in order, those already citing the Image left out, and _Someone else…_ alone when the family's all left out.
- Saving with and without text; Cancel leaves nothing.
- _Delete citation_ shows only on a Citation made in the app, and asks first.

## Not here

- The person panel (03).
