// Measurements are read through the host-supplied port at call time, so
// chartExtents returns the OLD extents during willUpdate (before render
// writes the new value) and the NEW extents during updated() — which is
// exactly what the pin-on-re-root mechanism depends on.

import {
  chartToScreen,
  fitTo,
  Panning,
  Pinch,
  pinChartPointAtScreen,
  reducedMotion,
  startGlide
} from '@client/pan-zoom';
import type {
  Extents,
  FitOptions,
  FlingOptions,
  GlideHandle,
  Point,
  ScaleBounds,
  Transform
} from '@client/pan-zoom';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

import { shiftIntoView } from './in-view';
import { nudgeIntoView } from './nudge';

const WHEEL_SETTLE_MS = 200;
// A held pan reaches the URL once the canvas has stopped moving, not every frame
// of a slide: WebKit throttles replaceState.
const HOLD_SETTLE_MS = 250;

export interface Size {
  width: number;
  height: number;
}

// What a re-root Nudge keeps on screen, in chart coords: the Comfort region, and
// the cores that must stay visible even when the region is too large to fit,
// most preferred first.
export interface Comfort {
  region: Extents;
  cores: Extents[];
}

export interface ViewportMeasurements {
  chartExtents: () => Extents | null;
  canvasSize: () => Size | null;
  canvasRect: () => DOMRect | null;
  // The Comfort region of the current chart, in chart coords; a re-root Nudge
  // keeps it on screen. Absent or null means no Nudge.
  comfort?: () => Comfort | null;
  // Fires once when an interactive gesture has settled (dblclick fit lands,
  // wheel-zoom burst finishes). Used by the host to commit view state to the
  // URL; the viewport itself stays ignorant of URLs.
  onSettle?: () => void;
  // Fires once the canvas origin has stopped moving after a hold shifted pan.
  onHold?: () => void;
}

export interface ViewportOptions {
  scaleBounds: ScaleBounds;
  wheelZoomK: number;
  fitOptions: FitOptions;
  momentumOptions: FlingOptions;
  dragThresholdPx: number;
  svgMarginPx: number;
}

export class ViewportController implements ReactiveController {
  private _pan: Point = { x: 0, y: 0 };
  private _scale = 1;
  private _panReady = false;
  private _dragging = false;
  // dragMoved persists past mouseup; reset only on the next mousedown so
  // the box click handler can suppress a root change that follows a drag.
  private _dragMoved = false;
  private _pendingPinScreen: Point | null = null;
  // Silent pins skip the onSettle notification — used by gen-change reflow,
  // which pins chart (0,0) on screen and whose caller writes the URL itself
  // once the change has landed.
  private _pendingPinSilent = false;
  // Set by a re-root: after the pin lands, nudge the pan so the Comfort
  // region is on screen. Gen-change pins leave it off.
  private _pendingNudge = false;
  // How far the last pin's Nudge moved the pan, on screen. The Transition ranks
  // travel without it (takeNudgeShift); cleared once read.
  private _nudgeShift: Point = { x: 0, y: 0 };
  // A back/forward viewport restore, held until updated() instead of mutating
  // synchronously. The Transition captures its FLIP "First" through the live
  // pan/scale in the host's willUpdate; changing them on hashchange would snapshot
  // the new viewport and flatten the slide. Deferring mirrors the pin's lifecycle
  // so a back/forward root change animates like a click.
  private _pendingPan: Point | null = null;
  private _pendingScale: number | null = null;

