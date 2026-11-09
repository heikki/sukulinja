Status: ready-for-agent
Blocked by: 01

# Write Marks only to references; read Record pins from converted Citations too

Spec: `.scratch/convert-myheritage-citations/spec.md`. Glossary: **Mark**, **Discard**, **Record pin**, **Reference pin**, **Record range** (`src/server/citations/GLOSSARY.md`).

`myheritage/pins/marks.ts` indexes every citation whose original page is a MyHeritage church-book URL, and `write` swaps the Link of all of a key's citations. A converted Citation keeps its MyHeritage original page, so a later Mark of the same record would overwrite it.

- **Split the index**: the citations a Mark or Discard writes to (references only: not made in the app), and those read as Record pins and Reference pins (references and app-made Citations with a MyHeritage original page).
- The Record pins of converted Citations keep extending their Volume's Record range, so the Estimates of their neighbours on the Film don't change.
- No change in behaviour for today's datasets, which have no such Citations.

## Tests

- With an app-made Citation whose original page is a record's URL: a Mark of another citation of that record leaves it alone, and its Record pin still extends the Record range.

## Comments
