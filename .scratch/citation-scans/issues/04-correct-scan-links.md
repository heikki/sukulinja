Status: ready-for-agent

# Correct a scan link in the app

Part of `../PRD.md`. Needs 03.

## What

- Each scan link has a "Wrong image?" control taking an image number or a
  pasted Astia viewer URL (its `fileId` gives the image).
- `POST /d/<slug>/api/citations/<id>/scans` with `{ volumeId, image }` saves
  an anchor — the cited page on that image — to `anchors.local.json` in the
  data folder, then returns the re-resolved scans.
- Placement reads the shipped anchors with the local ones merged over them,
  in the app and in the script.

## Done when

- A correction moves that citation's link at once, and other citations of
  the same volume pick it up on their next resolve.
- Corrections survive restarts and re-imports.
