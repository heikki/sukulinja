Status: ready-for-agent
Blocked by: 04

# Merge a newer MyHeritage export into a dataset, with Undo last import

Parent: `01-storage-not-lossless-for-export.md`, decided in `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`. Glossary: **Citation**, **Mark**.

Importing into an existing dataset replaces it (`src/server/import-dataset.ts` builds in staging and publishes). Once Marks live in the citations (`04`), and Citations can be made in the app (`../../create-citations/issues/01-cite-from-the-scan.md`), a replace would lose them. Re-import merges instead.

## Do

- **What's the app's own**: a citation column saying it was made in the app (neutral name), and the Marks of `04`. Nothing else the app changes yet.
- **Merge**, building the new dataset in staging as now, from the new export, then carrying over from the current one:
  - **Marks**: each imported citation whose person, source and `PAGE` match a stored citation's `imported_page` (or `page`, if never Marked) keeps the stored citation's link, `page` and `imported_page`.
  - **Repeated citations**: person + source + page isn't unique (ylonen has 28 such groups, 91 citations). Within a group, pair them in stored order, the first with the first; any left over on either side are added or listed as gone. Never merge them into one.
  - **Citations made in the app**: reattached to the same person by `UID`, or by xref for a file that carries no `UID`s. The spec doesn't promise xrefs survive between files, so the xref fallback is a best effort.
  - **Duplicates**: an app-made Citation with the same person, source and page as one in the new export is dropped, and its link moves to the imported one.
  - **Rejections** carry over by reference.
- **Ask before publishing.** The import shows what came from the export (people and citations added and gone), what was kept from the app (Citations, Marks), and what can't be reattached because its person or record is gone, then Merge or Cancel.
- **Undo last import.** Before publishing, the dataset's current database is kept as `db.before-import.sqlite` (only the latest). A dataset action, _Undo last import (date)_, swaps it back.
- A dataset refused for its old schema (`02`) re-imports through this merge, reading the old database's Marks and app-made Citations by the same rules. If the old schema can't be read at all, say so and import as a replace.

## Tests

- A newer export with an added person and citation: both appear; a Marked citation keeps its Astia `page` and link and isn't duplicated.
- An app-made Citation follows its person by `UID`; by xref when the export has no `UID`.
- An app-made Citation the new export now also has is dropped, and its link is on the imported one.
- Two citations with the same person, source and page, the second Marked: after the merge there are still two, and the second still has the Mark.
- A Mark whose citation is gone in the new export is listed as not reattached.
- Undo last import gives back the database from before, Rejections included.

## Not here

A merge that settles conflicts between app edits and MyHeritage edits (deferred in ADR-0013: nothing edits imported data yet).
