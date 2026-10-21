Status: needs-triage

# Seed the bundled demo from a GEDZIP

Parent: `../../gedzip-import/issues/01-import-a-gdz.md`.

The demo an installed app starts with is the import's output, committed: `data/bourbon/db.sqlite` plus its 47 hashed photos (3.5 MB). `electrobun.config.ts` copies it into the bundle as `demo/bourbon`, and `seedDemo` in `src/server/index.ts` copies that into the data folder on first launch. Every schema change means migrating the committed database by hand (`16ebefa`).

Ship the source instead: a `bourbon.gdz`, imported on first launch through `importDataset` like any upload, so the demo is always built by the current code.

## Checked 2026-10-21

The upstream sample ([D-Jeffrey/gedcom-samples](https://github.com/D-Jeffrey/gedcom-samples) `sample-bourbon/`: `bourbon.ged`, GEDCOM 5.5.1 from Ancestris, with `photos/` and `actes/`), packed as a `.gdz` with `bourbon.ged` renamed to `gedcom.ged`, imports in about 60 ms to exactly what `data/bourbon` holds: 303 people, 139 families, 47 photos and 49 links, with the same stored files and the same `original_path` for each.

As packed, it's 8.3 MB: 8 photos that no FILE names and the 5 `actes/` files (nested under events, so the app doesn't read them yet) ride along.

## Open questions

- **Which files go in**: only what a FILE names (the 47 photos + the 5 `actes/`, which the spec says belong in the archive), or the upstream folder as it is.
- **Where it lives**: e.g. `resources/demo/bourbon.gdz`, or `data/bourbon.gdz` (the `.gitignore` tracks only `data/bourbon/` and `data/NOTICE.md` now).
- **The dev data folder**: a dev build and the scripts read the checkout's `data/`, which has `data/bourbon` committed today. Seed it the same way when it's missing, or leave the dev folder to imports by hand.
- **Display name**: the committed demo is named "Bourbon" (`4a4608d`). The import names it after the request's `displayName`, so seeding passes "Bourbon".
- **First launch**: `seedDemo` copies synchronously before the registry opens. Importing is async; decide whether the window waits for it or the chooser shows the demo once it's in.
- **Provenance**: `data/NOTICE.md` describes the committed folder and needs to describe the `.gdz` instead.

## Comments
