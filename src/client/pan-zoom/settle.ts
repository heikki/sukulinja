// A view pulled back within bounds: its scale and its content (bounds.ts)
// together, on the fling's spring (critically damped, from rest), so it
// sets off gently and comes in without overshooting. Where it comes to rest
// is found afresh each frame, in case something else moves it meanwhile.
// It turns about the one point the view and its rest share on screen, so
// content neither swings nor slides across.

import { overshoot, withinScale } from './bounds';
import type { Screen } from './bounds';
import { zoomAt } from './transform';
import type { Extents, Point, ScaleBounds, Transform } from './transform';

export interface SettleHandle {
  cancel: () => void;
}

export interface SettleHandlers {
  // The view now, and where it comes to rest from there; null where there
  // is nothing to settle.
  view: () => Transform | null;
  rest: (view: Transform) => Transform | null;
  setView: (view: Transform) => void;
  // Called once it has arrived; not on cancel.
  onEnd: () => void;
}

// Closer than this, a view has arrived.
const REST = 1e-3;

// What a view comes to rest within: its scale bounds, and the bounds of
// the content it shows (on screen at a transform) on a screen.
export interface ViewBounds {
  scale: ScaleBounds;
  content: (t: Transform) => Extents;
  screen: Screen;
}

// Where a view comes to rest: its scale back within bounds around `at`, then
// its content back within bounds.
export function settledView(t: Transform, at: Point, bounds: ViewBounds) {
  const { scale, content, screen } = bounds;
  const zoomed = zoomAt(t, at, withinScale(t.scale, scale) / t.scale, scale);
  const over = overshoot(content(zoomed), screen);
  return {
    scale: zoomed.scale,
    pan: { x: zoomed.pan.x - over.x, y: zoomed.pan.y - over.y }
  };
}

// The view `p` of the way from `from` to `to`, turning about their shared
// point; panning straight where the scale doesn't change.
function between(from: Transform, to: Transform, p: number): Transform {
  const k = to.scale / from.scale;
  if (Math.abs(k - 1) < 1e-9) {
    return {
      scale: to.scale,
      pan: {
        x: from.pan.x + (to.pan.x - from.pan.x) * p,
        y: from.pan.y + (to.pan.y - from.pan.y) * p
      }
    };
  }
  const fixed = {
    x: (to.pan.x - k * from.pan.x) / (1 - k),
    y: (to.pan.y - k * from.pan.y) / (1 - k)
  };
  const ratio = k ** p;
  return {
    scale: from.scale * ratio,
    pan: {
      x: fixed.x - ratio * (fixed.x - from.pan.x),
      y: fixed.y - ratio * (fixed.y - from.pan.y)
    }
  };
}

function arrived(from: Transform, to: Transform) {
  return (
    Math.abs(to.scale / from.scale - 1) < REST &&
    Math.hypot(to.pan.x - from.pan.x, to.pan.y - from.pan.y) < 0.5
  );
}

// Pulls the view to rest on a spring of time constant `ms`. Null where
// it's already there.
export function startSettle(
  ms: number,
  handlers: SettleHandlers
): SettleHandle | null {
  const { view, rest, setView, onEnd } = handlers;
  const from = view();
  const to = from === null ? null : rest(from);
  if (from === null || to === null || arrived(from, to)) return null;
  const origin: Transform = from;
  let raf: number | null = null;
  const start = performance.now();
  function step(t: number) {
    const now = view();
    const target = now === null ? null : rest(now);
    const wt = Math.max(0, t - start) / ms;
    // The share of the way still to go, critically damped from rest.
    const left = (1 + wt) * Math.exp(-wt);
    if (target === null || left < REST) {
      raf = null;
      if (target !== null) setView(target);
      onEnd();
      return;
    }
    setView(between(origin, target, 1 - left));
    raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);
  return {
    cancel: () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    }
  };
}
