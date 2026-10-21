Status: ready-for-agent
Blocked by: 02, 03

# Write Marks into the citations, and carry them through the GEDZIP

Parent: `01-storage-not-lossless-for-export.md`, decided in `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`. Glossary: **Mark**, **Box**, **Record pin**, **Reference pin**, **Page pin**, **Record range**, **Vision match**, **Rejection**, **Link**.

A Mark is saved today as a Record pin or Reference pin in the data folder's `pins.local.json` (`src/server/citation-scans/pins.ts`), shared by every dataset and laid over the citations when a Link is resolved. It moves into the dataset's database, onto every citation of the record it marks.

## Do

- **Schema**: on citations, `imported_page` (the `PAGE` as imported) and a link to an Astia Image: Volume, Image number, file id, Box, the Image's pixel width and height, hand or vision, and whether a Vision match is unchecked. A table of Rejections. Neutral names (ADR-0013).
- **A Mark writes the citations.** Marking a reference, or confirming a Vision match, writes the link into every citation of that record (by Record number, or by the reference URL for a Reference pin). `page` becomes the Astia Image's address, and the old `page` moves to `imported_page`. The Box saves the Image's pixel size, which the viewer knows then. A Mark that gives a Page pin still saves it in the shared file.
- **Clearing a Mark** (Discard) puts `imported_page` back and removes the link. A Vision match taken back becomes a Rejection row.
- **An unchecked Vision match** (the vision pass, `scripts/match-citation-scans`) writes its link and keeps the imported `page`.
- **Hand beats vision**, as `pins.ts` does today: a vision match never replaces a hand Mark.
- **Resolution reads Marks from the dataset.** `locate.ts` takes `Pins`; build its Record and Reference pins from the dataset's citation links, over the shipped and local Page pins and Record ranges, so resolution itself needn't change. A Mark in one dataset no longer extends another's Record ranges.
- **Export and import of the GEDZIP** (`03`) carry them: an `OBJE` under the citation pointing at an `OBJE` record per Astia Image (`FILE` = the Image URL, `FORM image/jpeg`), with the Box as a pixel `CROP`. `NOTE Imported page: <url>` for `imported_page`. `NOTE Found by the vision model, not checked by hand` for an unchecked match. Importing a `.gdz` reads all three back into the columns. Rejections stay out of the GEDZIP.
- **Move today's pins once**: a throwaway script copies each Record and Reference pin in `pins.local.json` into every dataset's citations of that record (Box, provenance, file id; pixel size from the Scan cache when it has the Image), prints what it couldn't place, then strips the moved pins from the file and leaves Page pins and Record ranges. Delete the script in the commit after it has run.
- **The Image's pixel size for older Boxes**: when the viewer opens an Image whose Mark has no size yet, it saves it.

## Tests

- A Mark on a record cited by three people writes the link into all three citations, and `page` / `imported_page` swap; Discard swaps back.
- A vision match keeps the imported `page`, is marked unchecked, and doesn't replace a hand Mark. Confirming it makes it a Mark.
- Resolution gives the same Links from citation links as it did from the same pins in `pins.local.json`.
- The round trip of `03`, now with a hand Mark, an unchecked vision match and a Box: the `OBJE`, `CROP` (pixels) and both notes come back as the same columns.
- The move script places pins by Record number and by reference URL, and lists one whose record no dataset cites.

## Not here

Carrying Marks across a re-import (`05`). Updating `src/server/citation-scans/CONTEXT.md`'s Record pin, Reference pin and Mark entries belongs in this ticket's last commit, once the code matches.
