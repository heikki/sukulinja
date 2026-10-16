// Measurements are read through the host-supplied port at call time, so
// chartExtents returns the OLD extents during willUpdate (before render
// writes the new value) and the NEW extents during updated() — which is
// exactly what the pin-on-re-root mechanism depends on.

import type { ReactiveController, ReactiveControllerHost } from 'lit';

import {
  chartToScreen,
  fitTo,
  Pinch,
  pinChartPointAtScreen,
  startMomentumPan,
  zoomAt
} from '@client/pan-zoom';
import type {
  Extents,
  FitOptions,
  MomentumHandle,
  MomentumOptions,
  Point,
  ScaleBounds
} from '@client/pan-zoom';

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
  momentumOptions: MomentumOptions;
  dragThresholdPx: number;
  svgMarginPx: number;
}

interface DragOrigin {
  mouse: Point;
  pan: Point;
}

interface DragSample {
  t: number;
  x: number;
  y: number;
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

  private dragOrigin: DragOrigin | null = null;
  private dragSamples: DragSample[] = [];
  private momentum: MomentumHandle | null = null;
  // A pinch settles, like a wheel burst, once it has eased to a stop.
  private readonly pinch = new Pinch({
    onZoom: (factor, at) => {
      this.zoomBy(factor, at);
    },
    onEnd: () => {
      this.measurements.onSettle?.();
    }
  });
  private canvas: HTMLElement | null = null;
  private wheelSettleTimer: ReturnType<typeof setTimeout> | null = null;
  // A column beside the canvas (the details dock) moves the canvas origin when it
  // slides or resizes. Each canvas resize shifts pan by how far the left edge
  // moved, holding the chart still on screen; the observer runs after layout
  // and before paint, so no frame shows the jump.
  private resizeObserver: ResizeObserver | null = null;
  private canvasLeft: number | null = null;
  private holdSettleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly measurements: ViewportMeasurements,
    private readonly options: ViewportOptions
  ) {
    host.addController(this);
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
    if (this.wheelSettleTimer !== null) {
      clearTimeout(this.wheelSettleTimer);
      this.wheelSettleTimer = null;
    }
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
      this.resizeObserver = new ResizeObserver(this.holdOnOriginMove);
      this.resizeObserver.observe(el);
    }
  }

  private readonly holdOnOriginMove = () => {
    const before = this.canvasLeft;
    const after = this.measurements.canvasRect()?.left ?? null;
    this.canvasLeft = after;
    if (before === null || after === null || after === before) return;
    if (!this._panReady) return;
    this._pan = { x: this._pan.x + before - after, y: this._pan.y };
    this.host.requestUpdate();
    if (this.holdSettleTimer !== null) clearTimeout(this.holdSettleTimer);
    this.holdSettleTimer = setTimeout(() => {
      this.holdSettleTimer = null;
      this.measurements.onHold?.();
    }, HOLD_SETTLE_MS);
  };

  readonly onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    this.cancelMomentum();
    this.dragOrigin = {
      mouse: { x: e.clientX, y: e.clientY },
      pan: { ...this._pan }
    };
    this._dragMoved = false;
    this.dragSamples = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
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
    if (this.dragOrigin === null) return;
    const dx = e.clientX - this.dragOrigin.mouse.x;
    const dy = e.clientY - this.dragOrigin.mouse.y;
    if (
      !this._dragMoved &&
      Math.hypot(dx, dy) >= this.options.dragThresholdPx
    ) {
      this._dragMoved = true;
      this._dragging = true;
      this.host.requestUpdate();
    }
    if (!this._dragMoved) return;
    const nextX = this.dragOrigin.pan.x + dx;
    const nextY = this.dragOrigin.pan.y + dy;
    // Two most-recent pointer samples are enough to compute the release
    // velocity for momentum pan without smoothing noise from older samples
    // that span across direction changes.
    this.dragSamples.push({
      t: performance.now(),
      x: e.clientX,
      y: e.clientY
    });
    if (this.dragSamples.length > 2) this.dragSamples.shift();
    if (nextX === this._pan.x && nextY === this._pan.y) return;
    this._pan = { x: nextX, y: nextY };
    this.host.requestUpdate();
  };

  readonly onMouseUp = () => {
    this.dragOrigin = null;
    if (!this._dragging) {
      this.dragSamples = [];
      return;
    }
    this.maybeStartMomentum();
    this.dragSamples = [];
    // When no momentum kicked in (short drag or low release velocity), the
    // gesture has settled at mouseup. Momentum's own onEnd handles the
    // animated case.
    if (this.momentum === null) this.measurements.onSettle?.();
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
    this.cancelMomentum();
    const factor = Math.exp(-e.deltaY * this.options.wheelZoomK);
    this.zoomBy(factor, { x: e.clientX, y: e.clientY });
    if (this.wheelSettleTimer !== null) clearTimeout(this.wheelSettleTimer);
    this.wheelSettleTimer = setTimeout(() => {
      this.wheelSettleTimer = null;
      this.measurements.onSettle?.();
    }, WHEEL_SETTLE_MS);
  };

  private maybeStartMomentum() {
    if (this.dragSamples.length < 2) return;
    const [prev, last] = this.dragSamples as [DragSample, DragSample];
    const dt = last.t - prev.t;
    if (dt <= 0) return;
    this.momentum = startMomentumPan(
      (last.x - prev.x) / dt,
      (last.y - prev.y) / dt,
      this.options.momentumOptions,
      {
        onTick: (dx, dy) => {
          this._pan = { x: this._pan.x + dx, y: this._pan.y + dy };
          this.host.requestUpdate();
        },
        onEnd: () => {
          this.momentum = null;
          this.measurements.onSettle?.();
        }
      }
    );
  }

  // Zoom at a point in client coordinates. Stops a pan's glide, not a
  // pinch's.
  private zoomBy(factor: number, at: Point) {
    const rect = this.measurements.canvasRect();
    if (rect === null) return;
    this.cancelPan();
    const next = zoomAt(
      { pan: this._pan, scale: this._scale },
      { x: at.x - rect.left, y: at.y - rect.top },
      factor,
      this.options.scaleBounds
    );
    this._pan = next.pan;
    this._scale = next.scale;
    this.host.requestUpdate();
  }

  private cancelPan() {
    this.momentum?.cancel();
    this.momentum = null;
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
