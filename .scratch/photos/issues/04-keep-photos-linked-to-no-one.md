Status: needs-triage

# Keep the Photos an import links to no one

Spec: `../spec.md`. Glossary: **Photo**.

Heikki, 2026-11-11: an import's Photos linked to no one should be kept ("pitäisi säilyttää").

Today an import keeps only the Photos under people and families: `allMediaRefs` in `gedcom/media-refs.ts` walks `INDI` and `FAM`, and the media ingest copies only what it finds. An `OBJE` record nothing points at is dropped with its file.

Every `OBJE` record is kept instead: a `media` row with its file copied, with no `media_links` when nothing holds it. The GEDZIP export writes it back as an `OBJE` record, so a dataset exported and imported again keeps it.

Not here: a photo a source record holds (a picture of the source itself) is dropped today too, but it isn't linked to no one; it's a case of its own, if it ever comes up.

## Done when

- A GEDCOM with an `OBJE` record nothing points at imports with that Photo and its file, and exports it back.
- A re-import keeps it, as it keeps the export's other Photos.
