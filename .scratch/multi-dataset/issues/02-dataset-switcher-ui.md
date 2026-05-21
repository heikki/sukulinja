# Dataset listing endpoint and switcher UI

Status: ready-for-agent

## Parent

[PRD: Multi-dataset support](../PRD.md)

## What to build

Add a server endpoint that lists installed datasets and a UI affordance that lets the user pick one. The selected dataset is identified entirely by the URL — there is no server-side "active dataset" and no client-side stored selection. The switcher's only behaviour is to navigate the browser to `/d/<other-slug>/`; the new page load then derives everything from the URL.

End-to-end behaviour after this slice:

- `GET /datasets` returns `[{ slug, displayName, personCount, familyCount, importedAt }, ...]` by scanning subdirs of `data/`.
- Visiting `/` redirects or renders based on what's installed:
  - **Zero datasets:** an empty-state page explaining how to run `bun run import-ged`.
  - **Exactly one dataset:** a redirect to `/d/<slug>/`.
  - **More than one:** a chooser listing each dataset (the same component used by the in-app switcher is fine).
- The toolbar gains a dataset `<select>` (or equivalent affordance) showing every installed dataset; changing the selection navigates to `/d/<other>/`. After navigation, the page boots fresh from that URL — no in-memory carry-over.
- Opening two browser tabs on different datasets works: each tab's URL is its own source of truth.

### New: DatasetRegistry.list()

Scans `data/*/db.sqlite`, opens each (using the existing cache from slice 1) to read `meta` rows and a `SELECT COUNT(*)` from `persons` and `families`. Returns `DatasetInfo[]`. Invalid or unreadable subdirs are skipped silently (a sibling junk directory shouldn't break the listing).

### New endpoint: GET /datasets

Returns the `list()` output as JSON. No auth, no caching headers beyond defaults — datasets change rarely and listing is cheap.

### Root route logic

The `/` handler calls `list()` and branches:

- `length === 0` → render an empty-state page (static HTML is fine).
- `length === 1` → 302 redirect to `/d/<slug>/`.
- `length > 1` → render a chooser page.

### Client switcher

A toolbar component fetches `/datasets` on mount, renders a `<select>` listing them (with the current slug pre-selected from `window.location.pathname`), and on change does a `window.location.assign('/d/<other>/')`. No persistence in localStorage, no in-memory store of the active dataset — the URL is the only state.

## Acceptance criteria

- [ ] `GET /datasets` returns a JSON array of `{ slug, displayName, personCount, familyCount, importedAt }` entries reflecting `data/*/db.sqlite`.
- [ ] With two datasets imported, navigating to `/` shows a chooser; with one, `/` redirects to `/d/<slug>/`; with none, `/` shows an empty-state with import instructions.
- [ ] The toolbar switcher lists every installed dataset and changing the selection navigates to `/d/<other>/`, with the destination page rendering that dataset's data correctly.
- [ ] Opening two browser tabs on different `/d/<slug>/` URLs and switching the dropdown in one tab does not affect the other tab.
- [ ] A junk or partially-written subdir under `data/` (e.g. a directory without a `db.sqlite`) is skipped by `list()` without raising.
- [ ] `bun run format`, `bun run lint`, and `bun run typecheck` all pass.

## Blocked by

- [Issue 01: Multi-dataset directory layout and URL-routed serving](./01-self-contained-dataset-dirs.md)
