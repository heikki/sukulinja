Status: ready-for-agent

# Keep a Citation's Annotation in one module, and call the imported page its original page

Glossary: **Annotation**, **Citation**, **Mark**, **Vision match**, **Discard**, **Box** (`src/server/citation-scans/CONTEXT.md`). Decided by an architecture review and a grilling on 2026-10-22. Builds on `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`.

An Annotation is what the app adds to a Citation: its Mark or Vision match, the page a Mark on an Image moved aside, and whether the app made the Citation. Today it has four shapes and no single owner:

- `CitationLink` in `citation-scans/marks.ts`
- `LinkColumns` in `astia-links.ts`, and `CitationExtras` in `import-links.ts`
- the raw `link_*` fields on `CitationRow` in `export-rows.ts`
- the `MARK` and `HELD` column lists in `import-merge.ts`

`imported_page` is spelled out in 7 server files plus `scripts/vision/dataset.ts`. The swap rule (a Mark on an Image makes `page` the Image's address and moves the page aside) is written twice, in `marks.ts`'s `writeLink` and in the merge's `carryMark`. The import writes the Annotation as 11 positional values into a 21-placeholder INSERT. create-citations (`../../create-citations/issues/01-cite-from-the-scan.md`) would add a fifth writer.

## Do

- **A new module, `src/server/annotations.ts`**, works on single Citation rows. It owns:
  - **The Annotation's one shape:** its link (today's `CitationLink`, moved here), `originalPage` and `madeInApp`. It replaces `LinkColumns`, `CitationExtras` and the export's raw `link_*` fields. Only this module knows the column names.
  - **Inserting a Citation row**, with or without an Annotation. The import, the merge's reattach and, later, create-citations go through it. `insertCitation` leaves `import-statements.ts`, and `HELD` leaves the merge.
  - **The swap** a Mark or Discard does to a set of Citations.
  - **Carrying** a stored Citation's Annotation to the new import's row on a re-import.
  - **Reading** a row's Annotation, for the export and for `marks.ts`.
  - **The "original page, else page" SQL expression** that `marks.ts`, `citations.ts` and `scripts/vision/dataset.ts` embed in their queries.
- **`marks.ts` keeps the per-record work**: finding every Citation of a record (`markKey`), Rejections, and the cross-process change stamp. It calls the new module for the rows. Rejections aren't part of an Annotation, because they belong to a reference, not to a Citation.
- **The import stores what the GEDZIP says.** PAGE and the original page are stored as read. The import never rewrites PAGE to the Image's address.
- **The merge carries verbatim.** A Marked Citation's `page` and original page are copied as stored, never worked out again from the new export's PAGE. Example: after a round trip through MyHeritage, the export's PAGE is already the Astia address. Re-running the swap would make the original page the Astia address and lose the MyHeritage URL that the reference is read from.
- **`import-links.ts`** reads a GEDZIP citation's lines into an Annotation. **`astia-links.ts`** writes the GEDZIP lines from one.
- **Rename `imported_page` to `original_page`**, in the same change:
  - the column, and `SCHEMA_VERSION` 5 → 6;
  - the GEDZIP note: `NOTE Original page: <url>` replaces `NOTE Imported page: <url>`, in both the GEDCOM 7 and 5.5.1 exports;
  - code names (`originalPage`).
  - Only the new name is read, with no fallback to the old column or note.
- **A one-off script** under `scripts/` takes a data folder: the checkout's `data/`, or the installed app's.
  - In each dataset's `db.sqlite`, and its `db.before-import.sqlite` if there is one, it renames the column with `ALTER TABLE citations RENAME COLUMN imported_page TO original_page` and sets `meta.schema_version` to 6.
  - The person runs it on their data folders; then it's deleted in a later commit, as the pin move script was.
- **Edit ADR-0013 in place** to say `original_page` and `Original page:`. Add a Consequence line saying that databases from before the rename were moved across by a one-off script, and that the old column and note are no longer read.
- **Update the glossary** where it says "imported page" (Mark, Discard, Vision match) to "original page", in lowercase. It is not a glossary term.

## Tests

- **New: `src/server/annotations.test.ts`**, on an in-memory SQLite, through the module's interface:
  - inserting a Citation with and without an Annotation, and reading it back;
  - a hand Mark on an Image: `page` becomes the Image's address, and the original page is kept;
  - a Vision match keeps the original `page`;
  - a Discard puts the original page back and clears the link;
  - a Mark of only a Volume leaves `page` alone;
  - carrying verbatim, including the MyHeritage round-trip case above.
- **`import-merge.test.ts`:** the hand-written SQL helpers `mark` and `citeInApp` build Marked and app-made Citations through the module.
- **Unchanged and still passing:** the round-trip test (`gedcom-export.test.ts`, js-gedcom validator included), `gedcom551.test.ts`, and the record-level tests in `citation-scans/` (`pins.test.ts`, `scans.test.ts`, `rescanned-volumes.test.ts`), apart from the renamed column and note.
- **The script:** a version-5 database becomes a version-6 one that opens, with its Marks and original pages where they were.

## Not here

- **What a Discard does to a Citation made in the app.** It has no original page to go back to. This is left to create-citations, as noted on that ticket.
- **The other candidates from the review:** saving a Mark, Vision match or Discard through one Scans interface; sending the record key to the client; the Scan viewer's Image-arrival controller.
