// How a view is panned and zoomed, the chart's and the scan's alike:
// dragged, flung, and zoomed, stretching past its bounds (bounds.ts), and
// once let go springing back within them.

import {
  coastWithin,
  dragWithin,
  easeScale,
  overshoot,
  stretchPast,
  withinScale
} from './bounds';
import type { Screen } from './bounds';
import { startFling } from './fling';
import type { FlingHandle, FlingOptions } from './fling';
import { settledView, startSettle } from './settle';
import type { SettleHandle } from './settle';
import { zoomAround, zoomAt } from './transform';
import type { Extents, Point, ScaleBounds, Transform } from './transform';

export interface PanningHost {
  // Null until there is something to show.
  view: () => Transform | null;
  setView: (view: Transform) => void;
  // The content's extents on screen at `view`, and the screen with its
  // reach, both in the panned element's own pixels; null until known.
  content: (view: Transform) => Extents | null;
  screen: () => Screen | null;
  scaleBounds: () => ScaleBounds;
  // The view of all the content, zoomed out as far as it goes; null until
  // known.
  fit: () => Transform | null;
  // A gesture has come to rest: let go, or a zoom stopped, and whatever it
  // set going has arrived. Not on a cancel.
  onRest?: () => void;
}

export interface PanningOptions {
  fling: FlingOptions;
  dragThresholdPx: number;
  // A wheel zoom has stopped once no wheel event has come for this long.
  zoomSettleMs: number;
}

// A sample of how far a drag has moved the view: when, and where. The
// view's, not the pointer's, so a drag let go past the bounds bounces at
// the speed it was stretching.
interface Sample {
  t: number;
  at: Point;
}

// Moves apply as deltas to the current view, so a refit or a zoom during
// the drag isn't undone by it.
interface Drag {
  start: Point;
  last: Point;
  moved: boolean;
  // How far it has moved the view.
  travel: Point;
  // The last two samples, for the release velocity, without noise from
  // older ones across changes of direction.
  samples: Sample[];
}

// `view` zoomed to exactly `scale` about `at`.
function zoomedTo(view: Transform, at: Point, scale: number): Transform {
  return { ...zoomAround(view, at, scale / view.scale), scale };
}

function sameView(a: Transform, b: Transform) {
  return (
    a.scale === b.scale &&
    Math.abs(a.pan.x - b.pan.x) < 1e-6 &&
    Math.abs(a.pan.y - b.pan.y) < 1e-6
  );
}

// Closer than this to a bound is at it.
const REST_PX = 0.5;

// How far `view`'s scale is past `bounds`, in log-zoom.
function scaleOut(view: Transform, bounds: ScaleBounds) {
  return Math.abs(Math.log(view.scale / withinScale(view.scale, bounds)));
}

// How fast the view was moving when let go, from its last two samples, in
// pixels per millisecond; still where they can't say.
function releaseVelocity(samples: Sample[]) {
  const [prev, last] = samples;
  if (prev === undefined || last === undefined) return { x: 0, y: 0 };
  const dt = last.t - prev.t;
  if (dt <= 0) return { x: 0, y: 0 };
  return {
    x: (last.at.x - prev.at.x) / dt,
    y: (last.at.y - prev.at.y) / dt
  };
}

export class Panning {
  private drag: Drag | null = null;
  // A drag let go, coasting or bouncing back into bounds, or a zoom
  // settling back within them.
  private motion: FlingHandle | SettleHandle | null = null;
  // Where the last zoom was centred: a zoom stretched past its scale bounds
  // settles back around it.
  private zoomAnchor: Point | null = null;
  private zoomSettle: ReturnType<typeof setTimeout> | null = null;
  // The motion is a settle: a wheel turning or stopping leaves it be.
  private settling = false;
  // The furthest out the view could zoom when the screen last changed size.
  private lastMin: number | null = null;

  constructor(
    private readonly host: PanningHost,
    private readonly options: PanningOptions
  ) {}

