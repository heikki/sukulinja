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
- **A source record per Volume:** the first Citation made in a Volume adds a source titled with the Volume's label, published by Kansallisarkisto in Astia. Later ones reuse it: a Volume's source is the one cited by the Citations made in the app whose link is in that Volume. Nothing marks the source itself as the app's; no new column, and no schema change.
- **Delete:** an API call removing a Citation made in the app, with its notes. Refused for an imported Citation. A per-Volume source no Citation cites any more goes too.
- **Read it back:** a Citation made in the app has no Church-book reference to resolve (its page is an Astia address), so its Link is its Annotation's, Marked at the entry:
  - `ofPerson` lists it, saying it was made in the app;
  - `linksOf` gives its Link straight from the Annotation, without asking Astia;
  - `inVolume` lists it with the Volume's other rows, so it shows beside the scan.
- **The merge carries a reattached Citation's source.** Today a Citation made in the app is reattached only when its source is in the new export. When it isn't (a re-import from MyHeritage with no upload in between), its source is copied into the new import with it, once however many Citations cite it, so the Citation isn't lost. A source the export has, after an upload, is matched as other sources are. A source cited only by imported Citations is never copied, so one removed in MyHeritage stays gone.

## Tests

- Creating one: the row, its Annotation, its page, and its source; a second in the same Volume reuses the source.
- A Box off the Image, and a person already citing the Image, are refused.
- Deleting one, and its source going with the last Citation; an imported Citation can't be deleted.
- `ofPerson`, `linksOf` and `inVolume` include it, with its Link Marked at the entry.
- The round trip (`gedcom-export.test.ts`) keeps it and its source.
- `import-merge.test.ts`: a re-import of an export without the source keeps the Citation and copies its source once for two Citations; one with the source doesn't duplicate it; an imported source the export dropped isn't brought back.

## Not here

- The Scan viewer's menu, Box and text field (02), and the person panel (03).
- Hanging it on a fact of the person.
