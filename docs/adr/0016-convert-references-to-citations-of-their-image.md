# A reference Marked at the entry becomes a Citation of its Image

A **Church-book reference** from MyHeritage reaches its scan through everything in `src/server/citations/myheritage/`: Record ranges, Page pins, Record and Reference pins and the vision pass. The MyHeritage import is to be given up step by step, and the folder with it. A reference Marked by hand at the entry already cites its Image (ADR-0013); it differs from a Citation made in the Scan viewer only by its source, its text, `added_in_app` and `original_page`.

Such a reference is now converted into a Citation of its Image, its **Conversion**, in the columns it has today:

- **It's the app's.** `added_in_app` is set, and **a Citation made in the app is never a Church-book reference**, whatever its pages.
- **It cites the Volume's source** (Kansallisarkisto, Astia), the one a Scan viewer Citation in the Volume cites.
- **Its text is the record's transcription as plain lines**, read once at conversion: name, the shown fields, the household rows.
- **Its original page keeps MyHeritage's URL.** On an app-made Citation, the original page is the page it cited before it cited the Image: its provenance in the GEDZIP's `NOTE Original page:`, and the key a re-import knows it by.
- **When:** a hand Mark at the entry, or confirming a Match, converts every citation of the record. A one-off script converts those already Marked. A Mark at the Image or the Volume only, an unchecked Match, an Estimate and an Unlinked reference stay references.
- **Re-importing:** before pairing (ADR-0013), an app-made Citation with an original page replaces the export's citation of the same person at that page, under another source. A new reference of a record already converted is converted at import.
- **It still counts as a Record pin**, read by its original page, so its Film's other Estimates don't get worse. No Mark or Discard writes to it.
- **It can't be deleted**, as an imported citation can't: the next MyHeritage import would bring the reference back unmarked. Its Box moves within its Volume.
- **The dataset's parish archives** come from its remaining references and the Volumes its Citations of Images cite.
- **Exports write nothing new**: a Scan viewer Citation with `NOTE Original page:`.

## Considered options

- **A new column marking a converted Citation.** Rejected: `added_in_app` and `original_page` already say it, every path for app-made Citations (export, the 5.5.1 file leaving out _Added in Sukulinja_, moving a Box) applies as it is, and a schema change would mean re-importing every dataset.
- **Keep MyHeritage's source and text, and only stop reading it as a reference.** Rejected: a re-import takes the source program's part from the new export, so the record's text would come back each time, and the folder's reader would have to stay to show it.
- **Convert one Citation at a time, from a _Convert_ action.** Rejected: there's no reason to leave a reference Marked at the entry unconverted.
- **Convert a Match without confirming it.** Rejected: a Citation would claim what only the model said.
- **Let the re-import bring the reference back beside it.** Rejected: a duplicate per conversion, every import.
- **The tree's places as the dataset's parishes.** Rejected: place names don't map reliably to Astia's parish archives.
- **Allow deleting a converted Citation.** Deferred until the MyHeritage import has stopped, when nothing would bring the reference back.

## Consequences

- `citations.ts` reaches references only through a port the MyHeritage folder implements; an empty one replaces the folder in the end.
- A Volume's source is found by its own record, not by which Citations cite it.
- The Scan viewer offers _Delete_ by a Citation's `deletable`, not by `madeInApp`.
- The folder, `link_by = 'vision'` and the `rejections` table go in one schema change, once the MyHeritage import has stopped and no reference is left.
