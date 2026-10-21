Status: ready-for-agent

# Seed the bundled demo from a GEDZIP

Parent: `../../gedzip-import/issues/01-import-a-gdz.md`.

The demo an installed app starts with is the import's output, committed: `data/bourbon/db.sqlite` plus its 47 hashed photos (3.5 MB). `electrobun.config.ts` copies it into the bundle as `demo/bourbon`, and `seedDemo` in `src/server/index.ts` copies that into the data folder on first launch. Every schema change means migrating the committed database by hand (`16ebefa`).

Ship the source instead: a `bourbon.gdz`, imported on first launch through `importDataset` like any upload, so the demo is always built by the current code.

## Checked 2026-10-21

The upstream sample ([D-Jeffrey/gedcom-samples](https://github.com/D-Jeffrey/gedcom-samples) `sample-bourbon/`: `bourbon.ged`, GEDCOM 5.5.1 from Ancestris, with `photos/` and `actes/`), packed as a `.gdz` with `bourbon.ged` renamed to `gedcom.ged`, imports in about 60 ms to exactly what `data/bourbon` holds: 303 people, 139 families, 47 photos and 49 links, with the same stored files and the same `original_path` for each.

That first pack took the whole upstream folder (8.3 MB), including 8 photos no FILE names. The 5 `actes/` files are named, but under events, which the app doesn't read yet.

## Decided (2026-10-21)

- **Only what a FILE names goes in**: `gedcom.ged` (upstream `bourbon.ged`, unchanged) and the 55 files its FILEs name, the `actes/` scans and transcriptions included (about 4.4 MB). The 8 photos no FILE names and `geo_cache.csv` stay out. Pack from upstream commit `74040285d9e7` (2026-04-18); store the photos uncompressed, deflate the text.
- **It lives at `resources/demo/bourbon.gdz`**, with `NOTICE.md` moved beside it and rewritten for the `.gdz` (source, licence, how it was packed). `electrobun.config.ts` copies `resources/demo` to `demo` in place of `data/bourbon` and `data/NOTICE.md`. Untrack `data/bourbon/` and `data/NOTICE.md` with `git rm --cached`, so existing checkouts keep their copy, and make `data/` wholly gitignored.
- **Seed under one rule everywhere**: the app, dev or installed, and the `bun run dev` server (`src/server/dev.ts`) import the demo when their data folder doesn't exist yet. Keep keying on the folder not existing, so deleting the demo never brings it back. Share the seeding between `index.ts` and `dev.ts`.
- **Wait for it**: seed before the server starts and the window opens, as the copy does now (the import takes ~60 ms). Import as slug `bourbon`, display name "Bourbon". If the import fails, log it and open with no datasets: the data folder then exists, so it isn't retried.

## Notes

- `seedDemo` returns early in a dev build today (`isDev`); that check goes.
- The import's staging writes into the data folder, so create the folder as part of seeding. A failed import must still leave it in place (see above).
- Test the seeding against a temp folder: seeds when missing, leaves an existing folder alone even when it's empty.

## Comments
