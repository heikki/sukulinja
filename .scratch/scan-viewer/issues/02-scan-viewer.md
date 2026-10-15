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
- The header shows the person's name, the Church-book reference (parish,
  Book, page), the Volume label, "Image N of M", the Scan method, and "Open
  in Astia ↗" (the viewer URL of the shown Image, opened in the browser). A
  side caption shows the MyHeritage transcription (`RecordView`). It is open
  by default, and its state is kept in an `sl-scan-caption` cookie.
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
- Closing and reopening the app keeps the caption's open/closed state.
