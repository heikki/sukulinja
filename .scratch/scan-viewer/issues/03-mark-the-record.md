Status: ready-for-agent

# Mark the record in the viewer

Part of `../PRD.md`. Needs 02.

## What

- A "The record is here" button in the viewer's toolbar posts
  `{ volumeId, image }` for the shown Image to
  `POST /d/<slug>/api/citations/<id>/scans`. Its Anchor/Placement rules
  don't change.
- A note beside the button says what marking will do. When the reference
  has a page and the shown Volume is one it links (by its Book, not by an
  earlier Placement, as in `correctScan`), it reads "Also moves nearby
  references in this Volume". Otherwise it reads "Places only this record".
- The viewer stays open after marking. The panel takes the re-resolved
  scans and reloads the person's other references, as it does today. The
  button gives way to "✓ Anchored link" or "✓ Placed link" when the shown
  Image is the reference's link and its method is one of those. An
  Estimated link still offers the button.
- A rejection (`{ rejected }`) shows in the viewer.
- Remove the panel's "Wrong image?" / "Find the image" prompt and the
  pasted-URL correction: the `{ url }` form of `Correction`,
  `imageOfLink`, and `imageOfFile` if nothing else uses it.

## Done when

- Marking a different Image of an Estimated link's Volume moves that link
  and, on their next resolve, the other references near it in the Volume.
- Marking the right Image after a wrong one leaves only the right Anchor.
