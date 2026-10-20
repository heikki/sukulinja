// How a view is panned and zoomed, the chart's and the scan's alike:
// dragged, stretching past its bounds (bounds.ts), and once let go flung or
// springing back within them; and zoomed about the pointer, which stays put
// however far that carries the content, within its scale bounds.

import {
  coastWithin,
  dragWithin,
  easeScale,
  overshoot,
  withinScale
} from './bounds';
import type { Screen } from './bounds';
import { startFling } from './fling';
import type { FlingHandle, FlingOptions } from './fling';
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
  // A wheel zoom has stopped, and is at rest, once no wheel event has come
  // for this long.
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
  // A drag let go, coasting.
  private fling: FlingHandle | null = null;
  private wheelRest: ReturnType<typeof setTimeout> | null = null;
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

  // Let go: a drag that moved flings, or springs back from past its bounds.
  end() {
    const drag = this.drag;
    this.drag = null;
    if (drag?.moved !== true) return;
    this.fling = startFling(releaseVelocity(drag.samples), this.options.fling, {
      over: () => {
        const view = this.host.view();
        const content = view === null ? null : this.host.content(view);
        const screen = this.host.screen();
        return content === null || screen === null
          ? { x: 0, y: 0 }
          : overshoot(content, screen);
      },
      onTick: (dx, dy) => {
        this.panBy({ x: dx, y: dy });
      },
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
      onEnd: () => {
        this.fling = null;
        this.host.onRest?.();
      }
    });
    if (this.fling === null) this.host.onRest?.();
  }

  // Zooms by `factor` around `at`, on screen, which stays put: the scale
  // stops at its bounds, the content goes wherever the zoom takes it.
  // Whether it zoomed at all: false at a limit.
  zoomBy(factor: number, at: Point) {
    this.stop();
    const view = this.host.view();
    if (view === null) return true;
    const { scale } = zoomAt(view, at, factor, this.host.scaleBounds());
    if (scale === view.scale) return false;
    this.host.setView(zoomedTo(view, at, scale));
    return true;
  }

  // A wheel zoom by `factor` around `at`. It eases out to the scale bounds
  // rather than stopping dead, so a trackpad's momentum, running on once let
  // go, slows to rest at a limit.
  wheel(factor: number, at: Point) {
    const view = this.host.view();
    if (view === null) return;
    const scale = easeScale(view.scale, factor, this.host.scaleBounds());
    // At a limit the scroll is spent: the rest of it, momentum running on,
    // has nothing to zoom, so it rests at once rather than waiting it out.
    if (scale === view.scale) {
      if (this.wheelRest === null) return;
      this.stopWheelRest();
      this.zoomEnded();
      return;
    }
    this.wheelTurned();
    this.stop();
    this.host.setView(zoomedTo(view, at, scale));
  }

  // A pinch or a one-off zoom has stopped: the view is at rest, unless a
  // drag or a fling has it.
  zoomEnded() {
    if (this.drag === null && this.fling === null) this.host.onRest?.();
  }

  // The screen has changed size: the view comes back within its bounds at
  // once, about the screen's centre, unless a drag or a fling has it. One
  // zoomed out as far as it went is fitted anew. Whether it moved.
  keepWithin() {
    const bounds = this.host.scaleBounds();
    const lastMin = this.lastMin;
    this.lastMin = bounds.minScale;
    const view = this.host.view();
    const screen = this.host.screen();
    if (this.drag !== null || this.fling !== null) return false;
    if (view === null || screen === null) return false;
    const fitted =
      lastMin !== null && Math.abs(view.scale / lastMin - 1) < 1e-6;
    const from = fitted ? (this.host.fit() ?? view) : view;
    const centre = { x: screen.width / 2, y: screen.height / 2 };
    const zoomed = zoomedTo(from, centre, withinScale(from.scale, bounds));
    const content = this.host.content(zoomed);
    if (content === null) return false;
    const over = overshoot(content, screen);
    const to = {
      scale: zoomed.scale,
      pan: { x: zoomed.pan.x - over.x, y: zoomed.pan.y - over.y }
    };
    if (sameView(to, view)) return false;
    this.host.setView(to);
    return true;
  }

  // A zoom, a new gesture or a jump elsewhere takes over.
  stop() {
    this.fling?.cancel();
    this.fling = null;
  }

  dispose() {
    this.stop();
    this.stopWheelRest();
    this.drag = null;
  }

  // A wheel scroll is at rest once it has stopped.
  private wheelTurned() {
    this.stopWheelRest();
    this.wheelRest = setTimeout(() => {
      this.wheelRest = null;
      this.zoomEnded();
    }, this.options.zoomSettleMs);
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

  private stopWheelRest() {
    if (this.wheelRest === null) return;
    clearTimeout(this.wheelRest);
    this.wheelRest = null;
  }
}
