Status: resolved
Blocked by: 02, 03

# Write Marks into the citations, and carry them through the GEDZIP

Parent: `01-storage-not-lossless-for-export.md`, decided in `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`. Glossary: **Mark**, **Box**, **Record pin**, **Reference pin**, **Page pin**, **Record range**, **Vision match**, **Rejection**, **Link**.

A Mark is saved today as a Record pin or Reference pin in the data folder's `pins.local.json` (`src/server/citation-scans/pins.ts`), shared by every dataset and laid over the citations when a Link is resolved. It moves into the dataset's database, onto every citation of the record it marks.

## Do

- **Schema**: on citations, `imported_page` (the `PAGE` as imported) and a link to an Astia Image: Volume, Image number, file id, the Box in pixels of the full-size Image (as GEDCOM's `CROP` holds it), hand or vision, and whether a Vision match is unchecked. A table of Rejections. Neutral names (ADR-0013).
- **A Mark writes the citations.** Marking a reference, or confirming a Vision match, writes the link into every citation of that record (by Record number, or by the reference URL for a Reference pin). `page` becomes the Astia Image's address, and the old `page` moves to `imported_page`. The viewer converts the Box it draws to pixels of the full-size Image, which it has open; the vision pass does the same with the Image it read. Both scale it back when showing it. A Mark that gives a Page pin still saves it in the shared file.
- **Clearing a Mark** (Discard) puts `imported_page` back and removes the link. A Vision match taken back becomes a Rejection row.
- **An unchecked Vision match** (the vision pass, `scripts/match-citation-scans`) writes its link and keeps the imported `page`.
- **Hand beats vision**, as `pins.ts` does today: a vision match never replaces a hand Mark.
- **Resolution reads Marks from the dataset.** `locate.ts` takes `Pins`; build its Record and Reference pins from the dataset's citation links, over the shipped and local Page pins and Record ranges, so resolution itself needn't change. A Mark in one dataset no longer extends another's Record ranges.
- **Export and import of the GEDZIP** (`03`) carry them: an `OBJE` under the citation pointing at an `OBJE` record per Astia Image (`FILE` = the Image's JPEG, `getFile.php?fileId=…`, not the viewer page: GEDCOM 7 allows `CROP` only on a file with pixels; `FORM image/jpeg`), with the Box as its `CROP`, never past the Image's edges. `PAGE` holds the viewer address. Importing re-derives the Image number from the file id and the Volume's list. `NOTE Imported page: <url>` for `imported_page`. `NOTE Found by the vision model, not checked by hand` for an unchecked match. Importing a `.gdz` reads all three back into the columns. Rejections stay out of the GEDZIP.
- **Move today's pins once**: a throwaway script copies each Record and Reference pin in `pins.local.json` into every dataset's citations of that record (Box converted to pixels with the Image's size, fetched through the Scan cache; provenance; file id), prints what it couldn't place or convert and leaves those in the file to run again, then strips the moved pins from the file and leaves Page pins and Record ranges. Delete the script in the commit after it has run.
- **Provenance through the GEDZIP**: only an unchecked Vision match is told apart in the file; a confirmed one comes back as a hand Mark, which is what confirming means.

## Tests

- A Mark on a record cited by three people writes the link into all three citations, and `page` / `imported_page` swap; Discard swaps back.
- A vision match keeps the imported `page`, is marked unchecked, and doesn't replace a hand Mark. Confirming it makes it a Mark.
- Resolution gives the same Links from citation links as it did from the same pins in `pins.local.json`.
- The round trip of `03`, now with a hand Mark, an unchecked vision match and a Box: the `OBJE`, `CROP` (pixels) and both notes come back as the same columns.
- The move script places pins by Record number and by reference URL, and lists one whose record no dataset cites.

## Not here

Carrying Marks across a re-import (`05`). Updating `src/server/citation-scans/CONTEXT.md`'s Record pin, Reference pin and Mark entries belongs in this ticket's last commit, once the code matches.

## Answer

Done. Marks and Vision matches live in each dataset's citations (`src/server/citation-scans/marks.ts`), schema 4. Resolution reads them as Record and Reference pins over the shared Page pins and Record ranges (`pins.ts`), so `locate.ts` didn't change. The Scan viewer, the vision pass and the API work in pixels of the full-size Image.

Decided while building:

- **A Mark's key** is the record, for a reference with a Record number, else its URL. Every citation of the key gets the same link; a Discard clears them all.
- **Resolution** reads every marked citation as a Reference pin of its own URL, and a Mark on an Image as a Record pin too. A Mark therefore always decides its reference's Link, as a Reference pin did before.
- **A Page-pin-only Mark** (a linked cited page, no Record number, no Box) still saves only the Page pin, and the citation keeps no link, as before.
- **A Volume-only Mark** keeps the imported `page`. The GEDZIP carries it as `NOTE Astia Volume <id>: <label>`.
- **The Image number and Volume label** travel in the Astia `OBJE` record's `FILE.TITL` (`<label>, Image <n>`). Importing a `.gdz` then needs no Astia lists.
- **A Box** is checked server-side to be whole pixels within the Image, using its size from the Scan cache.
- **`pins.local.json`** keeps Page pins and Record ranges. Record pins left there (no dataset cites them) aren't read.

**Moved on 2026-10-21:** after each dataset was re-imported (schema 4), `scripts/move-pins-into-datasets` moved the installed app's pins into its datasets' citations. A first run placed 1,603 of 1,759; the other 154 had Boxes on Images not in the Scan cache, and Astia was down. A second run once it was back downloaded them and moved all 154. The script is gone.
