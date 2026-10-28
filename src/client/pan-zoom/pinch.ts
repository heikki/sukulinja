// Trackpad pinch, as either engine reports it, turned into zoom at the
// pointer that eases out on release. WebKit (Safari, the app's WKWebView)
// fires gesture events whose `scale` runs from 1, then an end: the release
// starts a glide, as momentum pan eases a flick. Chromium fires ctrl+wheel
// with small deltas and no end: the zoom follows the deltas a little behind,
// so when they stop it eases into place with no release to wait for.

import { startMomentumPan } from './momentum';
import type { MomentumHandle, MomentumOptions } from './momentum';
import type { Point } from './transform';

export interface PinchOptions {
  // Log-zoom per unit of a ctrl+wheel's deltaY.
  wheelK: number;
  // The largest ctrl+wheel step, so a mouse's ctrl+wheel (deltas near 100)
  // doesn't leap.
  maxWheelDelta: number;
  // How far a ctrl+wheel pinch's zoom trails its deltas: each frame closes
  // the gap by 1 - e^(-frame / wheelEaseMs).
  wheelEaseMs: number;
  // The glide, its velocity in log-zoom per ms.
  momentum: MomentumOptions;
  // About the most a glide adds, as a zoom factor: a glide adds about
  // release speed × tauMs, and a quick pinch would otherwise fly to the
  // zoom limit.
  maxGlide: number;
}

// The feel the chart and the Scan viewer share.
const PINCH_OPTIONS: PinchOptions = {
  wheelK: 0.01,
  maxWheelDelta: 25,
  wheelEaseMs: 90,
  momentum: { tauMs: 100, minV: 0.0001, minReleaseV: 0.0008 },
  maxGlide: 1.4
};

interface PinchHandlers {
  // Zoom by `factor` around `at`, in client coordinates; false where the
  // view is at its zoom limit, which ends a glide or an easing there so the
  // view is at rest at once.
  onZoom: (factor: number, at: Point) => boolean;
  // The pinch and its easing are over. Not called on cancel.
  onEnd?: () => void;
}

interface GestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

// A ctrl+wheel pinch's remaining zoom below this lands at once.
const EASE_DONE = 1e-4;

interface Sample {
  t: number;
  log: number;
}

export class Pinch {
  // The gesture's scale as last applied, so each change zooms by the step.
  private gestureScale = 1;
  // Log-zoom so far this pinch; the last two samples give the release speed.
  private log = 0;
  private samples: Sample[] = [];
  private at: Point = { x: 0, y: 0 };
  private glide: MomentumHandle | null = null;
  // A ctrl+wheel pinch's log-zoom not yet applied, and its easing frame.
  private aim = 0;
  private easing: number | null = null;
  private lastFrame = 0;

  constructor(
    private readonly handlers: PinchHandlers,
    private readonly options: PinchOptions = PINCH_OPTIONS
  ) {}

  // preventDefault keeps WebKit from zooming the page instead.
  readonly onGestureStart = (e: Event) => {
    e.preventDefault();
    this.begin();
    this.gestureScale = 1;
  };

  readonly onGestureChange = (e: Event) => {
    e.preventDefault();
    const pinch = e as GestureEvent;
    if (pinch.scale <= 0) return;
    this.step(Math.log(pinch.scale / this.gestureScale), pinch);
    this.gestureScale = pinch.scale;
  };

  readonly onGestureEnd = (e: Event) => {
    e.preventDefault();
    this.release();
  };

  // Takes a ctrl+wheel as a pinch step; false for a plain wheel.
  wheel(e: WheelEvent) {
    if (!e.ctrlKey) return false;
    this.glide?.cancel();
    this.glide = null;
    const max = this.options.maxWheelDelta;
    this.aim -= Math.min(max, Math.max(-max, e.deltaY)) * this.options.wheelK;
    this.at = { x: e.clientX, y: e.clientY };
    if (this.easing === null) {
      this.lastFrame = performance.now();
      this.easing = requestAnimationFrame(this.ease);
    }
    return true;
  }

  // Stops a pinch, its glide or its easing, for a gesture that takes over.
  cancel() {
    this.glide?.cancel();
    this.glide = null;
    if (this.easing !== null) cancelAnimationFrame(this.easing);
    this.easing = null;
    this.aim = 0;
  }

  // One frame of a ctrl+wheel pinch closing on its aim.
  private readonly ease = (now: number) => {
    const dt = Math.max(0, now - this.lastFrame);
    this.lastFrame = now;
    const close = 1 - Math.exp(-dt / this.options.wheelEaseMs);
    const step = Math.abs(this.aim) < EASE_DONE ? this.aim : this.aim * close;
    this.aim -= step;
    const zoomed = step === 0 || this.handlers.onZoom(Math.exp(step), this.at);
    if (this.aim === 0 || !zoomed) {
      this.easing = null;
      this.aim = 0;
      this.handlers.onEnd?.();
      return;
    }
    this.easing = requestAnimationFrame(this.ease);
  };

  private begin() {
    this.cancel();
    this.log = 0;
    this.samples = [];
  }

  private step(dlog: number, at: { clientX: number; clientY: number }) {
    this.at = { x: at.clientX, y: at.clientY };
    this.log += dlog;
    this.samples = [
      ...this.samples.slice(-1),
      { t: performance.now(), log: this.log }
    ];
    this.handlers.onZoom(Math.exp(dlog), this.at);
  }

  // One axis of momentum pan carries the log-zoom.
  private release() {
    const [prev, last] = this.samples;
    const dt = prev === undefined || last === undefined ? 0 : last.t - prev.t;
    const speed = dt > 0 ? (last!.log - prev!.log) / dt : 0;
    const { momentum, maxGlide } = this.options;
    const max = Math.log(maxGlide) / momentum.tauMs;
    const v = Math.min(max, Math.max(-max, speed));
    this.glide = startMomentumPan(v, 0, momentum, {
      onTick: (dlog) => {
        if (this.handlers.onZoom(Math.exp(dlog), this.at)) return;
        this.glide?.cancel();
        this.glide = null;
        this.handlers.onEnd?.();
      },
      onEnd: () => {
        this.glide = null;
        this.handlers.onEnd?.();
      }
    });
    if (this.glide === null) this.handlers.onEnd?.();
  }
}
