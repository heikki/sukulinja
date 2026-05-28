Status: ready-for-agent

# Persist Generation limit (`gen`) in URL

## Parent

`.scratch/preserve-view-state-in-url/PRD.md`

## What to build

The viewer's chosen **Generation limit** (currently the `levels` 1–5 slider) survives page reloads and travels in shareable URLs. This is the first slice of a four-slice rollout; it scaffolds the shared `url-state` module that subsequent slices will extend with `pan` and `zoom`.

End-to-end behaviour after this slice:

- URL shape: `#/person/<id>?gen=N`, where `gen` is omitted when equal to the default (`2`).
- Moving the slider to a non-default value updates the URL via `replaceState` once, when the slider is released (`change`), not on every step (`input`). Live preview during the drag still works.
- Reloading the page restores the chosen Generation limit from the URL.
- Pressing browser Back/Forward re-syncs the Generation limit from the hash alongside the Focus.
- Clicking a different person to refocus carries the current Generation limit forward in the pushed history entry.
- The `levels` Lit property is renamed to `gen` (default `2` lives in the property initializer); the matching `.levels` CSS toolbar class becomes `.gen`.
- `app/index.ts` no longer sets the `levels="2"` attribute on `<sl-tree-view>` — the URL is the authoritative source and the property default is the fallback.

A new pure module `tree-view/url-state.ts` owns the hash encoding/decoding:

- `parseHashView(hash, bounds)` returns a `ParsedView` (`focusId`, `gen`, `pan`, `zoom`) with each field `null` when missing or unparseable, and clamped values when out of range.
- `buildHash(view, defaults)` produces the full hash string, stripping `gen` when equal to `defaults.gen`.

This slice's implementation of `url-state.ts` need only handle `focusId` and `gen`; the function signatures already account for `pan` and `zoom` (returning `null`) so later slices extend the module without breaking its callers.

Approximate interface (from PRD):

```ts
type ParsedView = {
  focusId: number | null;
  gen: number | null;
  pan: { x: number; y: number } | null;
  zoom: number | null;
};

type Bounds = {
  maxGen: number;
  minZoom: number;
  maxZoom: number;
};

function parseHashView(hash: string, bounds: Bounds): ParsedView;

function buildHash(
  view: {
    focusId: number;
    gen: number;
    pan: { x: number; y: number } | null;
    zoom: number | null;
  },
  defaults: { gen: number }
): string;
```

## Acceptance criteria

- [ ] `tree-view/url-state.ts` exists with `parseHashView` and `buildHash`, supporting `focusId` and `gen` (returning `null` for `pan` and `zoom`, which are filled in by later slices).
- [ ] `tree-view/url-state.test.ts` covers: round-trip for `#/person/123` and `#/person/123?gen=3`; default stripping (`gen=2` is omitted); `gen` clamped to `[1, maxGen]` on read; unparseable `gen` dropped without throwing; missing params return `null`.
- [ ] The Lit property `levels` on `TreeViewElement` is renamed `gen`, with default `2` in the initializer.
- [ ] The `.levels` CSS class in `tree-view/styles.ts` is renamed `.gen` and the toolbar template hook in `tree-view/index.ts` updated to match.
- [ ] `app/index.ts` no longer sets the `levels="2"` attribute on `<sl-tree-view>`.
- [ ] The Generation limit slider updates the URL via `history.replaceState` on `change` (release), not on `input` (every step).
- [ ] The `hashchange` listener re-syncs `gen` from the hash in addition to Focus.
- [ ] `setFocus`'s `pushState` produces a URL that includes the current `gen` (omitted when equal to default).
- [ ] Reloading the page with `?gen=3` in the URL renders the chart at three generations.
- [ ] Pressing browser Back after a sequence of refocuses with varying `gen` values restores each step's `gen`.
- [ ] `bun run` format → lint → typecheck pass cleanly.

## Blocked by

None — can start immediately.
