# Sukulinja

A desktop genealogy editor.

Electrobun + Bun + Lit, SQLite-backed. Import a GEDCOM, pick a focus, explore.

## Status

Early prototype. The layout engine and GEDCOM importer work; UI is minimal.

## Prerequisites

- [Bun](https://bun.sh/) ≥ 1.3
- macOS (the Electrobun desktop build currently targets macOS only)

## Getting started

```sh
bun install
bun run import-ged path/to/your-tree.ged   # writes data/app.db
bun run dev:app                             # launch the desktop app
```

For a browser-based dev loop (no native window):

```sh
bun run dev
```

## Project layout

```
src/
  client/        Lit components + tree-view layout engine
  server/        Bun HTTP server, SQLite access, GEDCOM parser/importer
  common/        Shared types
scripts/
  import-ged.ts  CLI entry for GEDCOM import
docs/
  adr/           Architecture decision records
CONTEXT.md       Domain language for the tree-view layout
```

## Domain language

Layout terms (Focus, Ancestor stack, Step-fam fan, Bloodline pyramid, …) are defined in [CONTEXT.md](./CONTEXT.md). Read it before changing the tree-view code — the names are load-bearing.

## Development

```sh
bun run format     # prettier
bun run lint       # eslint
bun run typecheck  # tsc --noEmit
```

## License

[Unlicense](https://unlicense.org/) — public domain.
