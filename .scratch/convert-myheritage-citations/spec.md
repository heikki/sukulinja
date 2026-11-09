Status: ready-for-agent

# Convert MyHeritage references to Citations of their Image

Glossary: **Citation**, **Church-book reference**, **Annotation**, **Mark**, **Match**, **Link**, **Box**, **Image**, **Volume**, **Record pin**, **Conversion** (`src/server/citations/GLOSSARY.md`). Decision: ADR-0016, amending ADR-0013.

A Citation made in the Scan viewer cites an Astia Image directly. A Church-book reference from MyHeritage points at a record in a MyHeritage collection instead, and reaching its scan takes the Record ranges, Page pins, Record and Reference pins and the vision pass, all in `src/server/citations/myheritage/`. The MyHeritage import is to be given up step by step. Each reference Marked at the entry is turned into a Citation of its Image, its **Conversion**, until no reference is left and the folder can go.

## Decided 2026-11-09

- **Which convert:** only a reference Marked by hand at the entry, with its Box. A Match converts once it's confirmed, which is a Mark. One Marked at the Image or the Volume only, an Estimate, or an Unlinked reference stays a reference until it's Marked at the entry. A Mark is of a record, so every citation of the record converts together; afterwards each moves on its own.
- **When:** a one-off script converts every reference already Marked at the entry, and is deleted afterwards. From then on, saving a Mark at the entry, by hand or by confirming a Match, converts. No separate _Convert_ action.
- **What a converted Citation is**, in the columns it has today (no schema change):

  | Column               | Marked reference                | Converted Citation                                                                |
  | -------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
  | `page`               | Astia Image URL                 | Astia Image URL                                                                   |
  | link, Box, `link_by` | hand, at the entry              | hand, at the entry                                                                |
  | `source_id`          | MyHeritage collection           | the Volume's source (Kansallisarkisto, Astia), as a Scan viewer Citation's        |
  | `text`               | MyHeritage's HTML transcription | the transcription as plain lines: name, the shown fields, then the household rows |
  | `original_page`      | MyHeritage URL                  | MyHeritage URL, kept                                                              |
  | `added_in_app`       | 0                               | 1                                                                                 |

- **A Citation made in the app is never a Church-book reference.** On an app-made Citation, `original_page` is the page it cited before it cited the Image: the key a re-import recognises it by, and its provenance in the GEDZIP's `NOTE Original page:`.
- **Plain text is enough.** The household table's layout in the panel is lost; its words aren't. No record reader is kept outside the folder.
- **A re-import** drops the export's citation of the same person at a converted Citation's original page, under another source, with its notes and media, and reattaches the converted Citation as an app-made one. The review counts it kept. MyHeritage round trips (uploading the 5.5.1 file back) aren't a workflow, so ADR-0013's duplicate rule is enough for them.
- **Parishes:** the dataset's parish archives are the remaining references' parishes, and the archives holding the Volumes its Citations of Images cite, found among the known parish archives (`astia/archives.ts`). Not the tree's places.
- **Exports:** nothing new. The GEDZIP writes it as a Scan viewer Citation plus `NOTE Original page:`. The 5.5.1 file writes the Astia URL as `PAGE`, with no Box and no _Added in Sukulinja_ note, as now. The recommended `PAGE` form stays deferred.
- **No deleting a converted Citation, for now.** `uncite` refuses an app-made Citation with an original page, as an imported one can't be deleted: the next MyHeritage import would bring the reference back unmarked. Its Box can still be moved within its Volume. It may be allowed once MyHeritage imports have stopped.
- **Record pins stay.** A converted Citation still counts as a Record pin of its record, read by its original page, so the Estimates of its neighbours on the Film don't get worse. No Mark or Discard writes to it.
- **New references of a converted record** convert at import: a new person citing a record a converted Citation cites gets that Citation's Link and is converted.
- **The folder goes** with `link_by = 'vision'` and the `rejections` table, in one schema change, once the MyHeritage import has stopped and no reference is left.

## Refactors first

The knowledge of what a reference is leaks out of `myheritage/`. These change no behaviour and land before the Conversion (tickets 01–04):

1. **A References port.** `citations.ts` reaches references only through an interface `myheritage/index.ts` implements, and no longer reads MyHeritage records itself (`contentOf`).
2. **The dataset's parish archives** in a module of their own, not `parishes()` inside `citations.ts`.
3. **A Volume's source by its record**, not by which app-made Citations cite it.
4. **Marks write only to references**, while Record pins are read from references and converted Citations.

## Tickets

| #   | Ticket                                                 | Blocked by |
| --- | ------------------------------------------------------ | ---------- |
| 01  | References port                                        | none       |
| 02  | Dataset parish archives                                | 01         |
| 03  | A Volume's source by its record                        | none       |
| 04  | Marks write only to references                         | 01         |
| 05  | Re-import keeps a converted Citation                   | none       |
| 06  | Convert on a Mark at the entry                         | 01–05      |
| 07  | Convert every reference Marked at the entry, once      | 06         |
| 08  | Convert new references of a converted record at import | 06         |