  // A drag from `at`, in client coordinates.
  start(at: Point) {
    this.stop();
    const travel = { x: 0, y: 0 };
    this.drag = {
      start: at,
      last: at,
      moved: false,
      travel,
      samples: [{ t: performance.now(), at: travel }]
    };
  }

  // The pointer at `at`; whether a drag is under way.
  move(at: Point) {
    const drag = this.drag;
    if (drag === null) return false;
    const away = Math.hypot(at.x - drag.start.x, at.y - drag.start.y);
    if (!drag.moved && away < this.options.dragThresholdPx) return false;
    drag.moved = true;
    const delta = { x: at.x - drag.last.x, y: at.y - drag.last.y };
    drag.last = at;
    const view = this.host.view();
    const content = view === null ? null : this.host.content(view);
    const screen = this.host.screen();
    const move =
      content === null || screen === null
        ? delta
        : dragWithin(delta, content, screen);
    this.panBy(move);
    drag.travel = { x: drag.travel.x + move.x, y: drag.travel.y + move.y };
    drag.samples = [
      ...drag.samples.slice(-1),
      { t: performance.now(), at: drag.travel }
    ];
    return true;
  }

  // Let go: a drag that moved flings, or settles a zoom stretched past its
  // scale bounds.
  end() {
    const drag = this.drag;
    this.drag = null;
    if (drag?.moved !== true) return;
    const view = this.host.view();
    const bounds = this.host.scaleBounds();
    if (view !== null && view.scale !== withinScale(view.scale, bounds)) {
      this.settle();
      return;
    }
    this.motion = startFling(
      releaseVelocity(drag.samples),
      this.options.fling,
      {
        over: () => this.overshoot(),
        coast: (dx, dy) => {
          const view = this.host.view();
          const content = view === null ? null : this.host.content(view);
          const screen = this.host.screen();
          const moved =
            content === null || screen === null
              ? { x: dx, y: dy }
              : coastWithin({ x: dx, y: dy }, content, screen);
          this.panBy(moved);
          return moved;
        },
        onTick: (dx, dy) => {
          this.panBy({ x: dx, y: dy });
        },
        onEnd: () => {
          this.motion = null;
          this.host.onRest?.();
        }
      }
    );
    if (this.motion === null) this.host.onRest?.();
  }

  // Zooms by `factor` around `at`, on screen: past the scale bounds, or
  // carrying the content past its own, it stretches. Whether the view is
  // still within them.
  zoomBy(factor: number, at: Point) {
    this.stop();
    return this.zoomStep(factor, at);
  }

  // A wheel zoom by `factor` around `at`, and only that: carrying the content
  // past its bounds, nothing holds it back until the wheel stops, when it
  // settles back. Past its scale bounds, though, it never goes: it eases out
  // to them, so a trackpad's momentum, running on once let go, slows to rest
  // at a limit.
  wheel(factor: number, at: Point) {
    const view = this.host.view();
    if (view === null) return;
    const scale = easeScale(view.scale, factor, this.host.scaleBounds());
    // At a limit the scroll is spent: the rest of it, momentum running on,
    // has nothing to zoom, so it settles at once rather than waiting it out.
    if (scale === view.scale) {
      if (this.zoomSettle === null) return;
      this.stopZoomSettle();
      this.settle();
      return;
    }
    this.wheelTurned();
    this.stop();
    this.zoomAnchor = at;
    this.host.setView(zoomedTo(view, at, scale));
  }

  // Pulls the scale and the content back within their bounds, if out of
  // them, unless already on the way. A drag going on settles when it's let
  // go.
  settle() {
    if (this.drag === null && !this.settling) this.startSettle();
    if (this.motion === null) this.host.onRest?.();
  }

