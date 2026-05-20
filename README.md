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
bun run import-ged path/to/your-tree.ged   # writes data/app.db
bun run dev:app                             # launch the desktop app
```
