Status: needs-triage

# Create a Citation while browsing a scan

Glossary: **Citation**, **Church-book reference**, **Mark**, **Box**, **Scan viewer**.

While stepping through a Volume in the Scan viewer you find entries for people in the tree that nothing cites yet: a sibling's baptism, a household in the next rippikirja. Today all Citations come from the MyHeritage import, so you can't record what you found.

## Why it's more than a Mark

A Mark only pins where an existing Citation points; pins live in the data folder. A new Citation is new genealogical data, which the app has never written. That runs into `../../gedcom-export/issues/01-storage-not-lossless-for-export.md`: SQLite is a display projection rebuilt from the import, so a Citation made in the app needs somewhere to live that survives a re-import and can be exported later.

## Open questions (decide before agent work)

- Where an app-made Citation is stored, and how it survives re-importing the MyHeritage export. This is the same storage decision as the GEDCOM export issue.
- What it holds: parish, Book, years, page, the Volume / Image / Box it was made on, and the fact it supports (birth, residence…) or only the person.
- Who it's for: the Selected person, or anyone in the tree (needs a person picker in the viewer).
- How it's made: likely the Link-editing flow in the Scan viewer (pending Box, Cancel / Save in the nav, right-click menu): right-click → "Cite this entry for…", draw or reuse a Box, Save. Placing a Box doesn't depend on whose source it is, and the pending Box is kept apart from the stored Citation, so a new Citation can go through the same flow. Whether a new Citation is a pending change like the rest.
- How it shows in the person panel beside the imported ones, and whether it's marked as made in the app.

## Comments

**Storage decided 2026-10-21** in `docs/adr/0013-database-holds-the-tree-gedzip-carries-it.md`: an app-made Citation is a row in the dataset's database like an imported one, with its Astia link written into it the same way a Mark is. A re-import of the MyHeritage export reattaches it to the same person by `UID` (or record id), and drops it if the new export has the same Citation. The first open question is answered; the rest still stand.

**Merge built 2026-10-21** (f8965b7): a citation made in the app is a `citations` row with `added_in_app = 1`. A re-import reattaches it to its person, or to the same fact of theirs, and the GEDZIP carries it as `NOTE Added in Sukulinja`.

**Open from the Annotation refactor 2026-10-22:** Discarding the Box of a Citation made in the app. It has no original page to go back to and no MyHeritage reference to estimate from, so today's rule would leave it citing the Astia address with no Link. Decide what a Discard does to one: keep the Mark at the Image without its Box, drop the Citation, or refuse.
