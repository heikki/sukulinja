Status: ready-for-agent

# App state, and the Selected person in it

Glossary (Chart): **Selected person**, **Root**. Glossary (Citation scans): **Link**, **Mark**, **Volume**, **Image**, **Scan viewer**. No new terms: "app state" and "store" are architecture names, not domain ones.

## Why

The Selected person is held in three places, joined by events and a direct call:

- tree-view holds `selectedId` and `selectedDetails`.
- The panel loads the details and announces them with `details-load`, so tree-view can hand them to the header.
- The panel loads the Links and keeps them.
- A Mark saved in the Scan viewer's people list reaches the panel by a chain: `scan-marked`, then tree-view, then `querySelector('sl-person-panel').takeLinks(resolved)`.
- `.api` is passed as a property from the app to tree-view, then on to the panel and the Scan viewer, and from the viewer to its people list.

None of this can be tested without the DOM. This is the first of #04's two slices: the plumbing and the `selected` store. 02 adds the `viewer` store.

## What changes

**Dependencies.** Add `@lit-labs/signals` `0.3.0` (exact, as karttapallo pins it) and `@lit/context` `^1.1.6` to `dependencies`.

**ADR-0012: app state in signals, built per dataset.** Record:

- App state lives in `src/client/state/`, one store per concern, each named for what it holds rather than who reads it.
- Elements read signals in `render()` through `SignalWatcher`.
- Stores change through verbs, not events. A verb that touches two stores orders them itself; no `effect()` is used where a verb can do it.
- Dependencies go one way between stores.
- `openAppState(api)` builds the stores per dataset over the Dataset API, and the app provides them with one `@lit/context`. Opening another dataset builds a fresh set, so nothing needs resetting. Tests build one over `memoryDatasetApi`.

Considered options:

- Per-element `@state` and events, as now. Rejected: that is what the ADR replaces (prop drilling, about 24 event types, events on `window`, and a direct call from tree-view into the panel).
- Module-level singletons, as in karttapallo's ADR-0004. Rejected: they would need resetting between datasets, and tests would share them.
- One context per store. Rejected: more wiring for no gain at this size.
- Passing state down as a property. Rejected: that keeps the drilling.

**`src/client/state/index.ts`.**

```ts
export interface AppState {
  api: DatasetApi;
  selected: Selected;
  // The one way to select someone: moves `selected` (02 adds the viewer).
  select(id: number): void;
}
export function openAppState(api: DatasetApi): AppState;
export const appState = createContext<AppState>(Symbol('app-state'));
```

The app element builds `openAppState(openDatasetApi(slug))` when there's a slug, provides it with `@provide({ context: appState })`, and renders `<sl-tree-view>` with no `.api`. The consuming elements read `this.state` after `super.connectedCallback()`.

**`src/client/state/selected.ts`.**

Signals:

| Signal               | Holds                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                 | `number \| null`                                                                                        |
| `details`            | `PersonDetails \| null`. The last person's stay until the new person's arrive, as the header shows now. |
| `error`              | `string \| null`: the app's words when the details couldn't load.                                       |
| `links`              | `Map<citationId, LinkResolution>`                                                                       |
| `pending`            | `boolean`: the Links are still streaming.                                                               |
| `sources` (computed) | The panel's source groups in order, each source with its link status.                                   |

`groupSources` and `linkStatus` move from `person-panel/helpers.ts` into `state/`, with their tests.

`select(id)`:

- It does nothing for the person already selected.
- Otherwise it loads their details. An answer for anyone selected before is dropped.
- Then, as the panel does now, it aborts the last Links stream and streams theirs.
- An `ApiError` sets `error`. Anything else is thrown on.

`mark(citationId, at)`:

- It saves through `api.mark` and sets that reference's Links.
- It reloads the person's Links, keeping the known ones until the new ones arrive, because a Page pin can move their other references in the Volume.
- It returns the reference resolved again.
- An `ApiError` is thrown to the caller.

`state.select(id)` calls `selected.select(id)` for now.

**Callers.**

- **tree-view.**
  - The `selectedId` and `selectedDetails` fields go. It reads `state.selected`.
  - Every place it selects (`select()`, `setRoot()`, the URL load and `hashchange`) goes through `state.select(id)`.
  - Swapping `scanOpen`/`scanFollowing` on a selection moved from `willUpdate` to that same path, since the selection is no longer an `@state`.
  - Its `.api` property goes; it uses `state.api` for persons, families and `mediaUrl`.
  - `onScanMarked` keeps only following the Link; `takeLinks` goes.
- **The header.** Its `.details` property goes; it reads `selected.details`. `.person` and `.photo` stay.
- **The panel.**
  - `.api`, `.personId` and `details-load` go. It renders from `selected`.
  - Its own `selected` state (the source folded open) is renamed `unfolded` so it doesn't clash.
  - `takeLinks` goes.
  - `@pick` and `@center` stay until #10.
- **The Scan viewer and its people list.**
  - `.api` goes; they use `state.api`.
  - The people list's Confirm calls `state.selected.mark(...)`, shows the `ApiError` words as now, and still dispatches `scan-marked` with `{resolved, link}`. That event stays only so the viewer reloads its citations and tree-view follows the Link; 02 removes it.

## Tests

**New: `src/client/state/selected.test.ts`**, over `memoryDatasetApi`:

- `select` loads the details, then the Links (checked through `asked`).
- Selecting again before the first answer drops the first person's answers.
- The details stay until the next person's arrive.
- An unknown person gives the app's words in `error`.
- `sources` is in the panel's order, with link statuses.
- `mark` saves, sets the reference's Links, and reloads the Links keeping the known ones (`pending` goes true and the map isn't cleared).
- A refused Mark throws `ApiError` with the server's words.

The moved `groupSources` and `linkStatus` tests are kept.

Check each new test fails under a mutation of the rule it covers.

**Browser smoke test** on a copy of a dataset:

- the chart, the dock and the header load;
- selecting streams the Links;
- a Confirm in the Scan viewer updates the dock's Links.
