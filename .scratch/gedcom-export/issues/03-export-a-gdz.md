Status: ready-for-agent
Blocked by: 02, 07

# Export a dataset as a GEDCOM 7 GEDZIP, and get the same dataset back from it

Parent: `01-storage-not-lossless-for-export.md`, decided in `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`.

With everything stored (`02`), a dataset can leave the app whole: a `.gdz` holding `gedcom.ged` and its media, the mirror of the GEDZIP import (`../../gedzip-import/issues/01-import-a-gdz.md`).

## Do

- **Write GEDCOM 7 from the database**: `HEAD` (`GEDC.VERS 7.0`, BCP-47 `LANG`), every record and structure `02` stores, in stored order, with the stored xrefs. `UID` from `persons.uid`. No `SCHMA`: nothing non-standard is written. Write `GEDC` first in `HEAD`.
- **A citation's `EVEN` / `ROLE`** are stored as MyHeritage wrote them (`EVEN Record`, `ROLE 10509:…`), which aren't GEDCOM 7 enumeration values. Write them as `EVEN EVEN` + `PHRASE Record` and `ROLE OTHR` + `PHRASE 10509:…`, and read `PHRASE` back on import, so the stored values round-trip.
- **A `GedNode` → text serializer**, the inverse of `parseGedcom`. `parseGedcom` folds `CONT` / `CONC` into `\n`, so split multi-line values back into `CONT` lines. CRLF on every line; GEDCOM 7 needs no `CONC`. Every line of a value that starts with `@`, `CONT` lines included, is written `@@`; keep leading and trailing spaces.
- **Pack the GEDZIP**: `gedcom.ged` plus each local `FILE` at its path under `media/…`. Zip entry names aren't percent-escaped, `FILE` payloads are. Store photos uncompressed, and keep the zip's UTF-8 name flag. `FILE` escapes at least space, `%`, `?` and `#`, and never holds `..`, a leading `/` or a `file:` URL; a media file named `gedcom.ged` is renamed. Add the packing beside `unpackGedzip` in `src/server/gedzip.ts`.
- **An Export… action** for the open dataset, wherever Import… lives today, that saves `<slug>.gdz`.

## Tests

- **Validate with js-gedcom**, the GEDCOM 7 spec editor's validator: `bun add -d github:gedcom7code/js-gedcom#9296068` and a pinned copy of the registry's `g7validation.json`. Every exported `gedcom.ged` in the tests must give no errors (ignore its "does not understand datatype" warnings for `FilePath` / `anyURI`). See `../research-gedcom7-tooling.md`.
- Import FamilySearch's `maximal70.gdz` (Unlicense test file) as a fixture; its escaped non-ASCII `FILE` is the escaping case below.

- The round trip: import a fixture GEDZIP → export → import the export, and the two databases hold the same tree: people, names, facts, notes, sources, citations, media and order. Compare database contents, not GEDCOM text.
- Multi-line notes come out as `CONT` lines and read back unchanged.
- A photo whose path needs escaping lands in the zip under its plain name and is found again on import.
- Run locally, not committed: the round trip on ylonen's and bourbon's datasets.

## Not here

Astia links on citations (`04`), the MyHeritage `.ged` (`06`).
