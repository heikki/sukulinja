Status: ready-for-agent
Blocked by: 02

# Export a dataset as a GEDCOM 7 GEDZIP, and get the same dataset back from it

Parent: `01-storage-not-lossless-for-export.md`, decided in `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`.

With everything stored (`02`), a dataset can leave the app whole: a `.gdz` holding `gedcom.ged` and its media, the mirror of the GEDZIP import (`../../gedzip-import/issues/01-import-a-gdz.md`).

## Do

- **Write GEDCOM 7 from the database**: `HEAD` (`GEDC.VERS 7.0`, BCP-47 `LANG`), every record and structure `02` stores, in stored order, with the stored xrefs. `UID` from `persons.uid`. No `SCHMA`: nothing non-standard is written.
- **A `GedNode` → text serializer**, the inverse of `parseGedcom`. `parseGedcom` folds `CONT` / `CONC` into `\n`, so split multi-line values back into `CONT` lines. CRLF line ends; GEDCOM 7 needs no `CONC`.
- **Pack the GEDZIP**: `gedcom.ged` plus each local `FILE` at its path under `media/…`. Zip entry names aren't percent-escaped, `FILE` payloads are. Store photos uncompressed. Add the packing beside `unpackGedzip` in `src/server/gedzip.ts`.
- **An Export… action** for the open dataset, wherever Import… lives today, that saves `<slug>.gdz`.

## Tests

- The round trip: import a fixture GEDZIP → export → import the export, and the two databases hold the same tree: people, names, facts, notes, sources, citations, media and order. Compare database contents, not GEDCOM text.
- Multi-line notes come out as `CONT` lines and read back unchanged.
- A photo whose path needs escaping lands in the zip under its plain name and is found again on import.
- Run locally, not committed: the round trip on ylonen's and bourbon's datasets.

## Not here

Astia links on citations (`04`), the MyHeritage `.ged` (`06`).
