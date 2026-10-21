Status: resolved
Blocked by: 02

# Store what other programs' GEDCOMs use

Parent: `01-storage-not-lossless-for-export.md`, decided in `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`.

`02` stores all of ylonen's MyHeritage export. The demo, `resources/demo/bourbon.gdz` (an Ancestris GEDCOM 5.5.1 file), still has lines with nowhere to go. Store them, so the demo round-trips through export (`03`) like a MyHeritage dataset.

## Do

Make importing the demo list nothing as not stored. What it lists today, with counts:

- **Change dates**: `CHAN.DATE.TIME` on people (303), families (139), sources, shared notes, repositories and the submitter.
- **Map coordinates**: `PLAC.MAP.LATI` / `LONG` on facts (123).
- **Citations below the record**: `SOUR` on facts (5), names (2) and notes (1), with their `DATA.TEXT` and their own `OBJE` (actes scans, local files in the GEDZIP).
- **Media below the record**: `OBJE` on facts (5) and citations (2), with `TITL` and `NOTE`. The media ingest and `mediaRefsOf` read only `OBJE` directly under a person or family; extend both, so these files are copied too.
- **Notes**: on media links (40), names (8, most pointing at shared notes), places (`PLAC.NOTE`, 1), plus a note's own `SOUR`.
- **Shared notes**: `0 @N1@ NOTE` records (5), and `NOTE @N1@` pointers to them (GEDCOM 7's `SNOTE`).
- **Associations**: `ASSO @I291@` with `RELA` and `NOTE` (2).
- **Agency**: a fact's `AGNC` (1).
- **Repositories**: `REPO` records with `NAME`, `ADDR` parts and `PHON` (4), and a source's `REPO` pointer (6).
- **A source's `DATA.EVEN`** (1).
- **The submitter**: the `SUBM` record (name, address, phone, email, website) and `HEAD.SUBM`.
- **The file header's own data**: `HEAD.NOTE`, `HEAD.COPR`, `HEAD.LANG`, `HEAD.PLAC.FORM`, kept in `meta` for export to write back.

Raise the schema version. Name columns for what a value is (ADR-0013).

## Tests

- A fixture per kind above is stored and leaves nothing listed.
- A fact's `OBJE` file inside a GEDZIP is copied into the dataset's media and linked to the fact.
- A shared note pointed at from two people is stored once.
- Importing `resources/demo/bourbon.gdz` lists nothing as not stored.

## Answer

- **Schema version 3.** Change dates on people, families, sources, repositories, shared notes and the submitter (`change_date`, `change_time`). A fact's `latitude`, `longitude` and `agency`. `addresses` replaces `fact_addresses`, for facts, repositories and the submitter. New tables: `associations`, `repositories` with `source_repositories` (a source may name several), `shared_notes`, `submitters`. A source's `data_events`.
- **Below the record**: citations now hang on facts, names, notes and shared notes too (`citations.scope_type`), and media links on facts and citations (`media_links.scope_type`). `mediaRefsOf` reads the `OBJE` under any line, and the ingest copies every `OBJE` file under a person or family (`allMediaRefs`): the demo now brings 55 files, 8 of them scans of its acts. One `OBJE` with two `FILE`s keeps that grouping in `media_links.object_order`, and its notes go with its first stored file.
- **Notes** may sit on places, names, media links and associations, and point at a shared note instead of holding text (`notes.shared_note_id`).
- **Header**: `NOTE`, `COPR`, `LANG`, `PLAC.FORM` and `SUBM` go into `meta` (`header_note`, `copyright`, `language`, `place_form`, `submitter`).
- **`@@`**: the parser now decodes it, everywhere in a GEDCOM 5.5.1 value and at the start of each line in GEDCOM 7. MyHeritage writes it too, in e-mail addresses.
- Importing `resources/demo/bourbon.gdz` lists nothing as not stored; a committed test checks it.
- The importer was split to stay under the file-size limit: `gedcom-lines.ts` (which lines were read, and the rest), `gedcom-tags.ts`, `import-statements.ts`, `import-media.ts`.
