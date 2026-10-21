Status: ready-for-agent

# Save each pin's file id, and ignore pins made on another filming

Parent: `01-detect-a-rescan.md`. Glossary: **Page pin**, **Record pin**, **Reference pin**, **Box**, **Rejection**, **Provenance**, **Estimated**.

A pin says "on Image n of this Volume". After a re-scan, Image n is another page, so a pin from the old filming points at the wrong Image, and its Box at the wrong place on it.

## Do

- `PagePin`, `RecordPin`, `ReferencePin` (with an Image) and `Rejection` get an optional `fileId`: the id at their Image number in the Volume's list when saved. The Image number stays: estimates count from it.
- **Saving**: a Mark (`markRef` already loads the list to check the Image), a Vision match (`scripts/match-citation-scans/run.ts`) and a Discard's Rejection all save the file id.
- **Reading**: a pin is current when it has no file id, or its file id is the list's id at its Image number. Resolution (`locate.ts`) leaves out pins that aren't: Page pins aren't counted from, a Record or Reference pin gives no Link, so the reference falls back to its estimate. A Reference pin to the Volume alone has no Image and is never stale. Record ranges and villages aren't about Images and stay. A Rejection that isn't current no longer rejects.
- **Merging**: a stale hand pin must not block a new vision or hand pin in the same Volume (`overrides` in `pins.ts`), or the vision pass would pay for matches it can't save. The saver passes the Volume's list in, so the store can leave stale pins out of the clash.
- **Backfill**: a one-off script fills in `fileId` on every pin that lacks one: the shipped `pins.json` from Astia's current lists (fetched fresh; the 2026-10-20 check found them current), and a data folder's `pins.local.json` from that folder's own cached lists, the ones its pins were made against. Run it on both data folders.
- **Glossary**: a Pin holds for one filming of a Volume; add **Re-scan** (Astia replacing a Volume's Images, with new file ids) and say how a stale pin is treated.

## Tests

- Resolution with a Record pin, Reference pin or Page pin whose file id no longer matches gives the estimate, not the pin.
- A pin without a file id still counts.
- A Mark and a Vision match save the file id; a Mark over a stale hand pin replaces it; a Vision match over a stale hand pin is saved.
- A stale Rejection doesn't stop a Vision match being saved.

## Not here

Showing that a Volume was re-scanned, or listing its stale pins in the app.
