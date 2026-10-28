Status: needs-triage

# Convert MyHeritage references to Citations of their Image

Glossary: **Citation**, **Church-book reference**, **Index reference**, **Annotation**, **Mark**, **Match**, **Link**, **Image**, **Volume**, **Record pin**, **Reference pin**.

## The goal

A Citation made in the app cites an Astia Image directly: its page is the Image's Astia URL, and its Link at the entry is stored on it. A Church-book reference from MyHeritage instead points at a record in a MyHeritage collection, and reaching its scan takes reading the record, the Record ranges, Page pins and Record and Reference pins, and a vision pass. The end goal is for the user to turn each reference into a Citation of its Image, after which nothing needs that machinery.

The server keeps it apart for this: everything about MyHeritage's references is in `src/server/citations/myheritage/`, reached only through its `index.ts`, so the folder can go once no reference is left.

## Already there

- **A hand Mark half-converts its citations.** It rewrites `page` to the Image's Astia address, stores the Link at the entry, and keeps MyHeritage's URL as the original page (ADR-0013). Such a citation then differs from one made in the app only by its source, its text, `added_in_app` and `original_page`.
- **What the database holds only for references**: `citations.original_page`, a Link's `link_by = 'vision'` (a Match), and the `rejections` table. Nothing marks a citation as a reference; it's read from its page each time. Once none is left to convert, all three can go in one schema change.

## Open questions

- **Which references convert.** Only one Marked at the entry, with its Box? A Match the vision pass saved, unconfirmed? One linked only to its Volume, or estimated to an Image, has no entry to cite.
- **One at a time or all at once.** From the panel or the Scan viewer for one Citation, or every reference Marked at the entry in one go.
- **What the Citation keeps.** Its page becomes the Image's URL; does MyHeritage's page stay, as the original page a Mark moves aside does now? The record's transcription as its text? Its source MyHeritage's collection, or the Volume's (Kansallisarkisto, Astia), as for one made in the app?
- **A re-import from MyHeritage.** The export still carries the reference. Does the merge recognise a converted Citation and leave the reference out, convert it again, or bring it back beside it? (ADR-0013's merge matches imported citations by their page.)
- **Parishes.** Citations of Images learn the dataset's parishes, and so its Astia archives, from its references: the Volume being cited must be in one of them. With no references left, they need another source: the Volumes the Image Citations are in, or the tree's places.
- **Exports.** What a converted Citation is in the GEDZIP and in the GEDCOM 5.5.1 file MyHeritage reads (ADR-0013 notes every citation could later be written in the recommended `PAGE` form).
- **When the folder can go.** As long as the tree is imported from MyHeritage, new references arrive with each import. Does the import convert them, or does the folder stay for as long as MyHeritage is the source?
