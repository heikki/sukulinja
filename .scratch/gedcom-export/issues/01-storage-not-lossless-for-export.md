Status: needs-triage

> _Filed by AI while scoping GEDCOM export. Export is deferred until the storage
> model below is decided._

# Export needs a faithful source — SQLite is a lossy display projection

## Goal (deferred)

A "real" export: the app's dataset → a GEDCOM file the user can take elsewhere,
reflecting what the app holds (and, eventually, edits made in-app). This is the
mirror image of the import that already exists.

## Blocker

Export can only emit what storage captured, and the SQLite schema stores only
what the hourglass chart needs to render. Exporting from it would look complete
but silently drop genealogical data.

Audited against the real MyHeritage export (`../myheritage-export/export.ged`):

**Survives** (so these are _not_ the problem):

- Dates including qualifiers — `ABT`/`EST`/`BEF`/`AFT`/`BET…AND` are inline in
  the DATE value and stored verbatim in `facts.date_text`. (This tree:
  `ABT`×6, `EST`×3, `BET…AND`×2300.)
- Names (full + parsed given/surname/suffix + type, multiple per person), sex,
  vital facts with DATE/PLAC, the fact's own value, residence addresses (`ADDR`
  and its parts, joined into `facts.address`), photos with FORM + face CROP,
  family links.
- **Source citations**, as MyHeritage writes them: every one sits directly on
  the person or family (`1 SOUR`, ×3,795; none under a fact), so nothing ties
  it to one fact to begin with. Stored in `citations`: the source pointer,
  `PAGE`, `QUAY` and `DATA`/`TEXT`. Source records keep `TITL` and `PUBL`.

**Dropped** (the problem):

- **Notes** (`NOTE`: 18 on records, 27 nested) and **cause of death** (`CAUS`,
  ×6).
- The rest of a citation: `DATA`/`DATE` (×22). The rest of a source record:
  `AUTH`, `TEXT`, and MyHeritage's `_MEDI`/`_TYPE`.
- Any fact substructure beyond `DATE`/`PLAC`/`ADDR`; any fact whose tag isn't
  in the hardcoded allow-lists in `src/server/gedcom-import.ts`
  (`PERSON_FACT_TAGS` / `FAMILY_FACT_TAGS`).

**Structural gap:** app uploads (`POST /import`) read the GEDCOM text and
**discard it** after import — so for uploaded datasets there is currently no
faithful source to export from at all.

## Decision needed (before any export work)

- **A — Persist canonical (recommended).** Store the cleaned GEDCOM-7 at import
  (e.g. `data/<slug>/source.ged`); keep SQLite as the display projection.
  Export serves the canonical → lossless by construction, small change, and
  lossless _today_ since there's no in-app editing yet. When editing lands,
  edits reconcile back into the canonical.
- **B — Expand the schema** with notes, the rest of citations and sources, and
  arbitrary facts so SQLite is near-lossless; export reconstructs from the DB.
  Larger, never-finished work; still risks gaps. Only worth it where the _UI_
  needs to render that data (a display concern, separate from export).

Note A and B aren't exclusive: A makes export correct; B is driven by features
that need to show sources/notes/etc.

## Implementation notes (when picked up)

- A `GedNode` tree → text serializer (inverse of `parseGedcom`) was prototyped
  and removed since export is deferred. The one subtlety: `parseGedcom` folds
  `CONT`/`CONC` into `node.value` with `\n`, so the serializer must re-split
  values containing newlines back into `CONT` lines. Emit CRLF; GEDCOM 7 needs
  no `CONC`.
- For option A, the cleaned tree already exists in memory during import
  (`convertMyHeritage` output) — serialize it once and write it next to the DB.
  The GEDCOM-7 HEAD transforms (`GEDC.VERS 7.0`, `LANG`→BCP-47, `HEAD.SCHMA`
  declaring `_X` tags) from the old `fix.py` belong here, on that stored file.
- `persons.xref` / `families.xref` are stored, so cross-references round-trip
  cleanly under either option.

### Scan links on citations

A church-book citation's Astia scan link isn't in the GEDCOM or in SQLite. It
lives in the data folder's `pins.local.json`, keyed by the cited MyHeritage
record so it survives re-imports: a Record pin (by Record number) or a
Reference pin (by record URL). Under either option above, export has to merge these
into the citations it writes; it's the one thing the app adds that the import
never held.

GEDCOM 7.0 carries it as standard: a `SOUR` citation may hold a multimedia
link (`OBJE`), and the link a `CROP` for the part of the image meant.

```
1 BIRT
  2 SOUR @S1@
    3 PAGE I C:4, image 112
    3 OBJE @M1@
      4 CROP
        5 TOP 1840
        5 LEFT 610
        5 HEIGHT 220
        5 WIDTH 1300
0 @M1@ OBJE
  1 FILE https://astia.narc.fi/…
    2 FORM image/jpeg
```

- One `OBJE` record per Astia Image, shared by every citation linking it.
- `CROP` is in pixels; the app's `Box` is in fractions of the Image. Convert
  with the Image's size (known once it's in the scan cache). An entry without a
  box (hand marks, Anchored and Estimated links) gets the `OBJE` link with no
  `CROP`.
- Only Placed links are certain. Whether to export Anchored or Estimated ones
  (counted, often an Image or more off) is a choice to make then; a `NOTE` could
  say how each was found.
- Provenance (`by: hand | vision`) has no standard tag: a `SCHMA`-declared
  extension tag (e.g. `_BY`) or a `NOTE`.
- GEDCOM 5.5.1 has no standard crop. MyHeritage's `CROP` under `FILE` (read by
  `cropValues` in `gedcom-import.ts` for face crops) is its own extension, so a
  5.5.1 export would keep the link but not the box, for most readers.

### Write a GEDZIP

Decided 2026-10-21: an export with media is a `.gdz` (GEDCOM 7.0 spec, chapter 4): `gedcom.ged` plus each local `FILE` at the same path (`media/…`), the mirror of the `.gdz` import in `../../gedzip-import/issues/01-import-a-gdz.md`. Zip entry names aren't percent-escaped; `FILE` payloads are. Store the photos uncompressed, since JPEGs don't shrink. Under option A, the stored canonical could itself be that `.gdz`.

## Related

- Import (MyHeritage → SQLite, CLI + in-app `POST /import`) is built and
  verified — see `src/server/myheritage.ts`, `src/server/import-dataset.ts`.

## Comments

**Decided 2026-10-21: see `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`.** Neither A nor B as written: the database becomes the master copy and grows a table or column per kind of data the real exports use (B, scoped), and the import file is not kept. Export is a GEDCOM 7 GEDZIP that round-trips, plus a GEDCOM 5.5.1 `.ged` for MyHeritage. This supersedes "Scan links on citations" above: a Mark is written into the citations themselves (`page` becomes the Astia Image, the imported `PAGE` kept in `imported_page`), not kept in `pins.local.json`. Re-import merges by `UID` / record id and keeps an undo. Next: split into implementation tickets.
