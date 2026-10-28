Status: needs-triage

# Change the parish in the Scan viewer, as well as the Volume

Glossary: **Scan viewer**, **Church-book reference**, **Book**, **Volume**, **Mark**, **Unlinked** (`src/server/citations/CONTEXT.md`).

_Change Volume…_ in the scan's menu (`scan-viewer/volumes.ts`) lists only the Volumes of the reference's own Book in its own parish (`volumeChoices` in `citation-scans/scans.ts`). An entry is sometimes in another parish's books: a chapel parish kept in its mother parish's, a family that moved, a reference that names the wrong parish. There's no way to look there from the viewer.

Let the viewer show another parish's Volumes too.

## Open questions

- **Which parishes.** Those the app knows an archive for (`parishArchive` in `citations/astia/archives.ts`), searched by name, or the reference's neighbours first (mother parish, chapel parishes).
- **The menu.** A separate _Change parish…_ beside _Change Volume…_, or a parish step at the top of the Volume list.
- **Which Book.** The reference's own kind of Book in the other parish, or every kind.
- **Marking there.** A Mark is refused outside the reference's parish ("That Volume isn't in this parish's church books.", `refusal` in `scans.ts`). Allow it, so the Mark says where the entry really is, or keep another parish for looking only.
- **Unlinked, no archive known.** A reference whose parish has no known archive opens on no Volume; choosing a parish could be how it gets one.

## Comments
