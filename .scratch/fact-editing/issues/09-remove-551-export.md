Status: ready-for-agent

# Remove the GEDCOM 5.5.1 export

Spec: `.scratch/fact-editing/spec.md`, decision 2. Nothing is uploaded back to MyHeritage.

- Remove `export/gedcom551.ts` and its test, the `myheritage` ExportKind, `…/export-myheritage` in `lifecycle-routes.ts` and the menu item in `app/exports.ts`.
- ADR-0013's last export bullet points at ADR-0021.
