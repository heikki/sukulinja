# Multi-dataset support

Status: ready-for-agent

## Problem Statement

Today the app supports a single GEDCOM at a time. The DB lives at `data/app.db` and the media root is hardcoded to a sibling `myheritage-export/media` directory in `src/server/dev.ts`. Trying out a different dataset — a public sample like the Bourbon dynasty, a colleague's export, or a stripped-down test fixture — means destructively re-importing into the same DB and editing the hardcoded media path. There is no way to keep two datasets installed side-by-side, no way to switch between them from the UI, and no way to ship a curated demo dataset alongside the user's real data.

## Solution

Make a dataset a first-class object on disk: each imported GEDCOM becomes its own self-contained subdirectory under `data/<slug>/`, holding its own SQLite database and a copy of its media files. Importing a new GEDCOM creates a new subdirectory without touching existing ones. The web UI lists installed datasets and lets the user switch between them by navigating to a URL prefix (`/d/<slug>/`). Media files are stored content-addressed and flat inside each dataset's `media/` subdir, so the storage layout is uniform regardless of how the source GEDCOM organised its references.

## User Stories

1. As a developer evaluating the app, I want to import a public sample GEDCOM (e.g. Bourbon dynasty) without overwriting my real family data, so that I can play with demo content and my own data simultaneously.
2. As a user with my own MyHeritage export, I want my imported data to keep working after I install a sample dataset, so that adding demos is non-destructive.
3. As a user with multiple datasets installed, I want to see a switcher in the UI listing every installed dataset, so that I can pick which one to view.
4. As a user picking a dataset from the switcher, I want the URL to change to reflect my choice (e.g. `/d/bourbon/`), so that I can bookmark or share a link to a specific dataset.
5. As a user with two browser tabs open, I want to view a different dataset in each tab, so that switching in one tab doesn't disrupt the other.
6. As a user importing a GEDCOM, I want the import command to default the dataset slug to the GEDCOM filename (e.g. `bourbon.ged` → `bourbon`), so that I don't have to invent a name every time.
7. As a user importing a GEDCOM, I want to override the default slug with a `--name` flag, so that I can disambiguate between two similarly-named source files.
8. As a user re-importing into an existing slug, I want the existing dataset directory to be wiped and rebuilt, so that partial state from a previous import can't linger.
9. As a user importing a GEDCOM with media, I want the referenced image and document files to be copied into the dataset's own `media/` subdirectory, so that the dataset is self-contained and the original source location is no longer load-bearing.
10. As a user importing a GEDCOM, I want files copied with content-hash filenames into a flat directory, so that the layout is uniform across datasets regardless of how the source organised its `OBJE`/`FILE` paths.
11. As a user importing a GEDCOM that references the same image bytes from multiple `OBJE` records, I want the bytes copied only once, so that duplicate media doesn't bloat the dataset.
12. As a user importing a GEDCOM with broken `FILE` references (Windows absolute paths, missing files), I want the importer to skip those entries and continue, so that one bad reference doesn't abort the whole import.
13. As a user running an import, I want a summary report of records imported, files copied, and files skipped (with reasons), so that I can spot data-quality problems immediately.
14. As a user viewing a dataset, I want media URLs to resolve correctly without my having to configure a media root, so that "media just works" once a dataset is imported.
15. As a user with zero datasets installed, I want the root page to show an empty-state telling me how to import, so that I'm not staring at a broken UI.
16. As a user with exactly one dataset installed, I want the root URL to redirect to that dataset, so that I don't have to click anything.
17. As a user, I want each dataset's DB to record its display name, source filename, and import timestamp, so that the switcher can show enough context to tell datasets apart.
18. As a developer making a schema change, I want a single source of truth for the per-dataset schema (rather than two parallel definitions for "old single-db" and "new per-dataset-db"), so that future migrations stay tractable.
19. As a developer, I want the import script to be the only code that writes to disk in the data dir, so that the running server never races against a half-written dataset.
20. As a developer, I want the file-copying-with-hashing logic to be a separate module from the GEDCOM importer, so that it's testable in isolation and can be reused for future media sources.
21. As a developer, I want dataset discovery, slug validation, and DB-handle caching to be one module, so that the server's request handlers don't reimplement that logic each.
22. As a developer testing the media-ingest pipeline, I want to be able to feed it parsed `GedNode` arrays and a tmp source dir, and assert on the produced `media/` contents, so that tests can run without spinning up a real GEDCOM file.

## Implementation Decisions

### Convention

