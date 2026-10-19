# App state in signals, built per dataset

What the screens of a dataset share, such as the **Selected person** and their Links, was held by whichever element loaded it and passed around by property, by event and by a direct call between elements. None of it could be tested without the DOM.

App state now lives in `@lit-labs/signals` stores:

- **One store per concern,** in `src/client/state/`, each named for what it holds rather than who reads it: `selected` holds the Selected person, their details and their Links, and `viewer` what the **Scan viewer** shows.
- **Elements read signals in `render()`** through the `SignalWatcher` mixin, and re-render when what they read changes.
- **Stores change through verbs, not events.** A signal's readers can only `get` it. A verb that touches two stores orders them itself, and no `effect()` is used where a verb can do it.
- **Dependencies go one way between stores:** `viewer` reads `selected`, never the other way round.
- **Built per dataset.** `openAppState(api)` builds the stores over the dataset's Dataset API, and the app provides them with one `@lit/context`, `appState`. Opening another dataset builds a fresh set, so nothing needs resetting. Tests build one over `memoryDatasetApi`.
- **`state.select(id)` is the one way to select someone.** It moves `selected`, then tells `viewer`, which goes on with a person picked in it or closes (ADR-0011).

## Considered options

- **Per-element `@state` and events, as before.** Rejected: that is what this replaces: the Dataset API passed down by property through three levels, about 24 event types, some on `window`, and a direct call from tree-view into the panel to hand it a Mark's Links.
- **Module-level singletons,** as in karttapallo's ADR-0004. Rejected: they would need resetting between datasets, and tests would share them.
- **One context per store.** Rejected: more wiring for no gain at this size.
- **Passing state down as a property.** Rejected: that keeps the drilling.

## Consequences

- An element reads `this.state` only once it has connected, when `@consume` has had its answer from the app.
- The app provides through a `ContextProvider` rather than `@provide`, since the dataset chooser has no state to provide and `@provide`'s field can't be null.
