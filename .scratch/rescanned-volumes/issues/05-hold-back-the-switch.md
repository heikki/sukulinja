Status: ready-for-agent

# In the app, find a re-scan but switch to the new filming only when asked

Parent: `01-detect-a-rescan.md`. Glossary: **Re-scan**, **Pin**, **Scan cache**, **Scan viewer**, **Mark**, **Vision match**.

Since `02`, the Scan cache switches a Volume to its new filming on its own the first time an Image of it is missing: it replaces the cached list, drops the old Images, and every pin made on the old filming silently stops counting. Decided 2026-10-21: in the app the person is asked first, shown what the switch leaves out (`06`). The vision pass and the scripts have no one to ask and keep switching on their own.

## Do

- **Peek**: `Astia` can fetch a Volume's list past the cache without keeping it (shared while in flight, like `refreshImages`).
- **Hold back**: the Scan cache takes whether it switches on its own (`openScanCache({ astia, root, switches })`): the scripts (`scripts/vision/images.ts`, `check-rescans --update-cache`) yes, the app (`server.ts`) no. Holding back, an Image Astia no longer has is a `NoImageError` as before `02`; the Image route answers it as "Astia no longer has this Image" rather than the 502 for Astia failing.
- **Report**: `GET /astia/volumes/:id/rescan` peeks, and answers `{ rescan: null }` when the list matches the cached one, else the Image counts (cached, now) and the pins the switch would leave out: the stale pins as `check-rescans` lists them (kind, hand or vision, Image, pages or record or reference URL), checked against the peeked list. Move the core of `scripts/check-rescans/check.ts` into `src/server/citation-scans/` so the script and the app share it.
- **Switch**: `POST /astia/volumes/:id/rescan` does what the Scan cache does on its own today (`refresh`: keep the new list, drop the old Images) and answers the Volume's viewer URLs as `GET /astia/volumes/:id/images` does.
- Glossary: a Re-scan is noticed by the app and switched to when the person says so.

## Tests

- Holding back, a missing Image throws `NoImageError` and leaves the cached list and the old Images alone; switching on its own, as in `02`.
- `GET …/rescan` on a Volume Astia hasn't re-scanned: `{ rescan: null }`, and the cached list is unchanged.
- `GET …/rescan` on a re-scanned one: the counts and the stale pins, local and shipped; nothing changed on disk.
- `POST …/rescan`: the cached list is the new one, the old Images are gone, and resolution leaves the stale pins out.

## Not here

The viewer asking (`06`).
