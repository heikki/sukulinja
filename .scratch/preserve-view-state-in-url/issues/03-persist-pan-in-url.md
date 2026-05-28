Status: ready-for-agent

# Persist `pan` in URL

## Parent

`.scratch/preserve-view-state-in-url/PRD.md`

## What to build

The viewer's pan offset survives page reloads and travels in shareable URLs. This slice extends `url-state` with `pan` handling, extends the viewport's settle-notification surface to cover drag-momentum-settle and refocus-pin completion, and introduces the two-step `pushState`-then-`replaceState` flow on Focus changes.

End-to-end behaviour after this slice:

- URL shape: `#/person/<id>?gen=N&pan=X,Y&zoom=Z`. `pan` is two integers, comma-separated, with negative values supported (`pan=-80,-120`, `pan=0,-80`).
- Drag-pan: the URL is updated once via `replaceState` after momentum has settled (not during the drag).
- Double-click fit: the resulting pan is written immediately alongside zoom.
- Refocus (clicking a person box): `pushState` synchronously creates a new history entry at `#/person/<newId>?gen=N&zoom=Z` (current `gen` and `zoom`, no `pan`); after the pin lands in the next `updated()` cycle, `replaceState` appends `&pan=X,Y` for the computed pin position.
- Title click (`resetFocus`): same two-step flow — `pushState` for the default Focus carrying current `gen` and `zoom`, then `replaceState` with the canvas-centered pan.
- Reloading the page restores the pan from the URL exactly (integer round-trip).
- Pressing browser Back/Forward re-syncs pan from the hash. When the hash supplies a `pan`, the existing canvas-recenter branch in the hashchange handler is suppressed — the stored pan is authoritative.
- Once `pan` has been written, it stays in the URL (write-once stickiness) — the auto-fit pan is not equality-compared.
- An unparseable `?pan=foo` is dropped without breaking the rest of the URL.

`url-state.ts` is extended:

- `parseHashView` reads `pan` as `{x, y}` integers from the `x,y` format; returns `null` on missing or unparseable (including a single-axis or non-integer component).
- `buildHash` formats `pan` as `pan=<int>,<int>`; omits `pan` only when the input is `null`.

`viewport/controller.ts` extends its settle-notification surface to also fire when drag-momentum has settled and when a refocus pin has been applied. The viewport stays ignorant of URLs; tree-view subscribes and writes.

`tree-view/index.ts`'s `setFocus`:

- Pushes `#/person/<newId>?gen=N&zoom=Z` synchronously on the click (no `pan` in this entry).
- After the pin applies in `updated()`, performs a `replaceState` to add `&pan=X,Y` to the same entry — so back/forward later restores the post-pin pan.

`tree-view/index.ts`'s `onHashChange`:

- Re-syncs `pan` in addition to focus, gen, and zoom.
- Skips the existing `beginRefocus(canvasCenter)` recenter branch when the incoming hash supplies a `pan`, since the stored pan is the authoritative restore target.

## Acceptance criteria

- [ ] `parseHashView` reads `pan` as `{x, y}` integers; `null` on missing/unparseable; negatives supported; `0` supported.
- [ ] `buildHash` writes `pan` as `pan=<int>,<int>`; `null` pan omits the param.
- [ ] `url-state.test.ts` covers: round-trip for `?pan=120,-80`, `?pan=-80,-120`, `?pan=0,-80`; unparseable `pan=foo` and partial `pan=120` dropped without throwing; write-once stickiness (a non-null `pan` is always emitted).
- [ ] `viewport/controller.ts`'s settle-notification surface now also fires on drag-momentum settle and refocus-pin completion.
- [ ] Tree-view consumes those callbacks and `replaceState`s the URL with the new pan.
- [ ] `setFocus` performs `pushState` synchronously with focus+gen+zoom, then `replaceState` to add pan after the pin lands.
- [ ] Title click (`resetFocus`) follows the same two-step flow — current gen and zoom carry over, only Focus and centering change.
- [ ] `onHashChange` re-syncs `pan` and suppresses the canvas-recenter branch when the incoming hash supplies a `pan`.
- [ ] Reloading the page with `?pan=120,-80&zoom=1.5` in the URL renders the chart at that exact pan and zoom.
- [ ] Pressing Back after `focus A → drag → focus B → drag` restores the pre-focus-B pan when landing back on Focus A.
- [ ] An out-of-range `?gen=99` still clamps; an unparseable `?pan=foo` is dropped; the rest of the URL still applies.
- [ ] `bun run` format → lint → typecheck pass cleanly.

## Blocked by

`.scratch/preserve-view-state-in-url/issues/02-persist-zoom-in-url.md`
