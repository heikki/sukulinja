Status: needs-triage

# Cite an entry from the Scan viewer, and delete one made there

Spec: `../spec.md` (decided 2026-10-22). Glossary: **Citation**, **Scan viewer**, **Box**, **Mark**, **Vision match**, **Estimated**.

## Do

- **Cite this entry for**, in the scan's right-click menu (`scan-viewer/menu.ts`), beside _Mark entry_, only over the full Image (`canBox`). It lists:
  - the Selected person, then their parents, siblings, spouses and children, each named with how they're related;
  - _Someone else…_, which opens the person search (`sl-person-search`, from the tree view).
  - Left out, of both: anyone whose Citation already links the Image shown, Marked, Vision match or Estimated: the people listed beside the scan. With nobody left in the family, only _Someone else…_ shows.
- **Picking a person** places a pending Box where the menu was opened, as _Mark entry_ does, and the nav ends with Cancel / Save. While it's pending, a one-line text field, empty, takes what the entry is (e.g. "Baptism 12.3.1795").
- **Save** creates the Citation: `POST /d/<slug>/api/persons/:id/citations` with `{ volumeId, image, fileId, box, text? }` (720ce9e), which answers 201 with the row as the Scan viewer lists it, or 400 with why not. The new Citation shows beside the scan with the Image's Marked rows, and the viewer stays where it was.
- **A way out while it's pending** asks to save first, as for a Mark's pending Box.
- **Delete citation:** on the Box of a Citation made in the app, the Box menu offers _Edit mark_ and _Delete citation_ instead of _Discard mark_. Delete asks to confirm, then removes it: `DELETE /d/<slug>/api/citations/:id` (720ce9e). A row made in the app says `citation.madeInApp`.
- **Edit mark** on its Box needs a route of its own: a Citation made in the app has no Church-book reference, so the Mark and Discard routes (`…/citations/:id/scans`) answer 404 for it.

## Tests

- The menu's people: the family in order, those already citing the Image left out, and _Someone else…_ alone when the family's all left out.
- Saving with and without text; Cancel leaves nothing.
- _Delete citation_ shows only on a Citation made in the app, and asks first.

## Not here

- The person panel (03).
