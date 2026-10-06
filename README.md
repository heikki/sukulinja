# Sukulinja

DIY genealogy editor, early prototype — currently an hourglass family tree chart for GEDCOM files, with portraits.

Portraits come from the image files beside the GEDCOM, or are downloaded from a MyHeritage export.

![Sukulinja](screenshot.png)

## Setup

Requires [Bun](https://bun.sh/); the desktop app is macOS only.

```bash
bun install
bun dev       # serve the app in a browser
bun dev:app   # or build and open it as a desktop app
```

The repo ships with a House of Bourbon demo dataset in `data/bourbon/`, so a fresh clone has something to show.

To install it as a signed app in `/Applications`:

```bash
bun run cert --create   # once: a self-signed code-signing identity
bun run install:app
```

The installed app keeps its datasets under `~/Library/Application Support/Sukulinja/data/`, apart from the checkout's `data/`, so it starts empty.

## Docs

- [CONTEXT](CONTEXT.md) — terms and relationships
- [ADR](docs/adr/) — architectural decisions
