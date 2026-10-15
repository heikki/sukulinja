Status: ready-for-agent

# Volume switcher, and Find the image

Part of `../PRD.md`. Needs 02 (and 03 for marking in another Volume).

## What

- `GET /d/<slug>/api/citations/<id>/volumes` (added in 03 for the mark's
  hint) lists the parish's Volumes from `parishVolumes` with id, label and
  whether the reference links it. Add Book kind, years and image count, and
  keep to the digitized ones.
- The viewer's Volume switcher lists them grouped by Book kind and sorted
  by years, with the linked Volumes first and marked.
- A switched-to Volume opens on the reference's Image if the reference
  links that Volume, otherwise on Image 1. Going back to a Volume returns
  to the Image you left it on.
- A reference that resolved to `no matching volume`, `not digitized` or
  `no images` shows "Find the image" in the panel. It opens the viewer on
  the switcher with no Volume chosen. A reference whose parish has no
  archive, or that wouldn't parse, shows no link.

## Done when

- A rippikirja reference whose record is in a lastenkirja of the same
  parish can be placed from the viewer, and the Placement survives a
  re-import.
- A reference with `no matching volume` can be placed.
