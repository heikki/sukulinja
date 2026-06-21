# Sukulinja

A desktop genealogy editor.

Electrobun + Bun + Lit, SQLite-backed. Import a GEDCOM, pick a focus, explore.

## Status

Early prototype. The layout engine and GEDCOM importer work; UI is minimal.

## Prerequisites

- [Bun](https://bun.sh/) ≥ 1.3
- macOS (the Electrobun desktop build currently targets macOS only)

## Quick start

```sh
bun install
bun run dev:app
```

The repo ships with `data/bourbon/` pre-imported (303 individuals, 47 portraits)
so a fresh clone has a working demo immediately. See
[`data/NOTICE.md`](data/NOTICE.md) for attribution.

To import your own GEDCOM, either click **Import GEDCOM** in the app toolbar and
pick a `.ged` file, or from a terminal:

```sh
bun run import-ged path/to/your-tree.ged --name family
```

Both routes run the same pipeline. Each import creates `data/<slug>/` with its
own SQLite DB and a flat content-addressed `media/` dir. Switch between installed
datasets in the app toolbar, or by URL: `/d/<slug>/`.

### MyHeritage exports

A raw MyHeritage GEDCOM export is imported directly — no separate conversion
step. The importer auto-detects it (and `--myheritage` forces the path) and, in
one pass, downloads each remote image, drops MyHeritage-private bloat and the
duplicate face-cutout media blocks, and converts each `_POSITION` face
rectangle to a standard `CROP` before ingesting:

```sh
bun run import-ged path/to/MyHeritage-export.ged --name family
```

Note: MyHeritage signs image URLs with an expiry roughly **one week** from when
the export was generated; after that they 403 and import with zero media. Run
the import while the export is fresh. Pass `--keep-cutouts` to import the
pre-cropped face JPGs as separate media instead of dropping them.
