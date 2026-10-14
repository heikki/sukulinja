Status: ready-for-agent

# Astia scan links, resolved on demand

Part of `../PRD.md`. Needs 02.

## What

- The Astia client, parish table and page→image placement move from
  `scripts/map-citation-scans/` into `src/server/`; the script imports them.
  `anchors.json` ships with the app.
- `GET /d/<slug>/api/citations/<id>/scans` resolves one citation: the volume
  and image, how it was placed (anchored, estimated, volume only), and the
  viewer URL. The Astia cache lives in the data folder, so the dev app shares
  it with the script.
- The panel asks for each church-book citation's scans after it renders and
  shows the links as they arrive: "Scan" for an anchored image, "Scan
  (approximate)" for an estimate, "Volume" when only the book is known. A
  split volume shows one link per candidate. Astia being unreachable shows
  as "Scan unavailable", not an error page.

## Done when

- The 12 spot-checked citations open the images verified in
  `data/citation-scans-spotcheck.md`.
- A second look at the same person makes no Astia requests.
