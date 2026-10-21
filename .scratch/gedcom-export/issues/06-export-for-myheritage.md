Status: ready-for-agent
Blocked by: 04

# Export a GEDCOM 5.5.1 file for MyHeritage

Parent: `01-storage-not-lossless-for-export.md`, decided in `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`. Glossary: **Mark**, **Box**.

It isn't known whether MyHeritage takes GEDCOM 7 or a GEDZIP, so beside the `.gdz` (`03`) there is a GEDCOM 5.5.1 `.ged` for uploading to MyHeritage.

## Do

- **Write GEDCOM 5.5.1** from the same data as `03`: `HEAD` with `GEDC.VERS 5.5.1` and `FORM LINEAGE-LINKED`, `CHAR UTF-8`, `CONC` / `CONT` splitting under 5.5.1's line-length limit.
- **Leave photos out**: no person or family `OBJE`.
- **Marks without Boxes**: a citation's Astia link as an `OBJE` with the Image URL and no crop, since 5.5.1 has none. The two notes of `04` as in the `.gdz`.
- **`UID` as `_UID`**, the one place a person's id survives in 5.5.1, so MyHeritage has the chance to recognise people.
- Map anything GEDCOM 7-only that `02` stores to its 5.5.1 form, or leave it out and list it in the export log.
- **An Export for MyHeritage… action** beside Export….

## Tests

- A fixture dataset exports as valid 5.5.1 lines: header, `CONC` / `CONT` at the limit, no person `OBJE`, `_UID` on people.
- A Marked citation's `OBJE` has the Image URL and no `CROP`.

## Check by hand, once

Upload ylonen's export to MyHeritage as a new tree, and note in this ticket whether people, dates, sources, citation notes and the Astia links come through.
