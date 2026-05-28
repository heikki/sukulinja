Status: ready-for-agent

# Record ADR-0004 for view-state-in-URL decisions

## Parent

`.scratch/preserve-view-state-in-url/PRD.md`

## What to build

A new architecture decision record at `docs/adr/0004-preserve-view-state-in-url.md` capturing the non-obvious design choices made for view-state URL persistence, so that a future reader of the code doesn't have to reverse-engineer the reasoning from the implementation.

The ADR meets all three of the project's ADR criteria:

1. **Hard to reverse**: shared URLs in the wild lock in the encoding. Changing the param keys, the `pan` format, or the zoom precision later breaks existing links.
2. **Surprising without context**: several of the choices read as non-obvious — for example, why pan and zoom are written only on interaction (never on initial auto-fit), why refocus is a two-step push-then-replace, and why the hash carries query-suffix params instead of using a real query string or path segments.
3. **The result of a real trade-off**: each choice was made against genuine alternatives that were explicitly considered.

The ADR should follow the same style and structure as the existing `docs/adr/0001-*.md`, `0002-*.md`, and `0003-*.md` files, and should record at minimum:

- **The decision**: view state (Focus, Generation limit, pan, zoom) lives in the URL hash as `#/person/<id>?gen=N&pan=X,Y&zoom=Z`.
- **Why hash-with-query-suffix, not real query string or hash path segments**: all four pieces are pure client state; keeping them in the hash means no server round-trip and no access-log leakage; query-suffix style keeps the existing `#/person/<id>` route intact and lets params be orthogonal and easy to evolve.
- **Why writes happen only on user interaction (not on initial auto-fit)**: keeps default URLs clean and shareable as "go to this person at default fit"; auto-fit values depend on canvas size and don't reproduce on a smaller recipient screen.
- **Why pan and zoom are write-once-sticky (no default stripping)**: their "defaults" are float-derived from canvas size; equality-comparing on write is brittle. Only `gen` has a clean integer default that can be stripped.
- **Why refocus is two-step push-then-replace**: the new pan is computed in the next `updated()` cycle after `pushState`, not synchronously. Honest about the state-flow; ends up with a history entry that carries the post-pin pan for Back/Forward restoration.
- **Why `replaceState` for gen/pan/zoom and `pushState` only for Focus**: a slider tick or wheel scroll is not a navigation event; only changing who the chart is centered on is.
- **Why a 200ms wheel debounce and slider-on-`change` (not on `input`)**: avoids flooding `history.replaceState` during continuous interactions; one URL write per gesture.

## Acceptance criteria

- [ ] `docs/adr/0004-preserve-view-state-in-url.md` exists, follows the structure of the existing ADRs in `docs/adr/`.
- [ ] Each decision listed above is recorded with a brief rationale and the rejected alternatives.
- [ ] The ADR is referenceable from future code reviews and design discussions — it stands on its own without requiring the reader to dig through the PRD or the slice tickets.

## Blocked by

`.scratch/preserve-view-state-in-url/issues/03-persist-pan-in-url.md`
