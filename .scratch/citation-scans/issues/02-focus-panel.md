Status: ready-for-agent

# Focus panel: events and sources

Part of `../PRD.md`. Needs 01.

## What

- `GET /d/<slug>/api/persons/<id>` returns the person's names, facts (tag,
  date, place, value) and citations. A MyHeritage church-book citation comes
  parsed: parish, book, years, page, and the transcription (person, birth,
  farm and village, household). Others come as source title, page and text.
- The citation parser moves from `scripts/map-citation-scans/citations.ts`
  into `src/server/` so the server and the script share it.
- A panel beside the chart shows the Focus person: name, life events, then
  sources, church books first. Each source links to its MyHeritage record.
- Links open in the default browser in the desktop app.

## Done when

- Refocusing updates the panel; a person without sources shows events only.
- The panel can be hidden and remembers that.
