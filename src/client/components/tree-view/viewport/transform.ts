// Pure geometry for the tree-view canvas's pan + zoom transform. No DOM,
// no Lit. The component holds `{ pan, scale }` state and dispatches to
// these helpers; the SVG element maps `chart → SVG-pixel` via its viewBox
// (so `viewBoxOrigin = extents.min - margin`), and the surrounding .pan
// div applies `translate(pan) scale(scale)` to that SVG.
//
// Therefore: screen = pan + scale * (chart - viewBoxOrigin).

import type { Extents, Point } from '../emit';

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
// existing pin-on-refocus behavior.
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
// `factor` (clamped to bounds) and pan adjusted so the chart point
// currently under cursorScreen remains under cursorScreen at the new scale.
// viewBoxOrigin cancels in the math (the chart point under cursor is the
// same before and after at the same vbo), so it isn't a parameter here.
export function zoomAt(
  t: Transform,
  cursorScreen: Point,
  factor: number,
  bounds: ScaleBounds
): Transform {
  // Elastic bounds: if scale is already outside [minScale, maxScale] (e.g.
  // fitTo computed a scale below minScale to fit a huge chart), the user
  // can come back into bounds but can't drift further out. Without this,
  // wheel-out from a sub-minScale fit would snap scale UP to minScale.
  const targetScale = t.scale * factor;
  const effMin = Math.min(bounds.minScale, t.scale);
  const effMax = Math.max(bounds.maxScale, t.scale);
  const newScale = Math.min(effMax, Math.max(effMin, targetScale));
  // Substituting (chart - vbo) = (cursor - pan) / scale into the pin formula:
  // newPan = cursor - (newScale / oldScale) * (cursor - oldPan)
  const ratio = newScale / t.scale;
  return {
    scale: newScale,
    pan: {
      x: cursorScreen.x - ratio * (cursorScreen.x - t.pan.x),
      y: cursorScreen.y - ratio * (cursorScreen.y - t.pan.y)
    }
  };
}

interface AxisSpan {
  low: number;
  high: number;
  anchor: number;
}

// Shift along one axis the least that brings the span inside [margin, size -
// margin]; when it cannot fit, centre its anchor instead so the clip falls
// evenly on the region's far edges.
function nudgeAxis(pan: number, span: AxisSpan, size: number, margin: number) {
  const { low, high, anchor } = span;
  if (high - low > size - margin * 2) return pan + size / 2 - anchor;
  if (low < margin) return pan + (margin - low);
  if (high > size - margin) return pan - (high - (size - margin));
  return pan;
}

export interface NudgeTarget {
  // Chart-coord rectangle to bring on screen.
  region: Extents;
  // Chart point kept centred on an axis the region is too large for.
  focus: Point;
  viewBoxOrigin: Point;
  canvas: Viewport;
  marginPx: number;
}

// The pan that brings the region inside the canvas, padded by marginPx, with
// the smallest shift per axis. Scale is untouched.
export function nudgeIntoView(t: Transform, target: NudgeTarget): Point {
  const { region, focus, viewBoxOrigin, canvas, marginPx } = target;
  const lo = chartToScreen(t, region.min, viewBoxOrigin);
  const hi = chartToScreen(t, region.max, viewBoxOrigin);
  const at = chartToScreen(t, focus, viewBoxOrigin);
  return {
    x: nudgeAxis(
      t.pan.x,
      { low: lo.x, high: hi.x, anchor: at.x },
      canvas.width,
      marginPx
    ),
    y: nudgeAxis(
      t.pan.y,
      { low: lo.y, high: hi.y, anchor: at.y },
      canvas.height,
      marginPx
    )
  };
}
