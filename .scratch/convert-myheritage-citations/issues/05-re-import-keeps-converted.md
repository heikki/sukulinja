Status: ready-for-agent

# Keep a converted Citation through a re-import

Spec: `.scratch/convert-myheritage-citations/spec.md`. Glossary: **Citation**, **Annotation**, **Conversion** (`src/server/citations/GLOSSARY.md`). ADR-0016.

Today the merge (`src/server/import/merge.ts`) pairs citations by person, source and original page. A converted Citation cites the Volume's source, so it wouldn't pair: it would be reattached as app-made, and the export's reference would come back beside it.

- **A new rule, ahead of pairing:** an app-made Citation with an original page replaces the export's citation of the same person at that page, under another source. The export's row is dropped with its notes and media, and the stored Citation is reattached as app-made Citations are now. Rows alike are taken in order, the first with the first.
- `ImportReview.kept` gets a `converted` count, shown with the others in the import review.
- The rule compares page strings only: it needs nothing from `myheritage/`.
- ADR-0013's matching section points at ADR-0016.

## Tests

- A re-import of the same export keeps the converted Citation once, with its source, text and Link, and no reference beside it.
- An export without the reference still keeps the converted Citation.
- A Reminder on the converted Citation stays on it.

## Comments
