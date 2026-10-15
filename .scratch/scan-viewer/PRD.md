Status: ready-for-agent

# Scan viewer

## Problem

A church-book source links to its Astia scan, but the link opens Astia's
site in the browser. Checking whether the link landed on the record means
leaving the app, and when it didn't, finding the right Image means stepping
through Astia's viewer, then typing its number or pasting its URL back into
the panel's "Wrong image?" prompt. Estimated links are often a few Images
off, so this happens a lot.

This reverses the citation-scans PRD's out-of-scope line "Showing the scan
inside the app".

## Goal

A **Scan viewer** in the app: a source's Scan link opens the Image over the
chart, where you can zoom, step through the Volume, switch to another Volume
of the parish, and mark the Image the record is on. Marking replaces the
text prompt.

## Decisions

- **An overlay over the chart, outside the URL.** The dock stays visible,
  so you can see whose source it is. An open viewer is a passing look, not a
  place, so it stays out of the hash (ADR-0004) and Back doesn't close it.
  Clicking another source's Scan link in the dock switches the viewer to
  that reference. Refocusing closes it.
- **Where it opens.** Anchored, Estimated and Placed links open on their
  Image, and a Volume link on Image 1. A Split reference has one link,
  "Astia (N Volumes)", opening its first candidate; the switcher lists the
  candidates first. A reference that resolved to no scan
  (`no matching volume`, `not digitized`, `no images`) gets "Find the
  image", which opens the viewer on the parish's Volumes with none chosen. A reference whose
  parish has no archive, or that wouldn't parse, gets no link.
- **Navigation.** Prev/next, a typed image number, and a Volume switcher
  listing every digitized Volume of the parish's population register. The
  list is grouped by Book kind and sorted by years, with the Volumes the
  reference links first and marked. A switched-to Volume opens on the
  reference's Image if it links that Volume, otherwise on Image 1. Going
  back to a Volume returns to where you were in it.
- **Zoom and pan.** Opens fitted to the window. Wheel or pinch zooms, drag
  pans with momentum, double-click toggles fit / 100%, ←/→ step Images, Esc
  closes. Reuses the chart's `transform` and `momentum` modules, moved
  somewhere shared. The chart's `ViewportController` is tied to the chart
  and stays there.
- **The record stays in the dock.** The source being viewed is marked
  there, scrolled into
  view, with its household open to compare against the page. The viewer
  doesn't repeat it: its toolbar is one row, ‹ Image N of M ›, the link's
  Scan method or "Back to the link", "The record is here" with what it
  will do, "Open in Astia ↗" for the shown Image, and close. The Volume
  label is the counter's tooltip.
- **Marking is the only correction.** "The record is here" goes through the
  existing `POST …/citations/<id>/scans`, so its rules don't change: when the
  reference has a page and the Volume is one it links, the mark saves an
  Anchor; otherwise it saves a Placement. A note beside the button says
  which: "Also moves nearby references in this Volume" or "Places only this
  record". The viewer stays open, and the button gives way to a ✓ and the
  link's method ("✓ Anchored link") when the shown Image is the link and
  its method is Placed or Anchored. An
  Estimated link is still offered, since marking turns it into an Anchor.
  The panel's "Wrong image?" / "Find the image" text prompt goes away, and
  so does pasting an Astia URL (the Volume switcher covers it).
- **No undo.** Marking the right Image replaces a wrong mark: a local Anchor
  replaces one on the same Image or the same page, and a Placement is one
  per record.
- **Images come through the local server.** Astia's `ws/getFile.php` serves
  full-size JPEGs (about 4 MB, around 7500×5900) and 250px thumbnails, with
  no login and with `no-store`. The server fetches them in their own lane,
  where the latest navigation goes first and stale prefetches are dropped.
  The current one-request-a-second gate stays for volume and image-list
  requests. Viewed Images go into a disk cache beside `.astia-cache`, shared
  by every dataset and capped by size, dropping the least-recently viewed
  first.
- **Loading.** A blurred, scaled-up thumbnail shows until the full Image
  arrives, and the Images on either side are prefetched. An Image that
  can't be fetched shows "Image unavailable" with Retry. Cached Images, and
  marking (which needs only the cached image list), work offline.
- **Scan cache is a setting.** The cap is a property of the install, so it
  is kept on the server in the data folder, beside `anchors.local.json`.
  Settings gets a Scan cache row with the space used, a size choice
  (1 / 2 / 5 / 10 GB, default 2 GB; a full Image is about 4 MB) and Clear.

## Slices

1. `issues/01-image-proxy.md`: Astia Images through the local server, cached.
2. `issues/02-scan-viewer.md`: the overlay, opened from the panel's Scan links.
3. `issues/03-mark-the-record.md`: marking in the viewer replaces the prompt.
4. `issues/04-volume-switcher.md`: other Volumes of the parish, and Find the image.
5. `issues/05-smooth-loading.md`: thumbnail placeholder and neighbour prefetch.
6. `issues/06-scan-cache-setting.md`: the cap in Settings, with used space and Clear.

Issues 4 and 5 need 2, 6 needs 1, and 3 needs 2. Otherwise they can go in
any order.

## Out of scope

- Browsing Astia without a Church-book reference to start from.
- Volumes outside the reference's parish.
- Astia's OCR, downloads and archive context: "Open in Astia ↗" covers
  these.
