Status: resolved
Blocked by: 04

# Export a GEDCOM 5.5.1 file for MyHeritage

Parent: `01-storage-not-lossless-for-export.md`, decided in `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`. Glossary: **Mark**, **Box**.

It isn't known whether MyHeritage takes GEDCOM 7 or a GEDZIP, so beside the `.gdz` (`03`) there is a GEDCOM 5.5.1 `.ged` for uploading to MyHeritage.

## Do

- **Write GEDCOM 5.5.1** from the same data as `03`: `HEAD` with `GEDC.VERS 5.5.1` and `FORM LINEAGE-LINKED`, `CHAR UTF-8`, `CONC` / `CONT` splitting under 5.5.1's line-length limit.
- **What 5.5.1 needs that 7 doesn't** (`../research-gedcom7-tooling.md`): `HEAD.SOUR` and `HEAD.SUBM`, and a `0 @…@ SUBM` record with a `NAME`. `HEAD.LANG` is a language name (`Finnish`), not `fi`. `FORM` is `jpg`, not `image/jpeg`. At most 255 characters per line _including_ the line end, counted in characters. `CONC` splits between two non-space characters. Every `@` in a value is `@@`. `FILE` and `PAGE` can't be continued, so a URL must fit on its line.
- **Undo what the import made GEDCOM 7** (`gedcom7-values.ts`, `03`): MIME `FORM` back to an extension, the BCP 47 `LANG` to its English name, calendar words to `@#D…@` escapes, `SNOTE` to `NOTE` records and pointers, an enumeration's `PHRASE` back to 5.5.1's free text (`EVEN Record`, `ROLE 10509:…`, `NAME.TYPE`, `ASSO.RELA`), `@VOID@` citations back to inline `SOUR <text>`.
- **Leave photos out**: no person or family `OBJE`.
- **Marks without Boxes**: a citation's Astia link as an `OBJE` with the Image URL and no crop, since 5.5.1 has none. The two notes of `04` as in the `.gdz`.
- **No `Added in Sukulinja` note** (`05`): once MyHeritage has a citation made in the app, the next re-import should find it as MyHeritage's own, which the merge does by its person, source and page, and keep the app's Mark on it.
- **`UID` as `_UID`**, the one place a person's id survives in 5.5.1, so MyHeritage has the chance to recognise people.
- Map anything GEDCOM 7-only that `02` stores to its 5.5.1 form, or leave it out and list it in the export log.
- **An Export for MyHeritage… action** beside Export….

## Tests

- A fixture dataset exports as valid 5.5.1 lines: header, `CONC` / `CONT` at the limit, no person `OBJE`, `_UID` on people.
- A Marked citation's `OBJE` has the Image URL and no `CROP`.
- `@domorium/validator` (npm, MIT, dev only) finds no header or `FORM` errors; line length and `LANG` are asserted directly.

## Check by hand, once

Upload ylonen's export to MyHeritage as a new tree, and note in this ticket whether people, dates, sources, citation notes and the Astia links come through. MyHeritage fetches linked photos during an upload, so watch whether the Astia JPEG links are pulled in as photos. Put an `@` in one note to see whether `@@` is read back.

## Answer

Done, apart from the check by hand. _Export for MyHeritage_ saves `<slug>-myheritage.ged` to Downloads beside the `.gdz`, and its note lists what was left out. The file is the GEDCOM 7 export's lines written back the 5.5.1 way (`src/server/gedcom551.ts`, `gedcom551-writer.ts`), so both exports always carry the same data.

Decided while building:

- **Submitter:** a dataset with none gets `0 @U1@ SUBM` / `1 NAME Sukulinja`, as 5.5.1 requires one.
- **`ADDR` with no value** stays as MyHeritage writes it: the address on `ADR1` under an empty `ADDR`. Strict 5.5.1 wants a value there, and the validator says so (2,347 times on ylonen, its only finding). Changing it would change what MyHeritage gets back.
- **`SEX X`**, which 5.5.1 lacks, is written as `U` and counted in the note. ylonen has none.
- **Lines:** the BOM is kept, as MyHeritage's own export has one. A value that is too long goes on `CONC` lines split between two non-space characters, never inside an `@@`. A `FILE` or `PAGE` too long for a line is written whole and listed. ylonen has none; its longest line is 253 characters.
- **Inline citations:** an `@VOID@` citation goes back to `SOUR <text>`.

On ylonen: 82,012 lines. Left out: 299 photo links and 1,607 Boxes. The validator finds nothing but the `ADDR` lines.

**Still to do by hand:** upload the export to MyHeritage as a new tree, and note here what comes through: people, dates, sources, citation notes and the Astia links. Also note whether MyHeritage pulls the Astia JPEGs in as photos, and whether an `@` in a note comes back as one `@`.
