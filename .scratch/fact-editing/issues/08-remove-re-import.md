Status: ready-for-agent

# Remove the re-import: the merge, Undo last import and the import review

Spec: `.scratch/fact-editing/spec.md`, decision 1. Ticket 01 refuses an import over a current dataset but still merges into one an older version built (before schema 1), so what the app made there is kept.

- First check with Heikki that no dataset, in dev or the installed app, is still outdated; then the exception goes too.
- Remove `import/merge*.ts`, `registry.previous`, `keepBefore`, `undoImport`, the review round trip in `lifecycle-routes.ts` and `app/import-review.ts`, and _Undo last import_ in the row menu and dialogs.
- Keep the `import` and `undo-import` Change kinds, as old Changes still say them.
- Update ADR-0013's re-import part to point at ADR-0021.
