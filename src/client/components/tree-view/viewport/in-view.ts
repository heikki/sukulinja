import type { Point } from '@/client/pan-zoom';

interface Rect {
  min: Point;
  max: Point;
}

// The least shift that brings `rect` inside `view`, per axis; one too large
// for the view is centred in it.
export function shiftIntoView(rect: Rect, view: Rect): Point {
  return {
    x: axisShift(rect.min.x, rect.max.x, view.min.x, view.max.x),
    y: axisShift(rect.min.y, rect.max.y, view.min.y, view.max.y)
  };
}

function axisShift(lo: number, hi: number, viewLo: number, viewHi: number) {
  if (hi - lo > viewHi - viewLo) return (viewLo + viewHi - lo - hi) / 2;
  if (lo < viewLo) return viewLo - lo;
  if (hi > viewHi) return viewHi - hi;
  return 0;
}
