Status: needs-triage

# An Entry's kind and owner stay as saved

Glossary: **Entry**, **Entry pane**, **Event**, **Role**, **Support**, **Fact** (`src/server/citations/GLOSSARY.md`). Decision: ADR-0037. Builds on ADR-0022 (support), ADR-0026 (Entries), ADR-0033 (the Entry pane's lines).

Heikki, 2026-11-26, after an architecture review of how Facts, Citations and Entries are kept in step: support the Entry pane can't show is left by a Role or kind changed and by the assistant, and editing a marriage makes its couple a family again. Rather than tidy that up after each change, a saved Entry keeps its kind and owner.

## Tickets

- `01` Kind and owner locked, a change saving a new Entry.
- `02` An Entry's Citation supports only its owner's Facts.
- `03` The Entry pane says where the tree differs from the Entry.
- `04` A save refused when the tree changed since its lines were listed.
- `05` Support left by earlier Role and kind changes.

Tree-quality checks for the same (check 11 widened, two Facts of a kind) are in `.scratch/tree-quality/spec.md`.
