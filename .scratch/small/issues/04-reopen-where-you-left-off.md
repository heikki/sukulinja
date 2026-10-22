Status: ready-for-agent

# Reopen the app where you left off

Glossary: **Root**, **Selected person** (`src/client/components/tree-view/CONTEXT.md`), **Scan viewer**.

Each launch starts at the dataset chooser: `/enter` redirects to `/` (`src/server/window-only.ts`). Only the window's frame (`state.json`, `src/server/window-state.ts`) and the Appearance cookie carry over. The dataset, Root, pan and zoom are in the URL while the app runs (ADR-0004), but they're lost when it quits.

## Decided (2026-10-22)

- **What's remembered: the dataset and the Selected person.** Not an open person panel or Scan viewer.
- **The whole URL is kept**, so Root, pan and zoom come back with them.
- **An outdated URL is discarded.** When its dataset was deleted or renamed, or an older schema built it (`OutdatedDatasetError`), the app opens the chooser as it does today, and the saved URL is dropped.
- **The demo counts** like any other dataset: the app reopens into it too.

## What it would take

Both are already in the URL: the dataset in its path, the Selected person as `sel=` (`src/client/components/tree-view/url-state.ts`). The main process already hears every navigation: it sets the window title from the URL (`src/server/index.ts`). It could keep the last dataset URL in `state.json` beside the window frame, and `/enter` would redirect there instead of `/`.

## Comments
