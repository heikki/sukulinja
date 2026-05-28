Status: ready-for-agent

# Persist `zoom` in URL

## Parent

`.scratch/preserve-view-state-in-url/PRD.md`

## What to build

The viewer's zoom level survives page reloads and travels in shareable URLs. This slice extends the `url-state` module scaffolded in slice 01 with `zoom` handling, and introduces the viewport's first **settle notification** surface — a thin callback hook that lets tree-view write to the URL after interactive gestures finish, without the viewport itself knowing about URLs.

End-to-end behaviour after this slice:

- URL shape: `#/person/<id>?gen=N&zoom=Z`, with `zoom` encoded to two decimals and trailing zeros stripped (`zoom=1`, `zoom=1.5`, `zoom=0.87`).
- Wheel zoom: a 200ms debounce window after the last wheel event triggers one `replaceState` write capturing the final zoom.
- Double-click fit: the resulting zoom is written immediately on completion.
- Reloading the page restores the chosen zoom from the URL, clamped to the viewport's `scaleBounds`.
- Pressing browser Back/Forward re-syncs zoom from the hash.
- Clicking a different person to refocus carries the current zoom forward in the pushed history entry alongside `gen`.
- An out-of-range `?zoom=10` clamps silently to the max; an unparseable `?zoom=abc` is dropped and the auto-fit zoom is used.
- Once `zoom` has been written, it stays in the URL (write-once stickiness) — the auto-fit value is not equality-compared against a stored float.

`url-state.ts` is extended:

- `parseHashView` reads `zoom`, clamps to `bounds.minZoom`/`bounds.maxZoom`, returns `null` when missing or unparseable.
- `buildHash` formats `zoom` to two decimals with trailing zeros stripped; omits `zoom` only when the input is `null` (no default comparison).

`viewport/controller.ts` gains a minimal settle-notification surface — a callback hook alongside the existing `chartExtents` / `canvasSize` / `canvasRect` getters that fires when a zoom interaction has settled (after wheel debounce, after dblclick fit). The exact callback shape is an implementation detail; the contract is "fire once per gesture, after the final value lands". The viewport stays ignorant of URLs.

## Acceptance criteria

- [ ] `parseHashView` reads `zoom`: clamped to `bounds`, `null` on missing/unparseable.
- [ ] `buildHash` writes `zoom` to two decimals with trailing zeros stripped; `null` zoom omits the param.
- [ ] `url-state.test.ts` covers: round-trip for `?zoom=1`, `?zoom=1.5`, `?zoom=0.87`; clamping (`zoom=10` → `maxZoom`, `zoom=0.001` → `minZoom`); unparseable `zoom=abc` dropped without throwing; write-once stickiness (a non-null `zoom` is always emitted).
- [ ] `viewport/controller.ts` exposes a settle-notification hook for zoom gestures that fires once per wheel burst (200ms debounce) and once per dblclick fit.
- [ ] Tree-view consumes the hook and `replaceState`s the URL on settle.
- [ ] The `hashchange` listener re-syncs `zoom` from the hash.
- [ ] `setFocus`'s `pushState` carries the current `zoom` forward in the pushed URL alongside `gen`.
- [ ] Reloading the page with `?zoom=1.5` in the URL applies that scale at first paint (no auto-fit override).
- [ ] Reloading the page with no `zoom` param applies the auto-fit (no regression).
- [ ] `bun run` format → lint → typecheck pass cleanly.

## Blocked by

`.scratch/preserve-view-state-in-url/issues/01-persist-gen-in-url.md`
