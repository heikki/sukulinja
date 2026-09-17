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
bun dev
```

The repo ships with `data/bourbon/` pre-imported, so a fresh clone has a working
demo immediately. See [`data/NOTICE.md`](data/NOTICE.md) for attribution.

## Desktop app

Electrobun keeps its SDK in a generated `.hutch/` sysroot, so `bun run sync`
once per clone before building the app or running `bun run typecheck`
(see [ADR-0007](docs/adr/0007-electrobun-2x-via-hutch.md)):

```sh
bun run sync
bun run dev:app
```
