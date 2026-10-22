# The database holds the whole tree, and a GEDZIP carries it out and back

A dataset's SQLite database stored only what the chart and person panel render: notes, causes of death, the rest of each source and any fact tag outside the import's allow-lists were dropped. The GEDCOM an import read was then discarded, so nothing faithful was left to export from. Links to Astia lived outside the tree in `data/pins.local.json`. And the app is about to write genealogical data of its own: **Citations** made in the **Scan viewer**.

The database is now the dataset's master copy, and a GEDZIP is how all of it leaves the app and comes back:

- **Every kind of GEDCOM data the imports contain gets a table or column.** Scope follows what real exports use, plus what the app adds, not the whole GEDCOM 7 spec. The import lists each standard line it couldn't store, by tag and count. The source file is not kept.
- **Program-specific `_` lines are dropped at import**, with two exceptions that become standard: `_UID` is stored as the person's `UID`, and the photo `_PRIM` marks is ordered first. GEDCOM 7 takes the first substructure of a kind as the preferred one.
- **Everyone has a `UID`.** A person imported without one gets a new random UUID, which every export writes. The spec doesn't promise that record ids (`@I1@`) survive from one file to the next, so only `UID` reliably says who is who.
- **Values are stored the GEDCOM 7 way**, whichever version a file is in: a file's `FORM` as a MIME type, a language as its BCP 47 tag, a calendar by its word (`JULIAN`, not `@#DJULIAN@`), `@@` decoded, and an enumeration's `PHRASE` as the value. An event line with nothing under it (`1 BIRT`) is stored as GEDCOM 7's `BIRT Y`, and other empty lines, which say nothing, aren't stored. A value outside GEDCOM's range is taken to the nearest valid one: MyHeritage's `QUAY 4` is stored as 3, and an `AGE` with no unit as years. Neither is shown in the app. So the database only holds valid GEDCOM 7, and an export writes what's stored.
- **No source program's name appears in the schema.** Column names say what a value is (`uid`, `original_page`), not who wrote it.
- **A Mark is written into the citations.** Marking a **Church-book reference**'s record, by hand or by confirming a **Vision match**, writes the link into every citation of that record:
  - `page` becomes the Astia Image's address.
  - The `PAGE` it had is kept in `original_page`.
  - A multimedia link to the Image's JPEG is added, with its **Box** in pixels, as GEDCOM's `CROP` holds it. The viewer and the vision pass scale it when they have the Image open.
  - Clearing the Mark puts `original_page` back.
  - A Vision match nobody has checked keeps its `page` and adds the link with a note saying it wasn't checked.
  - **Rejections** have no GEDCOM form, so they get a table of their own.
- **Facts about Volumes stay shared.** **Page pins** and **Record ranges** describe Astia's books, not a tree, so they stay in one local file that every dataset reads, beside the shipped ones. A Mark that gives a Page pin still saves it there.
- **Re-importing merges, by stable ids.** The source program's part comes from the new export. A citation says whether it was made in the app (`added_in_app`). Citations made in the app go back to the same person, by `UID`, or by record id for a file that carries no `UID`s.
  - **Matching a citation:** an imported citation counts as the stored one when it has the same person, the same source, and the same `PAGE` as the stored `original_page` (or `page` if the citation was never Marked, or if the export now gives the Astia address). The stored citation is kept, Mark and all, so no duplicate is made. Its `page` and `original_page` are carried as stored, never worked out again from the new `PAGE`: after a round trip through MyHeritage, that is already the Astia address. Citations alike in all three are paired in order, the first with the first.
  - **Duplicates:** an app-made Citation that the new export now has as well is dropped, and its link moves to the imported one.
  - **Their sources:** a Citation made in the Scan viewer cites its Volume's source record, titled with the Volume's label; nothing marks the source itself as the app's. When the new export lacks it, as after a re-import with no upload in between, it's copied in with the Citations reattached to it, once. A source only imported citations cite is never brought back, so one removed in the source program stays gone.
  - **Before the merge:** whatever can't be reattached is listed before you confirm.
  - **Undo:** the import keeps the database from before it, and the photos only that database names, and _Undo last import_ puts it back.
- **A database built by an older schema won't open.** The dataset has to be imported again, which merges as above. With the source file gone, there's nothing to upgrade from.
- **Export writes a GEDCOM 7 GEDZIP** (`gedcom.ged` and its media). It holds everything the database holds:
  - Each Mark becomes an `OBJE` under its citation, pointing at an `OBJE` record for the Image's JPEG in Astia, titled with its Volume and Image number, with the Box as its `CROP`. A Mark of only a Volume is a `NOTE` naming it.
  - `original_page` becomes `NOTE Original page: <url>`.
  - An unchecked Vision match gets a `NOTE` saying so, and a citation made in the app `NOTE Added in Sukulinja`.
  - Importing that GEDZIP gives back the same dataset, reading those notes back into their columns.
  - A second export writes a GEDCOM 5.5.1 `.ged` for MyHeritage, with no photos and links without Boxes, since 5.5.1 has no standard crop.
- **Verified by a round trip.** A test imports, exports and imports again and must get the same tree, on fixtures and, run locally, on the real exports. It also fails if the import listed any line it couldn't store, or if the GEDCOM 7 spec editor's validator, js-gedcom, finds an error in the exported `gedcom.ged`. The MyHeritage `.ged` is checked once by uploading it as a new tree.

## Considered options

- **Keep the cleaned import as the master and SQLite as a display copy** (`source.gdz` per dataset, lossless by construction). Rejected: the app's own changes would have to be written into a file and the database rebuilt from it, and a re-import would still overwrite the file. The app is where the tree is worked on, so the master copy belongs there.
- **One row per GEDCOM line, with today's tables rebuilt from those rows.** Rejected: lossless, but every read and every change goes through a generic tree instead of tables that say what they hold.
- **Leftovers as JSON beside typed tables.** Rejected: two places to keep in step on every change.
- **Keep Marks as notes about a record in `pins.local.json`, laid over the citations at read time.** Rejected: the database wouldn't match the GEDZIP, and a citation made in the app would hold its link differently from an imported one.
- **Keep the source URL in `PAGE` and add the Astia link beside it.** Rejected: the citation should read as what it now cites, the Astia Image. `original_page` keeps the re-import's match working.
- **Replace on re-import.** Rejected: it would lose every Citation made in the app.
- **A full merge with conflict handling.** Deferred: nothing edits imported data yet, so the app's changes are only additions. It can be built on this merge once there's something to conflict.
- **Keep `_PRIM` in the GEDZIP, declared in the header.** Rejected: putting the photo first says the same thing in standard GEDCOM.
- **Store a Box as fractions of the Image, with the Image's pixel size beside it.** Rejected: GEDCOM 7 has no line for an Image's size, so a GEDZIP couldn't bring it back.

## Consequences

- The vision pass and the Scan viewer write Marks into the dataset's database instead of `pins.local.json`. A one-off script moves today's pins into the citations and is deleted afterwards. Page pins and Record ranges stay in a shared file.
- A Mark made in one dataset no longer improves another dataset's estimates through Record ranges.
- A Box is stored in pixels. Older Boxes, kept as fractions, are converted with the Image's size when they move into the citations.
- Re-reading a citation's record number goes through `original_page` once the citation is Marked.
- The column was first named `imported_page`, and its note `Imported page:`. Databases from before the rename were moved across by a one-off script; the old column and note are no longer read.
- The schema grows when a new export's import lists lines it couldn't store. Until then, the round-trip test fails.
