Status: needs-triage

# Store a Citation made in the app, and read it back like a Mark

Spec: `../spec.md` (decided 2026-10-22). Glossary: **Citation**, **Annotation**, **Mark**, **Box**, **Link** (`src/server/citation-scans/CONTEXT.md`). Builds on ADR-0013 and `src/server/annotations.ts`.

The server side of making a Citation in the Scan viewer: storing it, deleting it, reading it back wherever Citations show, and keeping it through a re-import. 02 (the Scan viewer) and 03 (the person panel) build on this.

## Do

- **Create:** an API call taking the person, the Volume, the Image, its file id, the Box and an optional short text. It stores a Citation on the person, made in the app, through `openAnnotations(db).insert`:
  - `page` is the Image's address in Astia, with no original page;
  - its link is a hand Mark at the entry, with the Box;
  - the text, if given, is its DATA TEXT;
  - its source is the Volume's own source record (below).
  - The Box is checked as a Mark's is (`scans.ts`: whole pixels, within the Image, using its size from the Scan cache).
  - Refused for a person whose Citation already links that Image (spec: such people aren't offered).
- **A source record per Volume:** the first Citation made in a Volume adds a source titled with the Volume's label, published by Kansallisarkisto in Astia; later ones reuse it. The source is marked as made in the app. In the GEDZIP it carries `NOTE Added in Sukulinja`, like a Citation; the 5.5.1 export leaves that note out, as it does for Citations.
- **Delete:** an API call removing a Citation made in the app, with its notes. Refused for an imported Citation. A per-Volume source no Citation cites any more goes too.
- **Read it back:** a Citation made in the app has no Church-book reference to resolve (its page is an Astia address), so its Link is its Annotation's, Marked at the entry:
  - `ofPerson` lists it, saying it was made in the app;
  - `linksOf` gives its Link straight from the Annotation, without asking Astia;
  - `inVolume` lists it with the Volume's other rows, so it shows beside the scan.
- **The merge carries the app's sources.** A Citation made in the app is reattached only when its source is in the new export. A per-Volume source the new export doesn't have (a re-import from MyHeritage with no upload in between) is copied into it, so the Citation isn't lost. One the export has, after an upload, is matched as other sources are.
- **Schema 7** for the sources' made-in-the-app column, with a one-off script like `rename-original-page` (`git show 4018d81 -- scripts/rename-original-page`) to move the data folders across, deleted once it has run.

## Tests

- Creating one: the row, its Annotation, its page, and its source; a second in the same Volume reuses the source.
- A Box off the Image, and a person already citing the Image, are refused.
- Deleting one, and its source going with the last Citation; an imported Citation can't be deleted.
- `ofPerson`, `linksOf` and `inVolume` include it, with its Link Marked at the entry.
- The round trip (`gedcom-export.test.ts`) keeps it and its source; the 5.5.1 export leaves out the source's note.
- `import-merge.test.ts`: a re-import of an export without the source keeps the Citation and its source; one with the source doesn't duplicate it.
- The script: a schema 6 database becomes a schema 7 one that opens.

## Not here

- The Scan viewer's menu, Box and text field (02), and the person panel (03).
- Hanging it on a fact of the person.
