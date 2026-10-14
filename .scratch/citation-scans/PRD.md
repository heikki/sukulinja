Status: ready-for-agent

# Sources and church-book scans for the Focus person

## Problem

A MyHeritage export carries thousands of record citations (this tree: 3,795,
all hung directly off people — `1 SOUR` under `INDI`, none on events). The
import drops them, so the app can show who someone is but not where that is
written down. For Finnish church books, the original page is publicly
scanned in Astia (the National Archives' service), and
`scripts/map-citation-scans/` already maps most citations to the right image.

## Goal

Next to the chart, a panel for the **Focus** person: their life events, then
their sources. Each church-book source shows what the record says (the
household as MyHeritage transcribed it), a link to the MyHeritage record, and
a link to the Astia scan of the page. A link that lands on the wrong image
can be corrected in the app, and the correction fixes nearby citations too.

## Decisions

- **Focus panel, not a per-person popover.** The panel follows Focus; there
  is no second selection model. Refocusing changes the panel.
- **Scans resolve when the panel opens, not at import.** Import stays fast and
  offline. Resolving needs Astia's volume lists (cached on disk after the
  first look at a parish) and the anchors. The first look at a person in a
  new parish can take a while; the panel shows the sources at once and the
  scan links when they arrive.
- **Corrections in the first version.** "It's actually image N" (or a pasted
  Astia URL) saves an anchor for the cited page. Corrections live in a local
  overlay beside the datasets, applied over the anchors that ship with the
  app; the mapper script reads both.
- **Citations are stored raw.** `PAGE`, `QUAY` and `DATA/TEXT` go into the DB
  as recorded; parsing (parish, book, page, household) happens when serving.
  Storage stays lossless for a later export, and parser fixes need no
  re-import. Pages are shown as cited even where MyHeritage misread them; the
  anchors map the cited number to the right image.
- **External links open in the browser.** Plain `target="_blank"` links; the
  desktop app forwards them to the default browser.

## Slices

1. `issues/01-store-citations.md` — import keeps sources and citations.
2. `issues/02-focus-panel.md` — the panel: events and sources, record links.
3. `issues/03-scan-links.md` — Astia scan links, resolved on demand.
4. `issues/04-correct-scan-links.md` — in-app correction of a scan link.

## Out of scope

- Citations on events and families' facts (this export has none on events).
- Showing the scan inside the app (the link opens Astia's viewer).
- Mapping baptism and marriage index citations past the volume (they carry no
  page number).
