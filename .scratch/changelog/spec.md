Status: needs-info

# The Changes: what was done in the app, each a way back to it

Glossary: **Mark**, **Match**, **Discard**, **Rejection**, **Citation**, **Image**, **Box**, **Re-scan**, **Reminder**, **Scan viewer** (`src/server/citations/GLOSSARY.md`). ADRs: 0004, 0012, 0013.

Working through the books, you Mark, Discard and cite dozens of entries in a sitting, and an import can move a lot under you. Afterwards there's no way to see what you did, or to get back to the person or Image you were on an hour ago. The **Changes** list is every change the app wrote to the dataset, newest first, each naming where it was done, and picking one goes there.

## Proposed (not yet decided)

- **Name:** a **Change**, listed under _Changes_. Not "log" or "history" in the UI, which read as a debugging aid or as browser Back. Added to the glossary.
- **What's a Change:** what you do in the app that changes the dataset:
  - a **Mark**, by hand or by confirming a **Match** (said apart: _Marked_, _Confirmed the Match_), at the entry, the Image or only the Volume, with how many Citations of the record it was written into;
  - a **Discard**, and whether it made a **Rejection**;
  - a Citation made in the Scan viewer, and one deleted;
  - an import merged into the dataset, with its file name and what the review said was kept and lost;
  - _Undo last import_.

  Not logged: Reminders (they are their own list already, with open and done); the vision pass's Matches (a script, not the app, and it writes thousands); a view change (selecting someone, panning).

- **Shared facts ride on the Change that made them.** A Page pin saved by a Mark is said in that Mark's Change (_also pinned page 463_), not logged on its own. A **Re-scan** switch is shared by every dataset and made through a shared route; see the open question below.
- **Per dataset, in its database.** A `changes` table, like `reminders`: when, what kind, what it was on (a person, a Citation, an Image as Volume id, label, Image number and file id), and a short text written when it happened (the person's name and years, the source, the Volume and Image) so it still reads once what it was on is gone. Bump `SCHEMA_VERSION`, so each dataset is imported again once, as for Reminders; the merge reads the older database as it does today.
- **App only.** No export writes it, like Rejections and Reminders (ADR-0013 gets the line).
- **Import and Undo.** The log lives in the database and is rewound with it, on purpose: the list then always tells the story of the database you have.
  - An import's merge carries the Changes like Reminders: on a person by `UID`, on a Citation through the pairing, onto its person when the Citation is gone. One whose person is gone stays in the list with its text, but leads nowhere. Nothing is dropped, and nothing is added to the review.
  - The merged import then writes its own Change.
  - _Undo last import_ puts the old database back, with its Changes as they were (the import's Change and everything after it go with it), then writes an _Undid the import of …_ Change into it.
- **Going back.** Picking a Change goes where it was done, the same way picking a Reminder does (`follow` in `reminders-dialog/helpers.ts`, moved somewhere both share):
  - a Mark, Discard or new Citation: selects the person and opens the Citation's source in the Scan viewer, at its Link as it stands now;
  - a deleted Citation: selects the person;
  - an Image: opens the Scan viewer on it; one from an earlier filming is flagged and leads nowhere;
  - an import or undo: leads nowhere.

  Not a URL: the chart's hash (ADR-0004) only holds Root, pan and zoom, not the Scan viewer, and the app has no address bar to share one from.

- **Only for finding your way.** No undo from the list. Taking a Mark back is a Discard, done in the Scan viewer where you can see it.
- **Where it's shown.** A clock button beside the Reminders flag and the Settings gear opens a floating dialog like the Reminders list: grouped by day, each row the time, what was done and where (_Marked at the entry · Juho Mikonpoika (1771–1832) — Mikkeli I Aa:5, Image 232_). Shown once the dataset has any Changes.
- **How long kept.** All of them. A row is a few hundred bytes; a year of work is far under a megabyte.

## Open questions

- **Re-scan.** Switching a Volume to its new filming is done in a dataset's Scan viewer but changes every dataset. Options: (a) leave it out for now; (b) log it in the dataset it was switched from, by moving the switch behind a dataset route. Proposed: (b), since it's what leaves that dataset's Marks on the Volume stale, and the Change is where you'd look for why.
- **Several Changes at once.** Marking every Citation of a record writes into each, but it's one action. Proposed: one Change per action, on the Citation you acted on, with the count.

## Refactor first

Built on today's code, Changes would be bolted on in three places. Each of these is worth doing on its own first, with no change in behaviour:

1. **"What it's on" as its own module.** A Reminder's target (a person, a Citation, or an Image by Volume, label, number and file id) is a Change's too: the columns, checking the target exists, describing it (`onOf` in `reminders/reminders.ts`, with staleness after a Re-scan), carrying it through the merge (`carryReminders` in `import/merge.ts`), and on the client naming it, going to it and telling whether the Scan viewer shows it (`onLabel`, `follow`, `shows` in `reminders-dialog/helpers.ts`). Today all of that is written for Reminders alone. Lift it into a shared server module and a shared client one, with Reminders using them; then the merge carries any app-only table that's on something with one function, and Changes reuse the rest instead of copying it.
2. **Write verbs say what they did.** `mark`, `discard`, `cite` and `uncite` answer with the Link as it now stands, not with what changed: whether a Mark confirmed a Match, how many Citations it was written into, whether it saved a Page pin, whether a Discard made a Rejection. A Change has to know that, and working it out again from the outside would duplicate the verbs. Have them return an outcome beside the Links, so Changes can be written at one seam where the dataset's routes are put together (`server.ts`), not inside each verb.
3. **The Re-scan switch through the dataset** (only if the open question goes to (b)): today it's a shared Astia route that knows no dataset.

## Tickets once decided

0. **The refactors above**, one commit each, existing tests passing unchanged.
1. **Changes on the server**: the table, writing one from each verb (`citations.mark`, `discard`, `cite`, `uncite`, the registry's import and undo), the route to list them, the `DatasetApi` call, the merge. Tests: each verb writes its Change; a re-import carries them and keeps one whose person is gone; Undo rewinds and adds its own; no export has a trace.
2. **The Changes dialog**: the button, the dialog, going back from a row, sharing `follow` with Reminders. Tests: the helpers (labels, grouping by day, where a row leads) without the DOM, as Reminders' are.

## Comments
