Status: needs-triage

# An Entry table, read through the Annotation

Spec: `../spec.md`. ADR-0026.

- Schema migration: `entries` table, `citations.entry_id REFERENCES entries(id)`.
- The migration makes one Entry of the app's Citations of an Image (`added_in_app = 1`, `link_image` not null) with the same source, `link_file_id`, Box, `event` and `text`, moves those columns onto it and empties them on the Citations.
- `annotations.ts` reads a Citation of an Entry joined to it, so `CitationRow`, the export, Record pins and the Scan viewer see the same values as before.
- Moving a Citation's Box (`app-citations.move`) moves its Entry's.

Done when: existing tests pass unchanged; a migration test groups identical copies into one Entry and keeps different Boxes apart.
