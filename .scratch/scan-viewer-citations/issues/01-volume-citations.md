Status: ready-for-agent

# The Volume's citations

Part of `../spec.md`.

## What

- `GET /d/<slug>/api/volumes/<volumeId>/citations` lists every person
  citation in the dataset whose resolution lands in the Volume, one row per
  person and record. Each row carries:
  - the citation as a `CitationRow` (built as `person-details`' `toCitation`
    builds it) and the person's id, so the viewer can switch to it
    (ticket 02);
  - its `Scan` in this Volume: Image, Scan method, `by`;
  - whether it is **Split** (one of several candidate Volumes);
  - its `Box` where the Seen record or Placement it resolved from has one.
- The row type goes in `@common/types`; `Box` moves there from
  `src/server/citation-scans/reader.ts`.
- Resolution reuses `resolveChurchBookRef` with the loaded anchors and
  placements, so the rows agree with the source panel's links. The `Scan`
  doesn't carry the box today; the resolution needs to report it for a
  Placed scan.
- Only references whose parish is the Volume's are resolved. Parsing
  (`parseChurchBookRef`) is offline; resolving another parish's reference
  would crawl that parish's Volumes from Astia.
- A reference resolved only to the Volume (method `volume`) is a row with no
  Image.
- Results are kept per dataset and Volume, and dropped when a correction or a
  vision save writes the anchors or placements (an Anchor moves its
  neighbours, so drop them all), and when the dataset is re-imported.

## Done when

Tested with fake Astia and a temp data folder, as the matcher and runner
tests do (`test-parish.ts`):

- Placed, Anchored and Estimated citations come back on their Images, and
  Volume-only ones with no Image.
- A Split reference is listed in each candidate Volume, marked Split.
- Two people citing one record get a row each, with the same Image and box.
- A vision match's box reads back; a hand correction of the same record
  drops it.
- A correction shows in the next answer.
- Another parish's citations are never resolved (no Astia request for its
  Volumes).

## Comments

Landed as `src/server/volume-citations.ts` (the query and its cache) over
`volumeScans` in `scans.ts`; rows are `VolumeCitation` in `@common/types`.

- The Volume's parish is found by looking for it in the archives of the
  dataset's cited parishes, most cited first, stopping at the first that
  holds it. An archive already crawled costs no request; only references of
  that archive's parishes (spelling variants included) are resolved.
- The vision pass saves from a script, another process, so the cache and
  `loadAnchors` both key on the local files' modification stamp
  (`localStamp`) instead of being told: a save shows in the next answer
  without restarting the app, here and in the source panel's links.
- A Placed `Scan` now carries its `box`.
