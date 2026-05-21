# Multi-dataset directory layout and URL-routed serving

Status: ready-for-agent

## Parent

[PRD: Multi-dataset support](../PRD.md)

## What to build

Replace the single `data/app.db` + hardcoded media-root model with a per-dataset directory layout. Each imported GEDCOM lands in `data/<slug>/`, containing its own `db.sqlite` and a flat `media/` dir of content-addressed copies of the referenced media files. The dev server serves each dataset under a URL prefix `/d/<slug>/`.

End-to-end behaviour after this slice:

- `bun run import-ged path/to/bourbon.ged` (or `--name <slug>` to override) creates `data/bourbon/db.sqlite` and `data/bourbon/media/<hash>.<ext>` files. Re-running with the same slug wipes and rebuilds that subdir; other datasets are untouched.
- The import script prints a summary: records imported, files copied, files skipped (with reasons — `missing` or `absolute`).
- Starting the dev server and navigating to `/d/bourbon/` shows the tree with photos resolving from `/d/bourbon/media/<hash>.<ext>`.
- The TODO comment about a hardcoded media root in `src/server/dev.ts` is gone; `dev.ts` no longer references `myheritage-export`.
- There is no UI yet for picking a dataset — the user types the URL. (That comes in the next slice.)
- The legacy `data/app.db` is left in place untouched; it is no longer read or written by the new code.

### New module: MediaIngest

Owns the pipeline from parsed GEDCOM + source dir to a populated `media/` directory. Single entry point: `ingest({ roots, sourceDir, targetDir }) → { resolved: Map<originalRelpath, hashedName>, skipped: [{ originalRelpath, reason }] }`.

- Walks every `OBJE`/`FILE` node in `roots`.
- For each `FILE` value, resolves to `sourceDir/<relpath>`. Skips absolute paths (`reason: absolute`) and missing files (`reason: missing`) without aborting.
- For readable sources, stream-hashes with SHA-256, takes the first 12 hex chars, appends the original extension, writes to `targetDir/<hash>.<ext>` if not already present. Duplicate-bytes inputs share one written file; their relpaths map to the same hashed name.
- No DB awareness, no slug awareness.

### New module: DatasetRegistry

Owns the `data/` tree and the per-slug DB-handle cache.

- `createFresh(slug) → { db, mediaDir }`: validates slug (`[a-z0-9][a-z0-9_-]*`), removes `data/<slug>/` if it exists, recreates `data/<slug>/media/`, opens a fresh `db.sqlite`, runs schema, returns the handle and absolute media-dir path.
- `open(slug) → Database`: opens lazily and caches. Throws if the slug doesn't exist.
- `mediaDir(slug) → string`: absolute path to `data/<slug>/media`.
- `list()` is deferred to the next slice.

### Modified: importGedcom

Gains a `mediaResolver: (originalRelpath) → string | null` parameter. When the importer reaches an `OBJE`/`FILE`, it asks the resolver to translate the GEDCOM relpath into the on-disk hashed name. `null` means skip the media link. The importer writes `(file_path = hashedName, original_path = originalRelpath)` into `media`.

### Schema additions (per-dataset DB)

```sql
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE media ADD COLUMN original_path TEXT;
```

Seeded `meta` rows during import: `display_name`, `source_filename`, `imported_at`, `gedcom_version` (parsed from `2 VERS` in the GEDCOM header if present).

### Modified: server

- `createApi` no longer takes a `mediaRoot`; it takes a `DatasetRegistry`.
- Routes:
  - `/d/<slug>/api/*` — uses `registry.open(slug)`; returns 404 if the slug doesn't exist.
  - `/d/<slug>/media/<filename>` — serves from `registry.mediaDir(slug)`; preserves the existing path-traversal guard.
- `dev.ts` constructs a `DatasetRegistry` rooted at `data/` and passes it to `createApi`. The hardcoded `mediaRoot` and the TODO comment are removed.

### Modified: client fetch helper

Reads the leading `/d/<slug>` segment from `window.location.pathname` and prepends it to API and media URLs.

### Tests (introduce `bun test`)

Add `"test": "bun test"` to `package.json` scripts. Colocate tests next to modules under test.

**MediaIngest:**

- Two distinct `FILE` entries with two real fixture files → two hashed files written, 2-entry resolution map.
- Two `FILE` entries with identical bytes → one file written, both relpaths map to the same hashed name.
- Missing source → entry in `skipped` with `reason: missing`, absent from resolution map.
- Absolute path (`C:\foo.jpg`) → entry in `skipped` with `reason: absolute`, no filesystem access attempted.
- Empty `roots` → empty map, empty skipped, target dir not created.

**DatasetRegistry:**

- Empty data root → `list()` returns `[]` (note: `list()` is deferred; for this slice the equivalent assertion is that `open` on an unknown slug throws and the data root is left untouched).
- `createFresh("foo")` → directory tree exists, schema applied, meta rows seeded.
- `createFresh("foo")` on a pre-existing dirty `data/foo/` wipes it before recreating.
- `open("foo")` called twice → same `Database` instance.
- `open("does-not-exist")` → throws.
- Invalid slugs (`""`, `"Foo"`, `"foo/bar"`, `"../baz"`) are rejected before any disk write.
- `mediaDir("foo")` returns an absolute path inside the registry root.

## Acceptance criteria

- [ ] `bun run import-ged .scratch/sample-gedcoms/gedcom-samples/sample-bourbon/bourbon.ged` produces `data/bourbon/db.sqlite` and a flat `data/bourbon/media/` of content-hashed files; the script prints a summary including skip reasons.
- [ ] Re-running the same import wipes and rebuilds `data/bourbon/`; running with a different slug (e.g. `--name kennedy` against the Kennedy sample) creates a second dataset without touching the first.
- [ ] `bun run dev` followed by visiting `/d/bourbon/` renders the tree and photos load from `/d/bourbon/media/<hash>.<ext>`.
- [ ] `src/server/dev.ts` no longer hardcodes `myheritage-export`; the TODO at the top of that file is gone.
- [ ] The per-dataset DB contains a `meta` table with `display_name`, `source_filename`, `imported_at`, and `gedcom_version` rows.
- [ ] The `media` table has an `original_path` column populated with the verbatim `FILE` values from the GEDCOM; `media.file_path` contains hashed names like `a3f1b2c8.jpg`.
- [ ] `bun test` runs and the MediaIngest + DatasetRegistry tests pass.
- [ ] `bun run format`, `bun run lint`, and `bun run typecheck` all pass.

## Blocked by

None — can start immediately.
