Status: resolved

# Store every kind of data the real exports use

Parent: `01-storage-not-lossless-for-export.md`, decided in `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`. Glossary: **Citation**.

The database keeps only what the chart and panel render, so the import drops notes, causes of death, the rest of each citation and source, and every fact tag outside `PERSON_FACT_TAGS` / `FAMILY_FACT_TAGS` (`src/server/gedcom-import.ts`). The database is now the master copy, so it has to hold all of it.

## Do

- **List what isn't stored.** `importGedcom` reports every standard (non-`_`) line it didn't store, as tag paths with counts (e.g. `INDI.BIRT.CAUS ×6`), in `ImportStats`. The import log prints them, like the "Not imported" line for archive files.
- **Grow the schema until the list is empty** for ylonen's and bourbon's MyHeritage exports (`../myheritage-export/export.ged`). Known gaps from the audit in `01`: `NOTE` (on records and nested), `CAUS`, citation `DATA.DATE`, source `AUTH` / `TEXT`, fact substructures beyond `DATE` / `PLAC` / `ADDR`, fact tags outside the allow-lists. Name columns for what a value is, never for the program that wrote it (ADR-0013).
- **Keep the order of every repeated structure** (names, facts, citations, notes, media links). Export (`03`) writes them back in that order.
- **`_UID` becomes `persons.uid`**, stored without MyHeritage's checksum, in the RFC 9562 UUID form that GEDCOM 7's `UID` asks for. Write it unchanged otherwise: the spec forbids even normalising its letter case. A person with no `_UID` gets a new random UUID (ADR-0013: everyone has a `UID`). Drop `RIN`, which repeats the xref.
- **The profile photo comes first.** The import still drops `_PRIM`, after ordering the photo it marked first among the person's media links. `is_primary` may stay as is.
- **Refuse a database from an older schema.** Replace `ADDED_COLUMNS` with a schema version in `meta`. A dataset whose version is older doesn't open; the dataset chooser says it was made by an older version and offers Import… for it. (Merging that re-import with app changes is `05`; until then nothing in a dataset is the app's own, so replacing loses nothing.) The demo seed is a GEDZIP and is simply imported again.

## Tests

- A fixture with a note, a cause of death, a citation date, a source author and an unlisted fact tag stores each, in order.
- A line the schema can't hold is listed by tag path with its count.
- `_UID` is stored as a UUID; `RIN` and other `_` lines aren't listed as "not stored".
- A person with no `_UID` gets a fresh UUID, different for each such person.
- The photo marked `_PRIM` is first in the person's media links.
- A database with an older schema version is refused, and the chooser offers to import it again.
- Run locally, not committed: importing ylonen's and bourbon's exports lists nothing as not stored.

## Not here

Writing anything back out (`03`). Showing the new data in the person panel: that's a display concern for later tickets.

## Answer

- **Stored now**: notes (on people, families, facts, sources and citations, in a `notes` table), name pieces (`GIVN`, `SURN`, … in `name_pieces`), a fact's `TYPE`, `AGE` and `CAUS`, its `ADDR` parts (`fact_addresses`; `facts.address` stays the joined text the panel shows), a citation's `EVEN` / `ROLE` (MyHeritage keeps its record id in `ROLE`) and `DATA.DATE`, a source's `AUTH` and `TEXT`, and every GEDCOM 7 individual and family event and attribute (census among them).
- **What isn't stored** is found mechanically: the import marks each line it reads, and `ImportStats.unstored` lists the rest by path and count. The import log prints it as "Not stored: …". ylonen's export lists nothing.
- **UID**: MyHeritage's `_UID` becomes `UID` in the conversion and is stored on persons and families exactly as written (32 hex digits, not reformatted). Anyone without one gets `crypto.randomUUID()`. `RIN` is dropped.
- **Profile photo**: the `_PRIM` photo is ordered first and `media_links.is_primary` is gone; the chart takes the first.
- **Schema version 2** in `meta.schema_version`. `openDb` refuses any other with `OutdatedDatasetError`; the registry lists such a dataset as `outdated`, and the chooser shows it with Import…, which imports a file under its name. `readAny` still reads it, so a re-import reuses its photos. The demo, if an older version built it from `bourbon.gdz`, is imported again on launch.
- **Left as before**: the MyHeritage conversion still drops `EMAIL` on residences. `FAMC` / `FAMS` aren't stored: they repeat the families' `HUSB`, `WIFE` and `CHIL`.
- **Not here**: the Bourbon demo (Ancestris, GEDCOM 5.5.1) still lists 13 kinds of line; they're `07`.
