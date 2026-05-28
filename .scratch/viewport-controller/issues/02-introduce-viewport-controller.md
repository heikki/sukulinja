Status: ready-for-agent

# Introduce `ViewportController` and migrate `TreeViewElement` to use it

## What to build

Today `TreeViewElement` (`src/client/components/tree-view/index.ts`) owns five distinct concerns: data loading, focus state + hash routing, pan/scale state, drag/momentum/wheel/dblclick handling, and the pin-on-refocus choreography that coordinates focus changes with the post-rebuild Lit lifecycle. The viewport-related state and behavior interact across `willUpdate`/`updated` via `pendingPinScreen`; none of it has tests, and the interaction is the bug surface.

This slice extracts everything viewport-related into a `ViewportController` (a Lit `ReactiveController`) living at `tree-view/viewport/controller.ts`, with a test file covering the interaction scenarios. `TreeViewElement` then keeps only the non-viewport concerns: data loading, `focusId` + hash routing, `setFocus` policy, `query` (search), `levels` `@property`, `chartExtents` capture during `render()`, and box rendering.

### Controller shape

```ts
class ViewportController implements ReactiveController {
  // Observable — mutations call host.requestUpdate()
  readonly pan: Point;
  readonly scale: number;
  readonly panReady: boolean;
  readonly dragging: boolean;
  readonly dragMoved: boolean;
  readonly hasPendingPin: boolean;

  constructor(
    host: ReactiveControllerHost,
    measurements: ViewportMeasurements,
    options: ViewportOptions,
  );

  // ReactiveController lifecycle — attach/detach window mousemove/mouseup
  hostConnected(): void;
  hostDisconnected(): void;

  // Canvas wiring
  attachCanvas(el: HTMLElement | null): void; // owns passive:false wheel attach/detach
  onMouseDown(e: MouseEvent): void;
  onDblClick(e: MouseEvent): void;

  // Render-time
  ensureInitialPan(): void; // idempotent; called from element.updated() when !panReady

  // Refocus coordination
  beginRefocus(pinScreen: Point | null): void; // cancels momentum, sets pending pin
  applyPendingPin(): void; // call from element.updated() after rebuild

  // Helper used by the element to compute pin points
  chartToScreen(p: Point): Point | null;
}

interface ViewportMeasurements {
  chartExtents(): Extents | null;
  canvasSize(): Size | null;
  canvasRect(): DOMRect | null;
}
```

`ViewportOptions` bundles the constants currently inlined at the top of `index.ts`: `scaleBounds`, `wheelZoomK`, `fitOptions`, `momentumOptions`, `dragThresholdPx`, `svgMarginPx`.

### Design decisions baked in

- **Port pattern for measurements**, not per-call args. The element constructs the controller with three lambdas reading `this.chartExtents` / canvas size / canvas rect at call time. This works correctly with Lit's lifecycle: `chartExtents()` returns the _old_ extents during `willUpdate` (before render writes the new value) and the _new_ extents during `updated()` — exactly what the pin-on-refocus mechanism needs.
- **Controller owns window mousemove/mouseup listeners** (installed in `hostConnected`). Element only wires canvas-level events.
- **Refocus pin uses explicit screen point**: `beginRefocus(pinScreen | null)`. The element computes the pin point per trigger (`chartToScreen(box.pos)` for box clicks, `{ x: w/2, y: h/2 }` for search/reset/hash, `chartToScreen({x:0,y:0})` for levels-change). Element keeps the policy of which point goes with which trigger; controller just stores and applies it.
- **`dragMoved` is exposed as a read-only property** so the element's box-click handler can suppress focus on drag.
- **`hasPendingPin` is exposed** so the levels-change handler in `willUpdate` can preserve the "don't overwrite existing pending pin" guard.

### Element call sites after migration

