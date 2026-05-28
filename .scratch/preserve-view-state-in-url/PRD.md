Status: ready-for-agent

# Preserve view state in URL

## Problem Statement

When viewing the **Hourglass chart**, the only piece of view state stored in the URL is the **Focus** person (`#/person/<id>`). The **Generation limit** (currently the `levels` slider, 1–5), the pan offset, and the zoom level are all transient — they vanish on a page reload and cannot be shared.

This shows up in two ways:

- **Refresh-resistance**: If a viewer has set up a useful view (e.g. focus on a specific ancestor, two generations of context, zoomed in on the **Parent row**) and the page reloads — manually or because of a tab restore — they land back at the default fit with the default Generation limit.
- **Shareable view links**: A viewer cannot send a colleague a URL that opens at the exact same view they were looking at. They can only share the Focus person; the recipient sees the auto-fit at the default Generation limit.

## Solution

Encode the four pieces of view state — Focus, Generation limit, pan, and zoom — into the URL hash, so the same URL reproduces the same view on reload and when opened by another viewer.

The URL shape becomes:

```
#/person/<id>?gen=N&pan=X,Y&zoom=Z
```

Focus is already pushed to history on click. The other three are written with `replaceState` so they don't pollute the back/forward stack. None of them appear in the URL until the viewer has actually expressed a non-default view — a fresh-dataset visit stays at the clean `#/person/<id>` URL.

Back and forward buttons re-sync all four pieces of state from the hash, so a viewer can walk back through their Focus history and land on the same pan/zoom they had at the time of each click.

## User Stories

1. As a viewer, I want my pan and zoom to survive a page reload, so that an accidental refresh doesn't nuke the view I just set up.
2. As a viewer, I want my chosen Generation limit to survive a page reload, so that I don't have to drag the slider back to the value I prefer every time.
3. As a viewer, I want to copy the current URL and paste it into a chat to a relative, so they can open it and see the exact same Focus, Generation limit, pan, and zoom I'm looking at.
4. As a viewer reopening a closed tab, I want the browser's tab-restore to land me on the same view I left, so I can resume where I was.
5. As a viewer pressing the browser Back button after refocusing through several people, I want each previous step to restore not just the Focus but also the pan and zoom that were live at that step.
6. As a viewer pressing Forward after going Back, I want the same — pan and zoom restore to whatever was live before I navigated away.
7. As a first-time viewer of a dataset, I want the URL to stay clean (`#/person/123`) until I have actually moved the chart, so the address bar doesn't show parameters I never set.
8. As a viewer who tweaks the Generation limit slider from 1 to 3 and back to 2, I want the URL to revert to `gen=2`'s default-omitted form, so that "default" is one canonical URL.
9. As a viewer dragging the Generation limit slider live, I want the chart to preview each step, but the URL to update only when I release the slider — one URL write per gesture, not five.
10. As a viewer scrolling the wheel to zoom, I want the URL to update once when I stop scrolling, not on every individual wheel tick, so the address bar isn't flickering during the gesture.
11. As a viewer dragging to pan, I want the URL to update once when momentum has settled, not during the drag, so the back/forward stack and address bar stay quiet during interaction.
12. As a viewer double-clicking the canvas to refit, I want the URL to capture the new pan and zoom from the fit, so the fit view is itself shareable.
13. As a viewer clicking on a different person to refocus, I want the new URL entry pushed to history to carry my current Generation limit and zoom forward, so a Back press returns to the previous Focus's state.
14. As a viewer clicking on a different person, I want the resulting pin to set the pan that lands in the URL, so a shared link reproduces the same on-screen pin location.
15. As a viewer clicking the title to reset Focus to the default person, I want my current Generation limit and zoom to carry over (only the Focus and centering change), so the reset is "go home to who" not "reset everything".
16. As a viewer opening a URL with an out-of-range value (`?zoom=10` or `?gen=99`), I want the value silently clamped to the valid range rather than the page crashing.
17. As a viewer opening a URL with an unparseable value (`?pan=foo` or `?zoom=abc`), I want that one parameter ignored and the rest of the URL honored, with the missing piece falling back to its default.
18. As a viewer opening a URL with `?gen=3` but no `pan`/`zoom`, I want the auto-fit to apply with the supplied Generation limit, so I can share "look at this person, three generations" without pinning a viewport size.
19. As a viewer manually editing the URL bar and pressing Enter, I want the chart to re-sync all four pieces of state from the new hash, so URL editing acts as a navigation primitive.
20. As an agent or script generating links, I want pan encoded as `pan=x,y` (one parameter) rather than `px=x&py=y` (two), so the conceptual "one pan value" maps to one URL parameter.

