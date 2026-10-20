// Where a view may go. Content small enough to fit on screen stays wholly
// on it; content larger covers it, though each edge may come inside it as
// far as the screen's reach, or as far as the content overflows it, if less,
// so the bounds loosen as it zooms in from a fit. Its scale stays within its
// bounds. A drag past the content's bounds stretches like a rubber band and,
// once let go, springs back (fling.ts); a fling eases out to them instead. A
// zoom goes wherever it takes the content, but stops dead at the scale
// bounds, or a wheel eases out to them.

import type { Extents, Point, ScaleBounds, Viewport } from './transform';

// How far inside the screen content's edges may come, those at its least
// (left, top) and its most (right, bottom).
export interface Reach {
  min: Point;
  max: Point;
}

// A screen content is kept within; with no reach, larger content fills it.
export interface Screen extends Viewport {
  reach?: Reach;
}

// One axis of a screen.
interface Axis {
  size: number;
  reach: { min: number; max: number };
}

function axes(screen: Screen) {
  const { width, height, reach } = screen;
  return {
    x: {
      size: width,
      reach: { min: reach?.min.x ?? 0, max: reach?.max.x ?? 0 }
    },
    y: {
      size: height,
      reach: { min: reach?.min.y ?? 0, max: reach?.max.y ?? 0 }
    }
  };
}

// How much of a drag past the bounds the view follows at first; it gives
// less the further out it is.
const STRETCH = 0.55;

// A drag's `raw` overshoot as shown, at most `give`.
function stretch(raw: number, give: number) {
  const shown = give * (1 - 1 / ((STRETCH * Math.abs(raw)) / give + 1));
  return Math.sign(raw) * shown;
}

// `stretch` undone.
function unstretch(shown: number, give: number) {
  const raw = (give / STRETCH) * (1 / (1 - Math.abs(shown) / give) - 1);
  return Math.sign(shown) * raw;
}

// The overshoot shown after a drag that, followed exactly, would take it
// from `over` (as shown) to `raw`: further out it stretches, back in it
// follows. Already as far out as `give` (as a zoom can leave it), it goes
// no further.
function stretched(over: number, raw: number, give: number) {
  const from = Math.sign(raw) === Math.sign(over) ? over : 0;
  if (Math.abs(raw) <= Math.abs(from)) return raw;
  if (Math.abs(from) >= give) return from;
  return stretch(unstretch(from, give) + raw - from, give);
}

// Along one axis: where content from `min` to `max` may start. Fitting,
// anywhere that keeps it on screen; larger, anywhere that keeps the screen
// covered but for the reach its overflow allows at either edge.
function axisRange(min: number, max: number, axis: Axis) {
  const spare = axis.size - (max - min);
  const over = Math.max(0, -spare);
  return {
    lo: Math.min(0, spare) - Math.min(over, axis.reach.max),
    hi: Math.max(0, spare) + Math.min(over, axis.reach.min)
  };
}

// Along one axis: how far the content is past its bounds.
function axisOvershoot(min: number, max: number, axis: Axis) {
  const { lo, hi } = axisRange(min, max, axis);
  return min - Math.min(hi, Math.max(lo, min));
}

// How far `content`, on screen, is past its bounds in `view`: positive where
// it has gone right or down of them.
export function overshoot(content: Extents, view: Screen): Point {
  const { x, y } = axes(view);
  return {
    x: axisOvershoot(content.min.x, content.max.x, x),
    y: axisOvershoot(content.min.y, content.max.y, y)
  };
}

// How far content follows a drag of `delta`: all of it within its bounds,
// stretched past them, giving at most the screen's size.
export function dragWithin(
  delta: Point,
  content: Extents,
  view: Screen
): Point {
  const moved = {
    min: { x: content.min.x + delta.x, y: content.min.y + delta.y },
    max: { x: content.max.x + delta.x, y: content.max.y + delta.y }
  };
  const before = overshoot(content, view);
  const after = overshoot(moved, view);
  return {
    x: delta.x + stretched(before.x, after.x, view.width) - after.x,
    y: delta.y + stretched(before.y, after.y, view.height) - after.y
  };
}

// The scale a zoom from `scale` toward `target` comes to: all of it within
// `bounds`, none of it past them. From past them already (as a fit to a huge
// chart can be), back in it follows and further out it stays put.
export function holdScale(scale: number, target: number, bounds: ScaleBounds) {
  const { minScale, maxScale } = bounds;
  if (target > maxScale) return Math.max(maxScale, Math.min(scale, target));
  if (target < minScale) return Math.min(minScale, Math.max(scale, target));
  return target;
}

export function withinScale(scale: number, bounds: ScaleBounds) {
  return Math.min(bounds.maxScale, Math.max(bounds.minScale, scale));
}

// Closer than this to its bound, an easing arrives there.
const ARRIVED = { log: 1e-3, px: 0.5 };
// How far from its bound an easing begins: within a quarter more zoom of
// its limit, and within an eighth of the view of an edge.
const EASE_LOG = Math.log(1.25);
const EASE_SHARE = 1 / 8;

// How far inside a bound something `room` inside it is after a move of
// `step` toward it (negative: away). Within `ease` of the bound it closes
// only a share of what's left, so it slows to rest at the bound instead of
// crossing it. Already past, it goes no further, only back.
function easeToward(room: number, step: number, ease: number) {
  if (room <= 0) return step > 0 ? room : room - step;
  // Distances within `ease` stretched out, so a constant step closes less
  // and less of them.
  const out = room >= ease ? room : ease + ease * Math.log(room / ease);
  const moved = out - step;
  return moved >= ease ? moved : ease * Math.exp((moved - ease) / ease);
}

// The scale a wheel zoom by `factor` from `scale` comes to, easing out to
// a limit of `bounds` rather than past it.
export function easeScale(scale: number, factor: number, bounds: ScaleBounds) {
  const max = Math.log(bounds.maxScale);
  const min = Math.log(bounds.minScale);
  const log = Math.log(scale);
  const step = Math.log(factor);
  if (step >= 0) {
    const room = easeToward(max - log, step, EASE_LOG);
    return room < ARRIVED.log ? bounds.maxScale : Math.exp(max - room);
  }
  const room = easeToward(log - min, -step, EASE_LOG);
  return room < ARRIVED.log ? bounds.minScale : Math.exp(min + room);
}

// Along one axis: how far content follows a coast of `delta`, easing out to
// its bound in the last eighth of the view rather than passing it.
function axisCoast(min: number, max: number, axis: Axis, delta: number) {
  if (delta === 0) return 0;
  const { lo, hi } = axisRange(min, max, axis);
  const room = delta > 0 ? hi - min : min - lo;
  if (room <= 0) return 0;
  let left = easeToward(room, Math.abs(delta), axis.size * EASE_SHARE);
  if (left < ARRIVED.px) left = 0;
  return Math.sign(delta) * (room - left);
}

// How far content on screen follows a coast of `delta`: all of it well
// within its bounds, slowing to rest at them.
export function coastWithin(
  delta: Point,
  content: Extents,
  view: Screen
): Point {
  const { x, y } = axes(view);
  return {
    x: axisCoast(content.min.x, content.max.x, x, delta.x),
    y: axisCoast(content.min.y, content.max.y, y, delta.y)
  };
}
