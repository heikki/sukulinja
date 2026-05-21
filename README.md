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

To import your own GEDCOM:

```sh
bun run import-ged path/to/your-tree.ged --name family
```

Each import creates `data/<slug>/` with its own SQLite DB and a flat
content-addressed `media/` dir. Switch between installed datasets in the app
toolbar, or by URL: `/d/<slug>/`.
