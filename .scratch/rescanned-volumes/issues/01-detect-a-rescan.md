Status: ready-for-agent

# Notice when Astia re-scans a Volume

Glossary: **Volume**, **Image**, **Page pin**, **Record pin**, **Reference pin**, **Box**, **Scan cache**.

Astia sometimes replaces a Volume's scans with a new filming. Mikkeli I Ab:9 Lastenkirjat (1828–1846) went from 455 greyscale Images to 434 colour ones, with all new file ids. The app caches each Volume's list of file ids (`ws/aineisto/digitoidut.php`) in `.astia-cache` forever, so it kept asking for the old ids. Astia answers an id it no longer has with `200 image/png`: a 250×336 placeholder (a page icon), never an error. `isJpeg` rejects it, `imageBytes` throws "no image", and the Scan viewer shows nothing, while Astia's own viewer still opens from the same link.

Every Image number pinned in the Volume was also off: the shipped Page pins sat at 125 and 247 for pages 234–235 and 462–463, which the new filming has at 120 and 232. A vision Record pin's Box was drawn on the old photograph.

Fixed by hand on 2026-10-20: replaced the cached list, moved the two Page pins, and moved the Record pin to 232 without its Box. A check of all 208 cached Volume lists found this one changed.

The hand fix reached only the installed app's data folder (`~/Library/Application Support/Sukulinja/data`). The repo's `data/`, which the scripts read, still has the old 455-id list (cached 2026-10-14) and the Record pin at 247 with its old Box, so a script run over this Volume fails the same way.

## Checked 2026-10-21

- **Astia's list**: `digitoidut.php?id=1855029314` lists 434 Images, ids `15047072045`–`15047073345`. No id is shared with the old 455 (`5961499796`…).
- **Old ids are gone, not glitching**: four old ids from across the Volume all answered with the placeholder PNG; a new id answers with a 2850×4303 colour JPEG. The comment on `isJpeg` calls the placeholder "a blip", so `request` retries it first; for a re-scan the retries can never succeed.
- **Same book, new photographs**: old Image 247 (still in the Scan cache) and new Image 232 are the same spread, pages 462–463, Taipale No 1 and No 2: greyscale microfilm, then a colour photograph. New Image 120 shows pages 234–235, so the moved Page pins are right.
- **Whole Volume refilmed**: 10 Images sampled from 1 to 434 and the 96 new Images in the Scan cache are all colour.
- **When**: Astia's Volume metadata (`readOne.php`) has no scan date; it lists two digital copies, both with ids in the new range. The JPEG EXIF does: the old filming `DateTimeOriginal` 2021-10-09, make and model "Unknown"; the new one `ModifyDate` 2026-10-09 10:20:53 on every Image sampled (likely an export time), Canon EOS R5, software `multidotscan`. Astia gives no notice of a re-scan.
- **Stale links elsewhere**: `data/citation-scans.json`, written by `scripts/map-citation-scans` and not read by the app, bakes file ids into its viewer links; those into a re-scanned Volume now open the placeholder in Astia's viewer.
- **In the tree**: three references point into this Volume: `@I500237@` pages 463 (the Record pin) and 248, `@I500427@` page 241.

## Decided (2026-10-21)

- **A pin made on another filming is ignored.** Its Image number and Box stop counting, and its Link falls back to the estimate from the Volume's other pins or the Book's numbering until someone re-pins. Keeping on counting from it was rejected: in I Ab:9 the old pins were 5 and 15 Images off.
- **The old list isn't kept.** A re-scan replaces the cached list outright.
- **Every pin saves its Image's file id** beside the Image number, and that is how a pin from another filming is told apart; it replaces storing each Volume's Image count.
- Built as three tickets, in order:
  - `02-refresh-a-rescanned-volume.md`: the Scan cache notices the placeholder, fetches the list again and retries.
  - `03-file-ids-on-pins.md`: pins save the file id, stale ones are ignored, existing ones are backfilled.
  - `04-check-for-rescans.md`: a script that catches the next re-scan of a pinned Volume.

## Comments
