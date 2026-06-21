Status: needs-triage

> *Filed by AI while scoping GEDCOM export. Export is deferred until the storage
> model below is decided.*

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

**Survives** (so these are *not* the problem):

- Dates including qualifiers — `ABT`/`EST`/`BEF`/`AFT`/`BET…AND` are inline in
  the DATE value and stored verbatim in `facts.date_text`. (This tree:
  `ABT`×6, `EST`×3, `BET…AND`×2300.)
- Names (full + parsed given/surname/suffix + type, multiple per person), sex,
  vital facts with DATE/PLAC, photos with FORM + face CROP, family links.

**Dropped entirely** (the problem):

- **Source citations** — `SOUR`/`PAGE`/`QUAY`/`DATA`/`TEXT` (this tree has rich
  Finnish church-record citations). All provenance lost.
- **Notes** (`NOTE`), **residence addresses** (`ADDR`/`ADR1` on `RESI`),
  **cause of death** (`CAUS`).
- Any fact substructure beyond `DATE`/`PLAC`; any fact whose tag isn't in the
  hardcoded allow-lists in `src/server/gedcom-import.ts`
  (`PERSON_FACT_TAGS` / `FAMILY_FACT_TAGS`).

**Structural gap:** app uploads (`POST /import`) read the GEDCOM text and
**discard it** after import — so for uploaded datasets there is currently no
faithful source to export from at all.

## Decision needed (before any export work)

- **A — Persist canonical (recommended).** Store the cleaned GEDCOM-7 at import
  (e.g. `data/<slug>/source.ged`); keep SQLite as the display projection.
  Export serves the canonical → lossless by construction, small change, and
  lossless *today* since there's no in-app editing yet. When editing lands,
  edits reconcile back into the canonical.
- **B — Expand the schema** with tables for sources, notes, addresses, and
  arbitrary facts so SQLite is near-lossless; export reconstructs from the DB.
  Larger, never-finished work; still risks gaps. Only worth it where the *UI*
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

## Related

- Import (MyHeritage → SQLite, CLI + in-app `POST /import`) is built and
  verified — see `src/server/myheritage.ts`, `src/server/import-dataset.ts`.