- `setFocus(id, pinScreen)` → `this.viewport.beginRefocus(pinScreen); this.focusId = id; ...`
- `willUpdate` levels-change → `if (changed.has('levels') && this.viewport.panReady && !this.viewport.hasPendingPin) { const pos = this.viewport.chartToScreen({x:0, y:0}); if (pos !== null) this.viewport.beginRefocus(pos); }`
- `updated()` → `this.viewport.attachCanvas(this.queryCanvas()); this.viewport.ensureInitialPan(); this.viewport.applyPendingPin();`
- `renderBox` suppression → `if (this.viewport.dragMoved) return;`

Canvas template binds `@mousedown=${(e) => this.viewport.onMouseDown(e)}` and `@dblclick=${(e) => this.viewport.onDblClick(e)}`. Wheel is attached via `attachCanvas(el)` to preserve the `passive: false` requirement.

### Tests (`viewport/controller.test.ts`)

All against a fake `ViewportMeasurements` + a stub `ReactiveControllerHost` — no JSDOM or Lit:

1. Drag FSM: mousedown → moves below threshold (`!dragging`) → past threshold (`dragging`, `dragMoved`) → mouseup (momentum kicks in with computed velocity).
2. Momentum sample window: feeding more than 2 samples; only the last two define release velocity.
3. Pin-on-refocus: `beginRefocus(pt)`, swap port's `chartExtents` to simulate rebuild, `applyPendingPin()`, assert `chartToScreen({0,0})` now equals `pt`.
4. Levels-change preservation: starting from some pan/scale + extents, capture Focus's screen pos, simulate rebuild with new extents, apply pin, assert Focus's screen pos is unchanged within rounding.
5. Wheel zoom: synthetic wheel + `canvasRect`, assert pan/scale match the `zoomAt` contract; assert momentum is cancelled.
6. Dblclick fit: synthetic event + extents + canvasSize, assert pan/scale match the `fitTo` contract; assert short-circuits when composed path contains a `.node` element.
7. Initial pan: `ensureInitialPan()` with canvasSize available, assert Focus lands at the canvas center; idempotent when called again.
8. Interactions: refocus mid-drag, wheel mid-drag, refocus-then-rebuild-then-refocus — these are the current untested bug surface.

### Migration order within this slice

1. Add `viewport/controller.ts` + `viewport/controller.test.ts` (full class implemented against tests, not yet wired into the element).
2. Migrate `tree-view/index.ts` to instantiate the controller and delegate handlers. Replace state/handlers section by section, running the app between changes (drag → wheel → dblclick → initial pan → refocus pin).
3. Delete the now-dead element fields and methods: `pan`, `scale`, `panReady`, `dragging`, `dragOrigin`, `dragMoved`, `pendingPinScreen`, `wheelTarget`, `dragSamples`, `momentum`, plus their handlers (`onMouseMove`, `onMouseUp`, `maybeStartMomentum`, `cancelMomentum`, `onCanvasMouseDown`, `onCanvasDblClick`, `onWheel`, `attachWheelListener`, `viewBoxOrigin`, `measureInitialPan`, `pinFromNode`, `pinFromCanvasCenter`). Update imports to the single `./viewport` barrel.

## Acceptance criteria

- [ ] `tree-view/viewport/controller.ts` exists, exporting `ViewportController`, `ViewportMeasurements`, `ViewportOptions`, and `Size`.
- [ ] `tree-view/viewport/index.ts` re-exports the controller alongside the existing transform/momentum exports.
- [ ] `tree-view/viewport/controller.test.ts` covers the 8 scenarios listed under "Tests" and passes.
- [ ] `TreeViewElement` no longer owns `pan`, `scale`, `panReady`, `dragging`, `dragOrigin`, `dragMoved`, `pendingPinScreen`, `wheelTarget`, `dragSamples`, or `momentum`. All handlers listed under "Migration order" step 3 are removed.
- [ ] The controller is the only place that imports from `viewport/transform.ts` and `viewport/momentum.ts` — neither is referenced from `tree-view/index.ts`.
- [ ] `bun run` format / lint / typecheck all pass.
- [ ] Manual smoke check: drag, wheel-zoom, dblclick fit, focus by clicking a box, focus by search, focus via back/forward, levels-slider change all behave identically to before the migration.

## Blocked by

`.scratch/viewport-controller/issues/01-move-viewport-files-into-subdir.md`