- A dataset lives entirely inside `data/<slug>/`. Subdirs are independent — copying or deleting one is the whole operation.
- `<slug>` matches `[a-z0-9][a-z0-9_-]*`, defaulted from the GEDCOM filename, overridable with `--name`.
- Inside the subdir: `db.sqlite` (the dataset's DB) and `media/` (flat dir of content-addressed media files).
- The currently-viewed dataset is identified by URL prefix `/d/<slug>/`. No server-side "active dataset" state.

### Module: MediaIngest (new, deep)

Owns the end-to-end pipeline from a parsed GEDCOM to a populated `media/` directory. Combines what was sketched as separate "plan" and "store" modules — the planning step is internal.

Interface:

- `ingest({ roots: GedNode[], sourceDir: string, targetDir: string }) → IngestResult`
  - Walks every `OBJE`/`FILE` node in `roots`.
  - For each `FILE` value: resolve to `sourceDir/<relpath>`. If absolute or missing, record as skipped and continue.
  - For each readable source: stream-hash with SHA-256, take the first 12 hex chars, append the original extension, write to `targetDir/<hash>.<ext>` if not already present (hash dedup).
  - Return `{ resolved: Map<originalRelpath, hashedName>, skipped: [{ originalRelpath, reason }] }`.

No DB awareness. No knowledge of dataset slugs. Pure file-system + parsed-tree operations.

### Module: DatasetRegistry (new, deep)

Owner of the `data/` directory tree and the per-slug DB-handle cache.

Interface:

- `list() → DatasetInfo[]` — scans `data/*/db.sqlite`, opens each to read `meta` and a count, returns `[{ slug, displayName, personCount, familyCount, importedAt }]`.
- `open(slug) → Database` — cached; opens lazily, returns the same handle on subsequent calls.
- `createFresh(slug) → { db: Database, mediaDir: string }` — if `data/<slug>/` exists, removes it; recreates `data/<slug>/media/`; opens a new `db.sqlite`, runs schema, returns the handle and media dir.
- `mediaDir(slug) → string` — absolute path to `data/<slug>/media`.

Encapsulates slug validation, dir lifecycle, schema bootstrap, and handle caching. Knows nothing about GEDCOM.

### Modified: `importGedcom`

Takes a new `mediaResolver: (originalRelpath: string) → string | null` argument. When the importer encounters an `OBJE`/`FILE`, it calls the resolver to translate the GEDCOM-side relpath into the hashed filename to store. Returning `null` means "skip this media link." The importer no longer reads `FILE` values into `media.file_path` directly; instead it writes `(file_path = hashedName, original_path = originalRelpath)`.

This keeps the importer DB-only — no filesystem reads or writes — and lets the caller decide the storage strategy.

### Modified: import script

The orchestrator. Sequence:

1. Resolve input GEDCOM to absolute path; compute `sourceDir = dirname(input)`.
2. Compute slug (from `--name` or filename); validate.
3. `DatasetRegistry.createFresh(slug)` → fresh DB + empty `media/` dir.
4. Parse GEDCOM.
5. `MediaIngest.ingest({ roots, sourceDir, targetDir: mediaDir })` → resolution map + skipped list.
6. `importGedcom(db, roots, resolver)` where `resolver = (relpath) => map.get(relpath) ?? null`.
7. Write `meta` rows: `display_name`, `source_filename`, `imported_at`, `gedcom_version` (read from the header `2 VERS` line if present).
8. Print stats including imported counts, files copied, files skipped (with reasons).

### Modified: server

- Drop the `mediaRoot` field from `createApi` config. The server now takes a `DatasetRegistry` instance instead.
- Routes:
  - `GET /datasets` — returns `DatasetRegistry.list()` for the switcher.
  - `/d/<slug>/api/*` — existing API handlers, but the DB handle is `registry.open(slug)`. 404 if slug doesn't exist.
  - `/d/<slug>/media/<filename>` — serves from `registry.mediaDir(slug)`. Same path-traversal guard as today.
  - `GET /` — if `list()` returns one dataset, redirect to `/d/<slug>/`. If zero, render empty-state. If many, render a chooser (can be the same component as the in-app switcher).
- `dev.ts` drops the hardcoded `mediaRoot`; passes a fresh `DatasetRegistry` rooted at `data/`.

### Modified: client

- Client-side fetch helper learns about the URL prefix: it reads the leading `/d/<slug>` segment from `window.location.pathname` and prepends it to API and media URLs.
- A dataset switcher (a single `<select>` in the existing toolbar is fine for v1) calls `GET /datasets`, renders the list, and navigates to `/d/<other>/` on change.

### Schema (per-dataset DB)

Existing tables (`persons`, `families`, `names`, `facts`, `media`, `media_links`, `family_children`) remain unchanged in shape. Two additions:

```sql
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE media ADD COLUMN original_path TEXT;
```

Seeded `meta` rows on import: `display_name`, `source_filename`, `imported_at`, `gedcom_version`.

`media.file_path` now stores the hashed filename (e.g. `a3f1b2c8.jpg`). `media.original_path` stores the verbatim `FILE` value from the GEDCOM (e.g. `photos/Louis_XIII.jpg`) for debug / fallback display.

### Legacy `data/app.db`

The existing single-db location is treated as orphaned. The import script no longer writes to it. After the first multi-dataset import, the user can delete it manually; the system does not auto-migrate.

## Testing Decisions

The repo currently has no test framework wired up. This feature is the right moment to introduce one. Use `bun test` (built into the runtime, no new dependency) and place tests next to the modules they cover.

A good test here exercises external behaviour, not internal structure: feed the module its declared inputs (a tmp dir, a parsed `GedNode[]`, a slug name) and assert on its declared outputs (files on disk, the returned map, the visible state of `data/`). No mocking of the filesystem — use a real tmp dir per test. No assertions on private helpers or internal call ordering.

### MediaIngest tests

- Given a parsed `GedNode[]` with two `OBJE`/`FILE` entries pointing at two real bytes-on-disk fixtures, `ingest` populates the target dir with two `<hash>.<ext>` files and returns a 2-entry resolution map.
- Given two `FILE` entries pointing at identical bytes (same content, different relpaths), only one file is written; both relpaths map to the same hashed name.
- Given a `FILE` entry pointing at a non-existent source, the entry shows up in `skipped` with `reason: missing` and is absent from the resolution map.
- Given a `FILE` entry whose value is an absolute path (e.g. `C:\foo\bar.jpg`), the entry is `skipped` with `reason: absolute` without any filesystem access attempt.
- Given an empty `GedNode[]`, returns an empty map and empty skipped list without creating the target dir.

### DatasetRegistry tests

- Given an empty `data/` root, `list()` returns `[]`.
- After `createFresh("foo")`, `list()` returns one entry with slug `foo` and the seeded meta values; the directory `data/foo/media/` exists and is empty.
- `createFresh("foo")` called on a pre-existing `data/foo/` with junk files wipes the directory before creating.
- `open("foo")` called twice returns the same `Database` instance (cache hit).
- `open("does-not-exist")` throws.
- Invalid slugs (`""`, `"Foo"`, `"foo/bar"`, `"../baz"`) are rejected by `createFresh` before any disk write.
- `mediaDir("foo")` returns an absolute path inside the registry's root.

### Out-of-scope for tests in this PRD

- `importGedcom` itself (already-existing module; the new `mediaResolver` parameter is a thin pass-through and not where bugs live).
- The end-to-end import script (orchestration only; covered by manual run-through during implementation).
- The server's URL routing (covered by manual verification — boot dev server, hit URLs).
- The client switcher UI.

### Prior art

There is none — this is the first test suite in the codebase. Conventions to establish:

- Test files colocated next to the module under test: `src/server/media-ingest.test.ts` beside `src/server/media-ingest.ts`.
- `bun test` runs the lot; add `"test": "bun test"` to `package.json`.
- Fixtures (sample image bytes, sample GedNode arrays) inline in the test file or in a sibling `*.fixtures.ts`. Avoid a deep `tests/fixtures/` tree until a third test wants the same fixture.

## Out of Scope

- Extracting image dimensions (`width`/`height`) during ingest. The renderer currently relies on `naturalWidth/naturalHeight` after image load; revisit when a layout decision actually needs the dimensions up-front.
- Thumbnail generation or any image transcoding.
- Re-importing that _merges_ new data into an existing dataset. The model is wipe-and-rebuild; merge is a separate, harder problem.
- A web UI for _importing_ a GEDCOM. The import path stays CLI-only.
- Auto-migrating the legacy `data/app.db` into a slug-prefixed dataset.
- Authentication, per-user datasets, sharing. Single-user app.
- Symlinks instead of copying. The copy decision is explicit (datasets must survive the source dir moving or being deleted).
- Slugified-relpath filenames (`photos-Louis_XIII.jpg`). Content-hash naming is the chosen scheme; filesystem-browsability is not a goal.
- Bundling media bytes into the SQLite file (BLOBs). Bytes stay on disk, the DB stays a metadata index.

## Further Notes

- The `MediaIngest.ingest` walk is the only place that knows the `OBJE`/`FILE` shape from the GEDCOM side. If a future format (e.g. strict GEDCOM 7 with top-level `OBJE` records referenced by pointer) needs different traversal, that change is localised to this module.
- The Bourbon and Kennedy public samples downloaded into `.scratch/sample-gedcoms/` are the primary manual-verification targets: importing both alongside the user's own MyHeritage export should produce three coexisting datasets that the switcher can move between.
- The `original_path` column on `media` is debugging-grade. If, later, a renderer wants to display "this photo came from the `actes/` PDF folder," the data is there; otherwise it's ignorable.
- The URL-routed design means HMR during `bun run dev` continues to work without special handling — the active slug lives in the URL bar, not in the dev server's memory.
- The new `meta` table is intentionally generic key/value rather than a fixed-column row. It gives us room to record additional per-dataset facts later (last-viewed person, default focus, etc.) without further schema churn.
