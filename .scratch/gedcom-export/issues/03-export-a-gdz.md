Status: resolved
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

## Answer

- **Export** (`exportGedcom` in `gedcom-export.ts`, written by `gedcom-writer.ts`): `HEAD` (`GEDC.VERS 7.0` first, `SOUR SUKULINJA`, the stored `SUBM`, `COPR`, `LANG`, `PLAC.FORM`, `NOTE`), then people, families, sources, repositories, shared notes (`SNOTE`), submitters and one `OBJE` record per OBJE a person, family, event or citation had, every structure in stored order with the stored xrefs. A citation with no source record points at `@VOID@`. Enumerations the stored value isn't in are written as `OTHER` / `EVEN` with the value as `PHRASE` (citation `EVEN`/`ROLE`, `ASSO.ROLE`, `NAME.TYPE`). An event with nothing left to say is written `Y`. The writer splits values into `CONT` lines, doubles a leading `@` on each line, ends lines in CRLF and starts the file with a BOM.
- **GEDZIP** (`exportDataset`, `packGedzip`): `gedcom.ged` and each linked file under the path it was imported from when that's safe (relative, inside the archive, not `gedcom.ged`), else `media/<stored name>`. `FILE` is that path percent-escaped per segment; photos are stored uncompressed.
- **Import reads it back**: `OBJE` records with links carrying `CROP` and `TITL`, `SNOTE` records and pointers, `PHRASE`, `@VOID@`. To make the round trip exact, the import now stores values the GEDCOM 7 way whatever the file's version (ADR-0013): `FORM` as MIME, `LANG` as BCP 47, calendar words, `QUAY` 0–3, `AGE` with a unit, an empty event as `Y`, other empty lines not at all; and family children numbered without gaps.
- **Export… in the app**: each dataset in the chooser has Export, which `POST /datasets/<slug>/export` answers by saving `~/Downloads/<slug>.gdz` (or `-2`, `-3`, …) and saying where, since the app's web view can't hand a download over.
- **Validated with js-gedcom** (`test/gedcom7/validate.ts`, devDependency pinned to `9296068`, rules pinned at GEDCOM-registries `19ce01e`). It reads a value that starts with a space as a double delimiter, which GEDCOM 7's grammar allows; MyHeritage writes a name with no given name that way (`NAME  /Doe/`), so the helper ignores that one message.
- **Round trip**: `test/tree-snapshot.ts` describes every table with ids replaced by what each row belongs to; the fixture and the demo come back identical, and (run locally) so does ylonen's export. Only `media.original_path`, which records how an import found the file, may differ.
- **Known**: the demo has one `EVEN` with an empty `TYPE`; GEDCOM 7 requires a type and the export doesn't invent one, so that line stays invalid. FamilySearch's `maximal70.gdz` imports (its escaped `FILE` is found) and what's stored of it exports valid; it uses 130 kinds of line the database doesn't hold, which the import lists.
