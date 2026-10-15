Status: ready-for-agent

# The Scan viewer overlay, opened from the panel

Part of `../PRD.md`. Needs 01.

## What

- An `sl-scan-viewer` component over the chart, with the dock left visible.
  It shows one Image of a Volume through 01's route.
- Opens fitted to the window. Wheel or pinch zooms at the pointer, drag
  pans with momentum, double-click toggles fit / 100%, ←/→ step Images, Esc
  closes. `transform.ts` (`fitTo`, `zoomAt`) and `momentum.ts` move out of
  `tree-view/viewport/` to a shared place both use. `ViewportController`
  stays with the chart.
- Prev/next buttons and a typed image number, kept within 1..M.
- A one-row toolbar: ‹ Image N of M › (the Volume label as tooltip), the
  link's Scan method or "Back to the link (N)", "Open in Astia ↗" (the
  viewer URL of the shown Image, from `GET /astia/volumes/<id>/images`), and
  close.
- The dock marks the source being viewed and its active Scan link, scrolls
  it into view and opens its household; the viewer doesn't repeat the
  record.
- The panel's Scan links open the viewer instead of Astia. Anchored,
  Estimated and Placed links open on their Image, and a Volume link on
  Image 1. Each candidate of a Split reference opens on its own Volume.
- With the viewer open, another source's Scan link switches it to that
  reference, and refocusing closes it. The viewer stays out of the URL.
- An Image that fails to load shows "Image unavailable" with Retry.

## Done when

- The 12 spot-checked citations in `data/citation-scans-spotcheck.md` open
  on their verified Images.
- Stepping past either end of a Volume is impossible.
- The viewed source is marked in the dock, and only that one.
