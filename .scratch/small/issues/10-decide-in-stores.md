Status: ready-for-agent

# Open a source quietly, and who can be named, decided in the stores

Glossary: **Scan viewer**, **Entry**, **Citation**, **Role** (`src/server/citations/GLOSSARY.md`). Decision: ADR-0012 (stores change through verbs, not events; elements read signals). Builds on ADR-0026 (an Entry edited as a whole).

## Where it is now

- **Opening a source from Events.** `person-panel/helpers.ts` `viewFromEvents` dispatches a `viewing-source` DOM event, then calls `state.viewer.open`. `person-panel/index.ts` catches the event into a `quietly` field, and its `updated()` skips revealing that source in Sources. Called from `events.ts` (a Fact picked while the Scan viewer is open) and `fact-sources.ts` (a source opened from _Edit sources_). An open held while a Box is pending, then stayed, leaves `quietly` set for whatever opens next. None of it is tested: there's no DOM test environment.
- **Who can be named in a pending Entry.** `scan-viewer/layer.ts` `notNamable()` works it out in the element: whoever's Citations link the Image shown, but for the people of the Entry being edited, and whoever is named (but in a Book with no Roles). It leaves out everyone the Entry named before, even one with another Citation linking the Image, whom the server then refuses (its rule leaves out only the Entry's own Citations). Untested.

## What to build

### Opening a source, and Sources brought to it

- **`viewer.openSource(source, { reveal })`** in place of `viewFromEvents`: opens the source's Link, or failing one its parish's Volumes to look through, as `viewerOpening` says (it moves from `person-panel/helpers.ts` into the state); false when it has nothing to open there. Held while a Box is pending, as `open` is. Events and _Edit sources_ call it with `reveal: false`; Sources (`sources.ts`) calls it too, revealing.
- **`viewer.revealing: Readable<LinkOpen | null>`**: the open Sources is to be brought to. Every open gives a new one, so opening the same source again brings Sources to it again; null for an open with `reveal: false`, or while the viewer has moved off its Link. Every other open (a person picked in the Scan viewer, onward, the chart's select) reveals, as now.
- **The panel reads it**: `updated()` reveals when `revealing` changes. The `viewing-source` event, the `quietly` field and the dispatch go. `show-source` (a source with nothing to open in the Scan viewer, asked for in Sources) stays an event: it runs inside the panel's own elements and touches no store.
- Keep the new verb's body out of `viewer.ts` where it can go: there, only its wiring.

### Who can be named

- **`viewer.entryForm.notNamable: Readable<Set<number>>`** (in `state/pending-entry.ts`), in place of `layer.ts`'s: those with a Citation linking the pending Box's Image that isn't of the Entry being edited (by its Entry id, as the server's rule has it), and those named, but someone named in no Role of a Book with Roles can still be given one. `citingImage` moves with it into the state.
- `layer.ts` reads it.
- The rest of `scan-viewer/cite.ts` (whom a Role offers, the parents from the tree, a child bringing theirs) stays as it is.

## Done when

- `viewer.test.ts`: an open from Events leaves `revealing` null; one from Sources gives the open, and opening it again a new one; an open held by a pending Box, then stayed, leaves nothing for the next open, which reveals; `openSource` with nothing to open gives false and opens nothing.
- The pending Entry's tests: `notNamable` leaves out someone the edited Entry names who has another Citation linking its Image, as the server refuses them; leaves out the named; offers someone named with no Role a Role in a baptism.
- `bun run format`, `lint`, `typecheck` and the tests pass.