## Implementation Decisions

### URL syntax

- Hash with query suffix: `#/person/<id>?gen=N&pan=X,Y&zoom=Z`.
- Existing `#/person/<id>` route is preserved; the new params hang off it as an orthogonal query suffix on the hash side. No real query string and no path-segment encoding — keeps all view state in the hash so no server round-trip is implied and nothing leaks to access logs.
- Param keys: `gen` (Generation limit), `pan` (offset), `zoom` (scale). The choice of `gen` aligns with the canonical domain term **Generation limit** in `CONTEXT.md`; the code property currently named `levels` will be renamed to `gen` so URL and code agree.

### Encoding

- **`gen`**: integer; written when not equal to the default (`2`). Stripped from the URL when set back to default.
- **`pan`**: two integer chart-coord pixels, comma-separated (`pan=120,-80`). Sub-pixel precision is dropped — invisible at any reasonable zoom.
- **`zoom`**: float to 2 decimals, trailing zeros stripped (`zoom=1`, `zoom=1.5`, `zoom=0.87`).
- **Clamp on read**: out-of-range values clamp silently (`zoom` clamps to viewport `scaleBounds`, `gen` clamps to the slider's 1–5 range).
- **Drop on parse error**: unparseable params are dropped; the rest of the URL is honored and the dropped one falls back to its default behavior.

### Write triggers (all `replaceState` except focus-push, which keeps `pushState`)

- **Initial auto-fit on first paint**: **no write**. Clean URLs by default; pan/zoom appear only after the viewer has expressed a view.
- **Drag-pan**: write once on momentum settle.
- **Wheel zoom**: debounce 200ms after the last wheel event, then write.
- **Generation limit slider**: write on `change` (slider released), not `input` (every step). Live preview still updates on `input`.
- **Double-click fit**: write on completion.
- **Refocus pin (clicking a person box)**: `pushState` with `#/person/<newId>?gen=N&zoom=Z` synchronously on click, then `replaceState` to add `&pan=X,Y` after the pin lands in the next `updated()` cycle.
- **Title click (reset Focus)**: Generation limit and zoom carry over; only Focus and centering change.

### Persistence rules

- **`gen`** is stripped from the URL when equal to the default (`2`).
- **`pan` and `zoom`** are write-once-sticky: once they appear in the URL they stay until overwritten. Their "default" (the auto-fit) is recomputed from canvas size and is not directly comparable to a stored value without float drift.

### Refocus and back/forward

- The existing `pushState` on focus click is preserved; the new params come along for the ride on the pushed URL.
- The `hashchange` listener re-syncs **all four** pieces of state, not just Focus. When the hash on a back/forward event supplies a `pan`, the existing canvas-recentering branch is suppressed — the stored pan is the authoritative one.

### Modules

- **New** `tree-view/url-state.ts`: pure functions for parsing and serializing the hash. Encapsulates all encoding rules (precision, clamping, default-stripping, drop-on-error). Deep module with a small surface — the caller hands in raw strings and view-state objects; the module hands back validated state and finished hash strings. The encoding rules can change inside the module without rippling out.
  - Approximate interface:

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

- **Modify** `tree-view/index.ts`: wire the hashchange listener to re-sync all four params, hook the write triggers to the viewport's settle events, add a 200ms wheel-zoom debounce, switch the slider's URL write from `input` to `change`, rename the `levels` property to `gen`.
- **Modify** `tree-view/viewport/controller.ts`: add a minimal settle-notification surface (callback hooks alongside the existing `chartExtents` / `canvasSize` / `canvasRect` getters, or equivalent) so tree-view can write after drag-momentum settle, wheel debounce, dblclick fit, and refocus pin without polling. Viewport stays ignorant of URLs.
- **Modify** `app/index.ts`: drop the `levels="2"` attribute on `<sl-tree-view>` — the default lives in the property initializer and the URL is the authoritative source.
- **Modify** `tree-view/styles.ts`: rename the `.levels` CSS class (and its toolbar markup hook) to `.gen` to match the renamed property.

## Testing Decisions

Tests focus on `tree-view/url-state.ts` only — the pure parse/serialize layer. The wiring in `tree-view/index.ts` and the settle surface added to `viewport/controller.ts` are integration-flavored and validated by manual smoke (open a dataset, drag/zoom/slider, reload, back/forward).

Good tests exercise the externally observable contract — given hash strings in, parsed-view objects out, and the round-trip property — rather than the internal regex or formatter helpers.

### Cases for `tree-view/url-state.ts`

- **Round-trip**: `buildHash(parseHashView(s)) === s` for every canonical input — `#/person/123`, `#/person/123?gen=3`, `#/person/123?pan=120,-80`, `#/person/123?gen=3&pan=120,-80&zoom=1.5`. Encoding is canonical: no float tails, no trailing zeros, integer pan.
- **Default stripping**: `buildHash` with `gen` equal to its default omits the `gen` param.
- **Write-once stickiness**: `buildHash` with a non-null `pan` or `zoom` always emits the param, even if the value happens to equal a hypothetical default.
- **Clamping on read**: `parseHashView` clamps `zoom` to the supplied bounds (`zoom=10` → `maxZoom`; `zoom=0.001` → `minZoom`), clamps `gen` to `[1, maxGen]`.
- **Drop on parse error**: `parseHashView` returns `null` for one malformed param (`pan=foo`, `zoom=abc`, `gen=xx`) while still parsing the others correctly.
- **Missing-params resilience**: `parseHashView` returns sensible `null`s for omitted params; never throws.
- **Pan encoding**: negative pan values round-trip (`pan=-80,-120`); pan with zero on one axis round-trips (`pan=0,-80`).
- **Zoom encoding**: integer zooms emit without decimals (`zoom=1`); trailing-zero zooms emit stripped (`zoom=1.5`, not `zoom=1.50`); two-decimal precision is preserved on round-trip (`zoom=0.87`).

### Prior art

The repo already has unit tests for pure helpers next to their modules (e.g. `tree-view/viewport/controller.test.ts`, `tree-view/viewport/transform.test.ts`). `url-state.test.ts` follows the same shape — sibling file, pure-function input/output assertions, no DOM.

## Out of Scope

- **Pan/zoom as default-stripped**: the auto-fit values are float-derived from canvas size; equality-comparing them at write-time would be brittle. They stay in the URL once set, by design.
- **History entries per gen/pan/zoom change**: only Focus changes push to history. Tweaking the slider, dragging, or zooming never adds a history entry.
- **A separate write-coordinator module**: the wiring (hashchange, write triggers, debounce timer) is small enough to live inline in `tree-view/index.ts` without an extra layer.
- **Server-side URL handling**: nothing in this PRD changes the server's pathname routing; all four params are hash-only.
- **Migrating existing shared links**: there are no shared links in the wild today; the design only adds new params and never removes the existing `#/person/<id>` shape.
- **Persisting view state to localStorage**: the URL is the single source of truth. No parallel local persistence.
- **Dataset slug changes**: the `/d/<slug>/` portion of the path is owned by `app/index.ts` and unchanged.

## Further Notes

- Per the existing `feedback_component_layout` convention, `url-state.ts` and `url-state.test.ts` sit as siblings of `tree-view/index.ts`.
- After implementation, `docs/adr/0004-preserve-view-state-in-url.md` should record the non-obvious choices: interaction-only writes (no write on initial fit), write-once stickiness for pan/zoom, the two-step push-then-replace on refocus, and the choice of hash-query suffix over path segments or real query string. These are exactly the choices a future reader would otherwise wonder about, and shared URLs in the wild make the encoding hard to reverse.
