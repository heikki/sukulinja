Status: ready-for-agent

# Import keeps sources and citations

Part of `../PRD.md`.

## What

- Schema: `sources` (xref, title, publisher) for top-level `SOUR` records, and
  `citations` (scope_type, scope_id, source_id, page, quality, text,
  sort_order) for `SOUR` under `INDI` and `FAM`. `page` holds `PAGE` as
  recorded (for MyHeritage, the record URL); `text` holds `DATA/TEXT`.
- `importGedcom` fills both; `ImportStats` counts them.
- A dataset imported before this has no citations until it is re-imported.

## Done when

- Importing the MyHeritage export stores every person-level citation (3,795
  in this tree) with its page URL and text.
- A test covers a person citation with `PAGE`, `QUAY` and multi-line
  `DATA/TEXT`, and a citation pointing to a source record.
