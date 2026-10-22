Status: needs-triage

# Check an imported tree for likely mistakes in the records

Glossary: **Citation**.

Some mistakes in the tree only show once you go looking: ylonen has 28 groups of citations (91 in all) that repeat the same person, source and page, 6 of them word for word. A check run over a dataset would list them so they can be fixed where the tree is edited (MyHeritage, today).

It reports and never corrects: the app renders the records as recorded.

## Candidate checks

- The same citation more than once on a person or family (same source and page; same text too).
- A person in the same family twice, or a child born before a parent.
- A death before a birth, or a fact dated after death.
- Lines the import couldn't store (stored since 2dfda4d), so a new export's gaps show in the same report.

## Open questions

- A script (`scripts/check-tree`, writing a Markdown or HTML report into `data/`, like `deaths-to-resave.html` and `no-birth-year.html`), or part of the import's summary in the app?
- Which checks are worth it beyond duplicate citations.
- Whether the report links each finding to the person in the app (`#/person/<id>`).