  // The screen has changed size: the view comes back within its bounds at
  // once, about the screen's centre, unless a drag or a motion has it. One
  // zoomed out as far as it went is fitted anew. Whether it moved.
  keepWithin() {
    const bounds = this.host.scaleBounds();
    const lastMin = this.lastMin;
    this.lastMin = bounds.minScale;
    const view = this.host.view();
    const screen = this.host.screen();
    if (this.drag !== null || this.motion !== null) return false;
    if (view === null || screen === null) return false;
    if (this.host.content(view) === null) return false;
    const centre = { x: screen.width / 2, y: screen.height / 2 };
    const fitted =
      lastMin !== null && Math.abs(view.scale / lastMin - 1) < 1e-6;
    const from = fitted ? (this.host.fit() ?? view) : view;
    const to = settledView(from, centre, {
      scale: bounds,
      content: (t) => this.host.content(t)!,
      screen
    });
    if (sameView(to, view)) return false;
    this.host.setView(to);
    return true;
  }

  // A zoom, a new gesture or a jump elsewhere takes over.
  stop() {
    this.motion?.cancel();
    this.motion = null;
    this.settling = false;
  }

  dispose() {
    this.stop();
    this.stopZoomSettle();
    this.drag = null;
  }

  private zoomStep(factor: number, at: Point) {
    const view = this.host.view();
    if (view === null) return true;
    const { scale } = zoomAt(view, at, factor, this.host.scaleBounds());
    this.zoomTo(view, scale, at);
    return this.within();
  }

  // Zooms `view` to `scale` around `at`, stretching where that carries the
  // content past its bounds.
  private zoomTo(view: Transform, scale: number, at: Point) {
    this.zoomAnchor = at;
    const before = this.overshoot();
    this.host.setView(zoomedTo(view, at, scale));
    const screen = this.host.screen();
    if (screen !== null) {
      this.panBy(stretchPast(before, this.overshoot(), screen));
    }
  }

  private startSettle() {
    this.stop();
    this.motion = startSettle(this.options.fling.springMs, {
      view: () => this.host.view(),
      rest: (view) => this.rest(view),
      setView: (view) => {
        this.host.setView(view);
      },
      onEnd: () => {
        this.motion = null;
        this.settling = false;
        // A wheel still turning rests once it stops.
        if (this.zoomSettle === null) this.host.onRest?.();
      }
    });
    this.settling = this.motion !== null;
  }

  // A wheel scroll settles once it has stopped.
  private wheelTurned() {
    this.stopZoomSettle();
    this.zoomSettle = setTimeout(() => {
      this.zoomSettle = null;
      this.settle();
    }, this.options.zoomSettleMs);
  }

  // Where `view` comes to rest: back within bounds, around the last zoom's
  // centre.
  private rest(view: Transform) {
    const screen = this.host.screen();
    if (screen === null || this.host.content(view) === null) return null;
    const at = this.zoomAnchor ?? {
      x: screen.width / 2,
      y: screen.height / 2
    };
    return settledView(view, at, {
      scale: this.host.scaleBounds(),
      content: (t) => this.host.content(t)!,
      screen
    });
  }

  // Whether the scale and the content are within their bounds.
  private within() {
    const view = this.host.view();
    if (view === null) return true;
    if (scaleOut(view, this.host.scaleBounds()) > 0) return false;
    const over = this.overshoot();
    return Math.abs(over.x) < REST_PX && Math.abs(over.y) < REST_PX;
  }

  private panBy(delta: Point) {
    if (delta.x === 0 && delta.y === 0) return;
    const view = this.host.view();
    if (view === null) return;
    const { pan } = view;
    this.host.setView({
      ...view,
      pan: { x: pan.x + delta.x, y: pan.y + delta.y }
    });
  }

  private overshoot() {
    const view = this.host.view();
    const content = view === null ? null : this.host.content(view);
    const screen = this.host.screen();
    return content === null || screen === null
      ? { x: 0, y: 0 }
      : overshoot(content, screen);
  }

  private stopZoomSettle() {
    if (this.zoomSettle === null) return;
    clearTimeout(this.zoomSettle);
    this.zoomSettle = null;
  }
}
