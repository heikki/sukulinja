Status: resolved
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

## Answer

Done, schema 5. Importing into a dataset that's there builds the new one in staging, carries over what the app added (`src/server/import-merge.ts`, matching records in `merge-records.ts`), shows the review, and saves only on Merge. Every existing dataset is now outdated, and importing its export again merges.

Decided while building:

- **`added_in_app`** on citations says a citation was made in the app. The GEDZIP carries it as `NOTE Added in Sukulinja`, so importing the app's own export keeps it. The MyHeritage export leaves it out (noted in `06`).
- **When to fall back to xrefs:** when the import had to make up every person's and family's `UID`. A record that has no `UID` in the old database (an older schema) is always matched by xref.
- **A Marked citation whose export now gives the Astia address as its `PAGE`** (after the MyHeritage export of `06` went back up) is matched by that address too, so its Mark stays.
- **An app-made citation on a fact** goes back to the new database's fact with the same person, kind, date and place. A citation on anything else, or whose source is gone, is listed as lost. Its text notes come along; it has no photos to carry.
- **What's kept for Undo:** `db.before-import.sqlite`, plus the photos only that database names. They stay in `media/` until the next import (photos are named by their content, so nothing clashes). Undo renames the kept database back, and nothing is left to undo after that.
- **The review** is a `review` event in the import's stream. The import waits for `POST /import/<id>` with `{ merge }`. Closing the page while it waits cancels the import.
- **A database that can't be read** gives a review that says why, and the import replaces it, still keeping the file to undo with.

Checked on a copy of the installed app's ylonen (schema 4, 1,608 Marks), re-importing `Ylönen.ged`: all 1,608 Marks came back on the same people, pages and Boxes, with nothing added or gone. In the browser: review → Merge → Undo last import.
