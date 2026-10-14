Status: ready-for-agent

# Correct a scan link in the app

Part of `../PRD.md`. Needs 03.

## What

- Each church-book source has a "Wrong image?" (or "Find the image")
  control taking an image number or a pasted Astia viewer URL (its `fileId`,
  from either of Astia's image lists, gives the image).
- `POST /d/<slug>/api/citations/<id>/scans` with `{ volumeId, image }` or
  `{ url }` saves an anchor — the cited page on that image — to
  `anchors.local.json` in the data folder when the image is in a volume the
  citation links; otherwise (no page, or another volume of the parish) it
  places the record itself in `placements.local.json`. It returns the
  re-resolved scans.
- Placement reads the shipped anchors with the local ones merged over them,
  in the app and in the script.

## Done when

- A correction moves that citation's link at once, and other citations of
  the same volume pick it up on their next resolve.
- Corrections survive restarts and re-imports.
