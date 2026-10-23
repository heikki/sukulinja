Status: ready-for-agent

# Reminders on the server: the table, the routes and the merge

Spec: `.scratch/reminders/spec.md`. Glossary: **Reminder**, **Citation**, **Image**, **Re-scan** (`src/server/citation-scans/CONTEXT.md`).

- **A `reminders` table** in `src/server/db.ts`: the text, what it's on (a person, a Citation, or an Image as Volume id, Volume label, Image number and file id), when it was written, and when it was marked done (null while open). Bump `SCHEMA_VERSION`.
- **Routes** to list a dataset's Reminders, add one, edit its text, mark it done or reopen it, and delete it. Each Reminder comes back with what it's on, described: the person's name and years, the Citation's source, or the Volume and Image, and for an Image whether it's stale, its file id no longer in the Volume's current filming.
- **The `DatasetApi`** (`src/client/dataset-api/`) gets the matching calls, over HTTP and in memory.
- **The merge** (`src/server/import-merge.ts`) carries Reminders as the spec says: on a person by the same matching as app-made Citations, on a Citation through the pairing, falling back onto its person, and on an Image unchanged. One whose person is gone is described in the review's `lost`; `ImportReview.kept` counts the rest.
- **No export or import** reads or writes them. Add the line to ADR-0013 beside Rejections.

## Tests

- Round trip of the routes on a fixture dataset.
- A re-import keeps a person's Reminder, moves a Citation's onto the paired Citation, falls back onto the person when the Citation is gone, and lists one whose person is gone.
- The GEDZIP and MyHeritage exports have no trace of a Reminder.

## Comments