  // Drags and flings, kept within bounds, and zooms.
  private readonly panning: Panning;
  // A pinch is at rest, like a wheel burst, once it has eased to a stop.
  private readonly pinch = new Pinch({
    onZoom: (factor, at) => this.zoomBy(factor, at),
    onEnd: () => {
      this.panning.zoomEnded();
    }
  });
  private canvas: HTMLElement | null = null;
  // A column beside the canvas (the details dock) moves the canvas origin when it
  // slides or resizes. Each canvas resize shifts pan by how far the left edge
  // moved, holding the chart still on screen, then brings the view back
  // within its bounds for the new size; the observer runs after layout and
  // before paint, so no frame shows the jump.
  private resizeObserver: ResizeObserver | null = null;
  private canvasLeft: number | null = null;
  private holdSettleTimer: ReturnType<typeof setTimeout> | null = null;
  // A pan bringing a selected card into view.
  private glide: GlideHandle | null = null;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly measurements: ViewportMeasurements,
    private readonly options: ViewportOptions
  ) {
    host.addController(this);
    this.panning = new Panning(
      {
        view: () => ({ pan: this._pan, scale: this._scale }),
        setView: (t) => {
          this._pan = t.pan;
          this._scale = t.scale;
          this.host.requestUpdate();
        },
        content: (t) => this.contentAt(t),
        screen: () => this.screen(),
        scaleBounds: () => this.scaleBounds(),
        fit: () => this.fitView(),
        onRest: () => {
          this.measurements.onSettle?.();
        }
      },
      {
        fling: options.momentumOptions,
        dragThresholdPx: options.dragThresholdPx,
        zoomSettleMs: WHEEL_SETTLE_MS
      }
    );
  }

  get pan(): Point {
    return this._pan;
  }
  get scale() {
    return this._scale;
  }
  get panReady() {
    return this._panReady;
  }
  get dragging() {
    return this._dragging;
  }
  get dragMoved() {
    return this._dragMoved;
  }
  get hasPendingPin() {
    return this._pendingPinScreen !== null;
  }
  // Any deferred viewport mutation — pin or URL restore — that updated() must land
  // before the Move plays, and that suppresses the gen-reflow pin.
  get hasPendingViewport() {
    return (
      this._pendingPinScreen !== null ||
      this._pendingPan !== null ||
      this._pendingScale !== null
    );
  }

  hostConnected() {
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  hostDisconnected() {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.attachCanvas(null);
    this.cancelMomentum();
    this.panning.dispose();
    if (this.holdSettleTimer !== null) {
      clearTimeout(this.holdSettleTimer);
      this.holdSettleTimer = null;
    }
  }

  // Lets the host restore scale from URL before ensureInitialPan computes the
  // first pin, so chart (0,0) lands centered at the URL-supplied zoom.
  setScale(s: number) {
    this._scale = s;
    this.host.requestUpdate();
  }

  // Lets the host restore pan from URL; marks panReady so ensureInitialPan
  // doesn't clobber the restored value with a fresh canvas-center pin.
  setPan(p: Point) {
    this._pan = { ...p };
    this._panReady = true;
    this.host.requestUpdate();
  }

  // Back/forward restore: stash the URL's pan/zoom to land in applyPendingViewport
  // after the FLIP capture, rather than setPan/setScale's synchronous mutation.
  restoreViewportDeferred(pan: Point | null, scale: number | null) {
    if (pan === null && scale === null) return;
    if (pan !== null) {
      this._pendingPan = { ...pan };
      this._panReady = true;
    }
    if (scale !== null) this._pendingScale = scale;
    this.host.requestUpdate();
  }

  attachCanvas(el: HTMLElement | null) {
    if (this.canvas === el) return;
    if (this.canvas !== null) {
      this.canvas.removeEventListener('wheel', this.onWheel);
      this.canvas.removeEventListener(
        'gesturestart',
        this.pinch.onGestureStart
      );
      this.canvas.removeEventListener(
        'gesturechange',
        this.pinch.onGestureChange
      );
      this.canvas.removeEventListener('gestureend', this.pinch.onGestureEnd);
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.canvas = el;
    if (el !== null) {
      el.addEventListener('wheel', this.onWheel, { passive: false });
      el.addEventListener('gesturestart', this.pinch.onGestureStart);
      el.addEventListener('gesturechange', this.pinch.onGestureChange);
      el.addEventListener('gestureend', this.pinch.onGestureEnd);
      this.canvasLeft = this.measurements.canvasRect()?.left ?? null;
      this.resizeObserver = new ResizeObserver(this.onCanvasResize);
      this.resizeObserver.observe(el);
    }
  }

  private readonly onCanvasResize = () => {
    const held = this.holdOnOriginMove();
    // A card gliding into view as the dock opens has the view meanwhile.
    const kept =
      this._panReady && this.glide === null && this.panning.keepWithin();
    if (!held && !kept) return;
    this.host.requestUpdate();
    if (this.holdSettleTimer !== null) clearTimeout(this.holdSettleTimer);
    this.holdSettleTimer = setTimeout(() => {
      this.holdSettleTimer = null;
      this.measurements.onHold?.();
    }, HOLD_SETTLE_MS);
  };

  // Shifts pan by how far the canvas's left edge moved; whether it did.
  private holdOnOriginMove() {
    const before = this.canvasLeft;
    const after = this.measurements.canvasRect()?.left ?? null;
    this.canvasLeft = after;
    if (before === null || after === null || after === before) return false;
    if (!this._panReady) return false;
    this._pan = { x: this._pan.x + before - after, y: this._pan.y };
    return true;
  }

  // Glides the pan over `ms` just far enough to show a card whole: of the
  // cards at `centers` (`half` their size, in chart units) the one needing
  // the least, inside the fit margin and clear of the `cover` px a column
  // opening beside the canvas is about to take from its left.
  showCard(centers: Point[], half: Point, cover: number, ms: number) {
    const size = this.measurements.canvasSize();
    if (size === null) return;
    const m = this.options.fitOptions.marginPx;
    const view = {
      min: { x: cover + m, y: m },
      max: { x: size.width - m, y: size.height - m }
    };
    const scaled = { x: half.x * this._scale, y: half.y * this._scale };
    let best: Point | null = null;
    for (const center of centers) {
      const at = this.chartToScreen(center);
      if (at === null) continue;
      const rect = {
        min: { x: at.x - scaled.x, y: at.y - scaled.y },
        max: { x: at.x + scaled.x, y: at.y + scaled.y }
      };
      const shift = shiftIntoView(rect, view);
      if (
        best === null ||
        Math.hypot(shift.x, shift.y) < Math.hypot(best.x, best.y)
      ) {
        best = shift;
      }
    }
    if (best === null || (best.x === 0 && best.y === 0)) return;
    this.glideBy(best, ms);
  }

  private glideBy(shift: Point, ms: number) {
    this.cancelMomentum();
    if (ms <= 0 || reducedMotion()) {
      this._pan = { x: this._pan.x + shift.x, y: this._pan.y + shift.y };
      this.host.requestUpdate();
      this.measurements.onSettle?.();
      return;
    }
    this.glide = startGlide(shift.x, shift.y, ms, {
      onTick: (dx, dy) => {
        this._pan = { x: this._pan.x + dx, y: this._pan.y + dy };
        this.host.requestUpdate();
      },
      onEnd: () => {
        this.glide = null;
        this.measurements.onSettle?.();
      }
    });
  }

  // A Ctrl-click is the Mac's right-click: it opens a card's menu, not a pan.
  readonly onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey) return;
    this.cancelMomentum();
    this.panning.start({ x: e.clientX, y: e.clientY });
    this._dragMoved = false;
  };

  readonly onDblClick = (e: MouseEvent) => {
    // Skip dblclick fit when the user clicked a person box — that interaction
    // already selects them and shouldn't also reset the viewport.
    const path = e.composedPath();
    if (
      path.some((n) => n instanceof Element && n.classList.contains('node'))
    ) {
      return;
    }
    const extents = this.measurements.chartExtents();
    const size = this.measurements.canvasSize();
    const vbo = this.viewBoxOrigin();
    if (extents === null || size === null || vbo === null) return;
    this.cancelMomentum();
    const next = fitTo(extents, vbo, size, this.options.fitOptions);
    this._pan = next.pan;
    this._scale = next.scale;
    this.host.requestUpdate();
    this.measurements.onSettle?.();
  };

  ensureInitialPan() {
    if (this._panReady) return;
    const size = this.measurements.canvasSize();
    if (size === null || size.width === 0) return;
    const vbo = this.viewBoxOrigin();
    if (vbo === null) return;
    this._pan = pinChartPointAtScreen(
      this._scale,
      { x: 0, y: 0 },
      { x: size.width / 2, y: size.height / 2 },
      vbo
    );
    this.applyNudge(vbo);
    this._panReady = true;
    this.host.requestUpdate();
  }

  // null leaves any prior pending pin in place (the caller couldn't compute
  // a fresh one); only a non-null Point overwrites it. `silent` suppresses
  // onSettle when the pin lands — used for reflow pins (gen change), whose
  // caller writes the URL itself.
  beginReroot(
    pinScreen: Point | null,
    opts?: { silent?: boolean; nudge?: boolean }
  ) {
    this.cancelMomentum();
    if (pinScreen !== null) this._pendingPinScreen = pinScreen;
    if (opts?.silent === true) this._pendingPinSilent = true;
    if (opts?.nudge === true) this._pendingNudge = true;
  }

  // Land every deferred viewport mutation for this relayout: the URL restore
  // first, then the pin (which recomputes pan from a screen point, so it must win
  // if both are somehow pending). The host gates the Move on hasPendingViewport so
  // it plays only once these have settled.
  applyPendingViewport() {
    this.applyPendingRestore();
    this.applyPendingPin();
  }

  private applyPendingRestore() {
    if (this._pendingPan === null && this._pendingScale === null) return;
    if (this._pendingScale !== null) {
      this._scale = this._pendingScale;
      this._pendingScale = null;
    }
    if (this._pendingPan !== null) {
      this._pan = { ...this._pendingPan };
      this._pendingPan = null;
    }
    this._panReady = true;
    this.host.requestUpdate();
  }

  applyPendingPin() {
    if (this._pendingPinScreen === null) return;
    const vbo = this.viewBoxOrigin();
    if (vbo === null) return;
    this._pan = pinChartPointAtScreen(
      this._scale,
      { x: 0, y: 0 },
      this._pendingPinScreen,
      vbo
    );
    this._pendingPinScreen = null;
    const pinned = this._pan;
    if (this._pendingNudge) this.applyNudge(vbo);
    this._nudgeShift = { x: this._pan.x - pinned.x, y: this._pan.y - pinned.y };
    this._pendingNudge = false;
    const silent = this._pendingPinSilent;
    this._pendingPinSilent = false;
    this.host.requestUpdate();
    if (!silent) this.measurements.onSettle?.();
  }

  private applyNudge(vbo: Point) {
    const comfort = this.measurements.comfort?.() ?? null;
    const chart = this.measurements.chartExtents();
    const size = this.measurements.canvasSize();
    if (comfort === null || chart === null || size === null) return;
    this._pan = nudgeIntoView(
      { pan: this._pan, scale: this._scale },
      {
        region: comfort.region,
        chart,
        cores: comfort.cores,
        root: { x: 0, y: 0 },
        viewBoxOrigin: vbo,
        canvas: size,
        marginPx: this.options.fitOptions.marginPx
      }
    );
  }

  // The screen shift the last pin's Nudge applied to every card, then forgotten:
  // zero unless a Nudge just ran.
  takeNudgeShift(): Point {
    const shift = this._nudgeShift;
    this._nudgeShift = { x: 0, y: 0 };
    return shift;
  }

  chartToScreen(p: Point): Point | null {
    const vbo = this.viewBoxOrigin();
    if (vbo === null) return null;
    return chartToScreen({ pan: this._pan, scale: this._scale }, p, vbo);
  }

  readonly onMouseMove = (e: MouseEvent) => {
    if (!this.panning.move({ x: e.clientX, y: e.clientY })) return;
    if (this._dragMoved) return;
    this._dragMoved = true;
    this._dragging = true;
    this.host.requestUpdate();
  };

  // A drag let go flings or springs back within bounds, and is at rest at
  // once when neither moves.
  readonly onMouseUp = () => {
    this.panning.end();
    if (!this._dragging) return;
    // Defer clearing `dragging` so the canvas's CSS class survives long
    // enough for the click event on a box to know a drag just ended.
    setTimeout(() => {
      this._dragging = false;
      this.host.requestUpdate();
    }, 0);
  };

  // Attached via attachCanvas with passive:false so preventDefault can
  // suppress page scroll.
  readonly onWheel = (e: WheelEvent) => {
    if (this.canvas === null) return;
    e.preventDefault();
    if (this.pinch.wheel(e)) return;
    this.pinch.cancel();
    this.glide?.cancel();
    this.glide = null;
    const at = this.toCanvas({ x: e.clientX, y: e.clientY });
    if (at === null) return;
    this.panning.wheel(Math.exp(-e.deltaY * this.options.wheelZoomK), at);
  };

  // The scale bounds, out no further than a fit of the whole chart: smaller
  // shows nothing more. The options' minScale holds until the chart is known.
  private scaleBounds(): ScaleBounds {
    const { scaleBounds } = this.options;
    const fit = this.fitView();
    return fit === null ? scaleBounds : { ...scaleBounds, minScale: fit.scale };
  }

  // The canvas, which any card zoomed in on can be brought to the middle of:
  // the chart's edges may come in as far as half of it.
  private screen() {
    const size = this.measurements.canvasSize();
    if (size === null) return null;
    const half = { x: size.width / 2, y: size.height / 2 };
    return { ...size, reach: { min: half, max: half } };
  }

  // The view of the whole chart, centred.
  private fitView() {
    const extents = this.measurements.chartExtents();
    const size = this.measurements.canvasSize();
    const vbo = this.viewBoxOrigin();
    if (extents === null || size === null || vbo === null) return null;
    return fitTo(extents, vbo, size, this.options.fitOptions);
  }

  // The chart's extents on screen at `t`, relative to the canvas, with the
  // fit's margin around them: a fitted chart just meets its bounds, and
  // cards keep clear of the canvas's edges.
  private contentAt(t: Transform): Extents | null {
    const extents = this.measurements.chartExtents();
    const vbo = this.viewBoxOrigin();
    if (extents === null || vbo === null) return null;
    const min = chartToScreen(t, extents.min, vbo);
    const max = chartToScreen(t, extents.max, vbo);
    const m = this.options.fitOptions.marginPx;
    return {
      min: { x: min.x - m, y: min.y - m },
      max: { x: max.x + m, y: max.y + m }
    };
  }

  // Zoom at a point in client coordinates; false at a zoom limit. Stops a
  // pan's glide, not a pinch's.
  private zoomBy(factor: number, at: Point) {
    const on = this.toCanvas(at);
    if (on === null) return true;
    this.cancelPan();
    return this.panning.zoomBy(factor, on);
  }

  private toCanvas(client: Point): Point | null {
    const rect = this.measurements.canvasRect();
    if (rect === null) return null;
    return { x: client.x - rect.left, y: client.y - rect.top };
  }

  private cancelPan() {
    this.panning.stop();
    this.glide?.cancel();
    this.glide = null;
  }

  // Both glides: a new gesture or a re-root takes over from either.
  private cancelMomentum() {
    this.cancelPan();
    this.pinch.cancel();
  }

  private viewBoxOrigin(): Point | null {
    const extents = this.measurements.chartExtents();
    if (extents === null) return null;
    return {
      x: extents.min.x - this.options.svgMarginPx,
      y: extents.min.y - this.options.svgMarginPx
    };
  }
}
