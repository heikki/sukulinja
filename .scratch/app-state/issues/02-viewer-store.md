Status: ready-for-agent
Blocked by: 01

# Hold what the Scan viewer shows in a `viewer` store

Glossary (Chart): **Selected person**. Glossary (Citation scans): **Link**, **Mark**, **Volume**, **Image**, **Scan viewer**, **Vision match**. No new terms.

## Why

What the Scan viewer shows is split three ways:

- tree-view holds the open source (`scanOpen`), whether you've stepped away (`scanAway`) and a pick in the viewer (`scanFollowing`).
- The panel holds the source order that ↑/↓ steps through.
- The viewer holds the Image, the Volume's citations and the Image count.

They are joined by `scan-open`, `scan-close` (in two shapes, one on `window`), `scan-step` on `window`, `scan-away`, `scan-marked`, `scan-show` and `scan-pick`. ADR-0011's rule, "the Scan viewer belongs to the selected person", is only in tree-view's `willUpdate`, and nothing is tested.

## What changes

**`src/client/state/viewer.ts`**, added to `AppState` as `viewer`. It depends on `selected`, and not the other way round.

Signals:

| Signal            | Holds                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `source`          | `{citation, link} \| null`. `LinkOpen` moves here. Each `open` sets a new object.           |
| `volume`          | `{id, label} \| null`                                                                       |
| `image`           | `number`                                                                                    |
| `count`           | `number \| null`: the length of Astia's list. It stays null if the list fails.              |
| `citations`       | `VolumeCitation[] \| null \| 'failed'`                                                      |
| `away` (computed) | Whether the viewer is off the Link's Image. A Link to only the Volume holds anywhere in it. |
| `sourcesInView`   | Whether the dock's Sources list can be seen. The panel writes it.                           |

Verbs:

- **`open(source)`** goes to the Link even when it shows that source already.
  - In the Volume shown, an Image Link moves to the Image, and a Volume-only Link stays where it is.
  - Another Volume opens on the Link's Image, or on Image 1. It loads the count and the citations, one at a time, with the last ask winning. `Latest` moves to `state/`.
- **`show(n)`** clamps to the count.
- **`step(±1)`** does nothing unless `sourcesInView`. Otherwise it opens the next source with a Link in `selected.sources`, and nothing past either end.
- **`pick(row)`** handles a person picked in the viewer.
  - For the selected person, it opens their citation and answers null.
  - For anyone else, it notes their citation and answers their id. The part that was clicked then dispatches `scan-person`, and tree-view selects them by its own rules (#10 later moves those rules out).
- **`selected(id)`**, called by `state.select` after `selected.select`, goes on with a noted pick for that person, or else closes (ADR-0011).
- **`confirm(row)`** calls `selected.mark(citationId, {volumeId, image})` and then reloads the citations. If the open source is that reference, it follows the Link in the marked Volume. An `ApiError` is thrown to the people list, which shows its words as now.
- **`close()`** sets `source` to null.

`ScanMarked` and `markedIn` move from `scan-viewer/helpers.ts` into the store.

**Callers.**

- **tree-view.**
  - `scanOpen`, `scanAway` and `scanFollowing` go, along with the handlers for `scan-open`, `scan-close`, `scan-away` and `scan-marked`.
  - It renders `<sl-scan-viewer>` while `viewer.source` isn't null.
  - `scan-person` stays and calls `select()`.
- **The panel.**
  - `.viewing` goes; it reads `viewer.source` and `viewer.away`.
  - Opening a source calls `viewer.open`.
  - The `window` listeners for `scan-step` and `scan-close` go.
  - It gets the dock's open state as a `.docked` property from tree-view, instead of `closest('sl-side-dock')`. It sets `viewer.sourcesInView` in `updated()`.
  - Focus goes back when `viewer.source` goes from a source to null while the same person stays selected and the Sources can be seen. A close caused by selecting someone else changes `selected.id` in the same `select()`, so focus stays where it was, as now.
- **`sl-scan-viewer`.**
  - `.citation` and `.link` go; `.persons` stays until #11.
  - The loads and `scan-away` go.
  - It notices a new Volume or Image by comparing with the last it drew, and resets its drawing state as `open()` and `show()` do now. A new `source` object moves focus to it.
  - Esc calls `viewer.close()`. ←/→ call `viewer.show`, and ↑/↓ call `viewer.step`.
  - The frame, pan and zoom, the thumbnail fade, loading and retry, prefetch and hover stay in the element.
- **The viewer's parts.**
  - nav reads `image` and `count`, and calls `show(n)`; `scan-show` goes.
  - people reads `citations`, `image`, `source` and `volume`, and calls `confirm` and `pick`. `scan-marked` and `scan-pick` go.
  - entries calls `pick`.
  - toolbar reads `source` and calls `close()`. Its `scan-close` goes, and it stays a file.
  - `scan-hover` stays, as an event between siblings.
- **`keys.ts`.** `ScanStep` and `ScanClose` go; `stepOf` stays.

After this slice, the only scan events left are `scan-person` (until #10) and `scan-hover`.

## Tests

**New: `src/client/state/viewer.test.ts`**, over `memoryDatasetApi`:

- `open` goes to the Link's Image, and a Volume-only Link holds anywhere in the Volume.
- Opening the same source again goes back to its Image.
- `away`, and `show` clamping to the count.
- `step` walks the linked sources in order, does nothing past either end, and does nothing out of view.
- Selecting another person closes the viewer; picking one in the viewer goes on with their citation.
- `confirm` reloads the citations and the selected person's Links, and follows only its own reference's Link.
- A refused `confirm` throws with the server's words.
- Astia down leaves the count unknown and the citations `'failed'`.

Check each new test fails under a mutation of the rule it covers.

**Browser smoke test** on a copy of a dataset:

- open a source, step with ←/→ and ↑/↓, and close with Esc (focus goes back to the source);
- pick someone in the viewer;
- select someone in the chart (the viewer closes);
- confirm a Vision match.
