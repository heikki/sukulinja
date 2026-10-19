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
- How it's made: likely the Link-editing flow (`../../link-editing/spec.md`): right-click → "Cite this entry for…", draw or reuse a Box, Save. Whether a new Citation is a pending change like the rest.
- How it shows in the person panel beside the imported ones, and whether it's marked as made in the app.
