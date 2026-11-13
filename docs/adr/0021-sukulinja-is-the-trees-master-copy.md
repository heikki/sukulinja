# Sukulinja is the tree's master copy, and the MyHeritage import ends

ADR-0013 made the database the dataset's master copy, but only of what the app adds: the tree itself, its people, families and Facts, came from the source program, and a re-import took that part from the new export. That's why the app can't edit a Fact, can't delete an imported Citation, and can't delete a converted one (ADR-0016): the next MyHeritage import would bring it back. Heikki decided (2026-11-11) to cut the MyHeritage connection. Facts are to be added, edited and deleted in the app, and people added to the tree.

So the tree is now worked on only in Sukulinja:

- **No more imports into a dataset.** An import into a dataset that exists would take the tree from the export and lose what was edited in the app. The MyHeritage conversion (`import/myheritage.ts`) can still read an export into a new dataset, until it's removed.
- **Everything in the tree can be edited.** Facts first, then people, names and relationships. Each edit writes a **Change** (ADR-0013), which now also stands in for the history the source program kept.
- **An imported Citation can be deleted**, a converted one too (ADR-0016's deferral is lifted), since nothing brings it back. `added_in_app` stays as provenance, written as `NOTE Added in Sukulinja`, but no longer decides what may be deleted.
- **The Church-book references stay until they're Marked.** About 3 200 of them in ylonen (2026-11-11), 1 450 with a Match. They still reach their scans through `citations/myheritage/`, and a Mark at the entry still converts them (ADR-0016). The folder, `link_by = 'vision'` and `rejections` go once no reference is left, as ADR-0016 says; the end of the import is no longer what they wait for.
- **The GEDZIP export is the backup and the way out.** Unchanged: it holds the whole tree and what the app made but Rejections, Reminders and the Changes.

## Considered options

- **Keep re-importing, with a merge that handles conflicts** (ADR-0013's deferred option). Rejected: MyHeritage stays the master only if every correction is made there, which is the work Heikki wants to do in the app, and a merge of two edited trees is a lot of code for a round trip nobody makes.
- **Keep MyHeritage the master and add only Citations and Tags in the app.** Rejected: that's where the app is now, and it's what stops fact editing.
- **Remove `citations/myheritage/` with the import.** Rejected: the references not yet Marked would lose their way to the scans, and the Matches with them.

## Consequences

- **An import only makes a new dataset** (Heikki, 2026-11-11): the merge, _Undo last import_ and the import review go, and a GEDZIP backup is restored as a new dataset. The GEDCOM 5.5.1 export for MyHeritage goes too, as nothing is uploaded back.
- The glossary's **Fact** no longer says the app doesn't edit one, and the **Annotation**'s "a re-import keeps it" goes with the re-import.
- Converting a converted record's new references at import has nothing left to do, and goes with the import.
- The placeless RESI Facts MyHeritage made from record matches (`.scratch/citation-practices/fact-citations.md`) can now be deleted for good, by a one-off script, as a decision of its own.
