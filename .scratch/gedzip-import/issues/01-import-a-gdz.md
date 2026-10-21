Status: ready-for-agent

# Import a GEDZIP (.gdz) in place of a GEDCOM folder

The start screen has two ways in: **Import GEDCOM** (a single `.ged`) and **Import GEDCOM folder** (a `webkitdirectory` pick that uploads the `.ged` plus every sibling file as `media`/`mediaPath` form fields, so local `FILE` references resolve). The `import-ged` CLI does the folder case by resolving media against the `.ged`'s directory.

[GEDZIP](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html#gedzip) packs that folder into one file, so it replaces the folder import.

## What GEDZIP is (GEDCOM 7.0 spec, chapter 4)

- A zip archive (ISO/IEC 21320-1), saved with the extension `.gdz`.
- It holds an entry named `gedcom.ged` with the dataset, plus one entry for each local `FILE` path in it, named the same as that path.
- Entry names are case-sensitive UTF-8 and **not** percent-escaped, whereas a `FILE` payload percent-escapes characters that can't appear in a URL (`media/photo%201.jpg` ↔ entry `media/photo 1.jpg`).
- `FILE` values may also be remote URLs; those aren't in the archive.
- The spec says the GEDZIP version equals the dataset's (7.0).

## Decided (2026-10-21)

- **One import button** that accepts `.ged`, `.gedcom` and `.gdz`. Remove the folder import: the `#folder-input` picker and `onFolderChange` in `src/client/components/app/index.ts`, the `media`/`mediaPath` upload fields, and `stageUploadedMedia` in `src/server/server.ts`, along with any helpers only they use.
- **A `.gedcom` / `.ged` import works as today**: a MyHeritage export (GEDCOM 5.5.1 with photo URLs) still downloads its photos. GEDZIP can't stand in for that.
- **A `.gdz` import**: unzip into a temp dir, read `gedcom.ged` as the text, and pass the temp dir as `sourceDir` to `importDataset`. Remove the temp dir afterwards, as the upload staging is removed today.
- **Unzip with [`fflate`](https://github.com/101arrowz/fflate)** as a runtime dependency. Bun's `Bun.Archive` reads only tar (checked on Bun 1.4.3: "Unrecognized archive format" on a zip).
- **Accept whatever `gedcom.ged` holds**, 5.5.1 included; the import already reads both.
- **FamilySearch GEDZIP only.** The GEDCOM Project's [GEDZIP 0.2](https://www.gedcom.org/specs/GEDZIP02.pdf) (2021, gedcom.org) is a different format with the same name: a `.zip` holding exactly one GEDCOM file of any name. It isn't supported. A `.zip` is refused like any other unknown extension.
- **Import a mismatched archive and report it.** A referenced file missing from the archive ends up in the import's `skipped` list, as a missing local file does today. Log any entry other than `gedcom.ged` that no `FILE` references; it isn't ingested. Neither stops the import.
- **Drop the `import-ged` CLI** (`scripts/import-ged.ts`, the `package.json` script, and the CLI-only `forceMyHeritage`/`keepCutouts` options if nothing else sets them). The dev server (`src/server/dev.ts`) imports into the repo's `data/` through the same button, which covers what the scripts read.

## Watch out for

- **Zip-slip**: refuse or skip entries whose names are absolute or climb out of the temp dir (`..`). `safeRelPath` in `server.ts` already does this for upload paths, so reuse it.
- **Percent-escaping**: `media-ingest.ts` resolves a `FILE` path with `resolve(sourceDir, relpath)` as written. A spec-following `.gdz` has `%20` in `FILE` but a literal space in the entry name, so decode the path before resolving (only for paths without a scheme).
- **No `gedcom.ged` entry**: fail with a clear error, not "missing" media.
- **Display name / slug**: strip `.gdz` the way `.ged`/`.gedcom` are stripped (`stripExtension` in `src/client/components/app/helpers.ts`, the `displayName` regex in `handleImport`).
- **Size**: a dataset's media can be tens of MB (ylonen: 65 MB), so unzip one entry at a time to disk rather than inflating the whole archive in memory if that's easy.

## Testing

- Server: build a `.gdz` in the test (fflate can zip too) with `gedcom.ged` and a `media/` photo, including a name with a space, and check the photo ends up in the dataset. Add a case for a `../` entry and one for a missing `gedcom.ged`.
- By hand: `../myheritage-export/` has `export-with-media.ged` (GEDCOM 7) and a flat `media/`. Copy the `.ged` to `gedcom.ged`, zip it with `media/`, and import the result in the app.

## Comments
