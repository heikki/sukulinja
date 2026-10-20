Status: needs-triage

# Notice when Astia re-scans a Volume

Glossary: **Volume**, **Image**, **Page pin**, **Record pin**, **Reference pin**, **Box**, **Scan cache**.

Astia sometimes replaces a Volume's scans with a new filming. Mikkeli I Ab:9 Lastenkirjat (1828–1846) went from 455 greyscale Images to 434 colour ones, with all new file ids. The app caches each Volume's list of file ids (`ws/aineisto/digitoidut.php`) in `.astia-cache` forever, so it kept asking for the old ids. Astia answers an id it no longer has with `200 image/png`: a 250×336 placeholder (a page icon), never an error. `isJpeg` rejects it, `imageBytes` throws "no image", and the Scan viewer shows nothing, while Astia's own viewer still opens from the same link.

Every Image number pinned in the Volume was also off: the shipped Page pins sat at 125 and 247 for pages 234–235 and 462–463, which the new filming has at 120 and 232. A vision Record pin's Box was drawn on the old photograph.

Fixed by hand on 2026-10-20: replaced the cached list, moved the two Page pins, and moved the Record pin to 232 without its Box. A check of all 208 cached Volume lists found this one changed.

## Proposed (confirm before agent work)

- **Detect**: when `getFile.php` answers with the placeholder (PNG, not JPEG) for an id from a cached list, fetch the list again, bypassing the cache. If it differs, replace the cached list and retry the Image once with the new id. If it doesn't, it's a genuine "no image".
- **Remember**: keep the old list beside the new one (e.g. `<key>.replaced-<date>.json`), so old Image numbers can still be mapped by hand.
- **Pins**: Image numbers saved against the old list are no longer trustworthy. Options:
  - mark the Volume's pins stale, so its Links show as Estimated Volume until someone re-pins, and list the Volume for review;
  - or keep counting from them, and only flag the Volume ("Astia re-scanned this Volume; Images may be off").
    Boxes from the old filming should never show on the new one.
- **Shipped pins**: `pins.json` facts about a Volume hold for one filming. A check script that compares each pinned Volume's live Image count with what it was when pinned (store the count with the Volume's pins) would catch the next re-scan before users see it.
- **Scan cache**: the old filming's Images stay on disk under their old file ids until pruned. Nothing points to them; no action needed.

## Comments
