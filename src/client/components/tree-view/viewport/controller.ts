// ReactiveController owning everything viewport-related for the tree-view
// canvas: pan/scale state, drag + momentum, wheel zoom, dblclick fit,
// initial pan, and the pin-on-refocus choreography that survives a Lit
// rebuild. The host element wires DOM events (mousedown, dblclick) into
// the public handlers and reads the observable state for render; window
// listeners (mousemove, mouseup) and the passive:false wheel listener on
// the canvas are owned here.
//
// Measurements (chartExtents, canvas size, canvas rect) come from a port
// the host supplies at construction time — the controller calls back into
// the host to read them at the moment they're needed, which makes the
// "old extents during willUpdate / new extents during updated" timing
// fall out naturally from when the host writes its chartExtents field.

import type { ReactiveController, ReactiveControllerHost } from 'lit';

import type { Extents, Point } from '../emit';
import { startMomentumPan } from './momentum';
import type { MomentumHandle, MomentumOptions } from './momentum';
import {
  chartToScreen,
  fitTo,
  pinChartPointAtScreen,
  zoomAt
} from './transform';
import type { FitOptions, ScaleBounds } from './transform';

export interface Size {
  width: number;
  height: number;
}

export interface ViewportMeasurements {
  chartExtents: () => Extents | null;
  canvasSize: () => Size | null;
  canvasRect: () => DOMRect | null;
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
  // the box click handler can suppress a focus change that follows a drag.
  private _dragMoved = false;
  private _pendingPinScreen: Point | null = null;

  private dragOrigin: DragOrigin | null = null;
  private dragSamples: DragSample[] = [];
  private momentum: MomentumHandle | null = null;
  private canvas: HTMLElement | null = null;

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

  hostConnected() {
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  hostDisconnected() {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.attachCanvas(null);
    this.cancelMomentum();
  }

  attachCanvas(el: HTMLElement | null) {
    if (this.canvas === el) return;
    if (this.canvas !== null) {
      this.canvas.removeEventListener('wheel', this.onWheel);
    }
    this.canvas = el;
    if (el !== null) {
      el.addEventListener('wheel', this.onWheel, { passive: false });
    }
  }

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
    // already focuses them and shouldn't also reset the viewport.
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
    this._panReady = true;
    this.host.requestUpdate();
  }

  // Cancels any running momentum. If pinScreen is non-null, captures it as
  // the screen point that chart (0,0) should land on after the next rebuild;
  // null leaves any prior pending pin in place (caller couldn't compute one).
  beginRefocus(pinScreen: Point | null) {
    this.cancelMomentum();
    if (pinScreen !== null) this._pendingPinScreen = pinScreen;
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
    this.host.requestUpdate();
  }

  chartToScreen(p: Point): Point | null {
    const vbo = this.viewBoxOrigin();
    if (vbo === null) return null;
    return chartToScreen({ pan: this._pan, scale: this._scale }, p, vbo);
  }

  // Public for tests and for the window-listener binding in hostConnected;
  // the element doesn't need to wire this — the controller does it itself.
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
    // Defer clearing `dragging` so the canvas's CSS class survives long
    // enough for the click event on a box to know a drag just ended.
    setTimeout(() => {
      this._dragging = false;
      this.host.requestUpdate();
    }, 0);
  };

  // Public for tests; wired by attachCanvas with passive:false so it can
  // preventDefault page scroll. The element doesn't bind it directly.
  readonly onWheel = (e: WheelEvent) => {
    if (this.canvas === null) return;
    e.preventDefault();
    this.cancelMomentum();
    const rect = this.measurements.canvasRect();
    if (rect === null) return;
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const factor = Math.exp(-e.deltaY * this.options.wheelZoomK);
    const next = zoomAt(
      { pan: this._pan, scale: this._scale },
      cursor,
      factor,
      this.options.scaleBounds
    );
    this._pan = next.pan;
    this._scale = next.scale;
    this.host.requestUpdate();
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
      (dx, dy) => {
        this._pan = { x: this._pan.x + dx, y: this._pan.y + dy };
        this.host.requestUpdate();
      }
    );
  }

  private cancelMomentum() {
    this.momentum?.cancel();
    this.momentum = null;
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
