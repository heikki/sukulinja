// Pure geometry for a pan + zoom transform over some content: the tree-view's
// chart, or a scan in the Scan viewer. No DOM, no Lit. The component holds
// `{ pan, scale }` state and dispatches to these helpers. In the chart, the
// SVG maps `chart → SVG-pixel` via its viewBox (so `viewBoxOrigin =
// extents.min - margin`) and the surrounding .pan div applies
// `translate(pan) scale(scale)` to that SVG; an image's origin is 0,0.
//
// Therefore: screen = pan + scale * (chart - viewBoxOrigin).

import { stretchScale } from './bounds';

export interface Point {
  x: number;
  y: number;
}

export interface Extents {
  min: Point;
  max: Point;
}

export interface Transform {
  pan: Point;
  scale: number;
}

export interface ScaleBounds {
  minScale: number;
  maxScale: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface FitOptions {
  maxScale: number;
  marginPx: number;
}

export function chartToScreen(
  t: Transform,
  chartPoint: Point,
  viewBoxOrigin: Point
): Point {
  return {
    x: t.pan.x + t.scale * (chartPoint.x - viewBoxOrigin.x),
    y: t.pan.y + t.scale * (chartPoint.y - viewBoxOrigin.y)
  };
}

// Given a known scale, return the pan that makes chartPoint land at
// screenPoint. Used by both the wheel-zoom anchor-preservation and the
// existing pin-on-re-root behavior.
export function pinChartPointAtScreen(
  scale: number,
  chartPoint: Point,
  screenPoint: Point,
  viewBoxOrigin: Point
): Point {
  return {
    x: screenPoint.x - scale * (chartPoint.x - viewBoxOrigin.x),
    y: screenPoint.y - scale * (chartPoint.y - viewBoxOrigin.y)
  };
}

// Return the Transform that fits `extents` into `viewport`, centered, with
// `marginPx` breathing room on each side. Scale is capped at `maxScale` so
// small charts don't get blown up past 1:1.
export function fitTo(
  extents: Extents,
  viewBoxOrigin: Point,
  viewport: Viewport,
  opts: FitOptions
): Transform {
  const contentW = extents.max.x - extents.min.x;
  const contentH = extents.max.y - extents.min.y;
  const availW = Math.max(0, viewport.width - opts.marginPx * 2);
  const availH = Math.max(0, viewport.height - opts.marginPx * 2);
  const fitScaleX = contentW > 0 ? availW / contentW : opts.maxScale;
  const fitScaleY = contentH > 0 ? availH / contentH : opts.maxScale;
  const scale = Math.min(fitScaleX, fitScaleY, opts.maxScale);
  const chartCenter = {
    x: (extents.min.x + extents.max.x) / 2,
    y: (extents.min.y + extents.max.y) / 2
  };
  const pan = pinChartPointAtScreen(
    scale,
    chartCenter,
    { x: viewport.width / 2, y: viewport.height / 2 },
    viewBoxOrigin
  );
  return { pan, scale };
}

// Cursor-anchored zoom. Returns a new Transform with scale multiplied by
// `factor` and pan adjusted so the chart point currently under cursorScreen
// remains under cursorScreen at the new scale. Past `bounds` the scale
// stretches (bounds.ts): further out it gives less, back in it follows, and
// from far outside them (as a fit to a huge chart can be) it goes no
// further out. viewBoxOrigin cancels in the math (the chart point under
// cursor is the same before and after at the same vbo), so it isn't a
// parameter here.
export function zoomAt(
  t: Transform,
  cursorScreen: Point,
  factor: number,
  bounds: ScaleBounds
): Transform {
  const newScale = stretchScale(t.scale, t.scale * factor, bounds);
  return zoomAround(t, cursorScreen, newScale / t.scale);
}

// `t` scaled by `ratio` about `at` on screen, which stays put.
export function zoomAround(t: Transform, at: Point, ratio: number): Transform {
  // Substituting (chart - vbo) = (cursor - pan) / scale into the pin formula:
  // newPan = cursor - (newScale / oldScale) * (cursor - oldPan)
  return {
    scale: t.scale * ratio,
    pan: {
      x: at.x - ratio * (at.x - t.pan.x),
      y: at.y - ratio * (at.y - t.pan.y)
    }
  };
}
