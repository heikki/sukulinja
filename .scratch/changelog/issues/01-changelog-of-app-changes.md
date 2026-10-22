Status: needs-triage

# A changelog of what was done in the app

Glossary: **Mark**, **Match**, **Discard**, **Citation**, **Rejection**, **Scan viewer**.

Idea: keep a log of the changes made in the app (a Mark saved, a Discard, a Citation made or deleted, an import merged or undone, a Volume switched to a new filming), each naming where it was done, so you can go back to that person, Citation or Image from the log.

## Open questions

- **What gets logged.** Changes the app writes to a dataset only, or also shared ones (Page pins in `pins.local.json`, a re-scan switch, which every dataset sees).
- **Per dataset or shared.** Most changes belong to one dataset's database; the shared ones don't.
- **Going back.** What "return to" opens: the person selected on the chart, the person panel, the Scan viewer at the Image and Box. The chart's URL already keeps view state (ADR-0004), so an entry could be a link.
- **Import and undo.** An import's merge replaces the database (ADR-0013) and Undo last import puts back the old one, so a log kept inside the database is rewound with it. Decide whether that's wanted, or the log lives beside the database.
- **Undo from the log.** Whether an entry can be undone (a Mark taken back), or the log is only for finding your way.
- **Related.** Reminders (`.scratch/reminders/`) want a similar "list of things, each one a link back".

## Comments
