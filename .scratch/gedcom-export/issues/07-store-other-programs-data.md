Status: ready-for-agent
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
