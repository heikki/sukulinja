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

interface Span {
  low: number;
  high: number;
}

interface AxisSpan {
  region: Span;
  chart: Span;
  core: Span;
  anchor: number;
}

// The least extra shift that brings the span inside [margin, size - margin].
function pullInside(span: Span, shift: number, size: number, margin: number) {
  const low = span.low + shift;
  const high = span.high + shift;
  if (low < margin) return shift + margin - low;
  if (high > size - margin) return shift - (high - (size - margin));
  return shift;
}

// Shift that keeps the region on screen. A region that clips is centred. One too
// large to fit centres Focus's anchor, then pulls the core (Focus and spouses)
// back inside the margins when it fits, so the clip falls on the rest of the
// row, not on a spouse.
function regionShift(span: AxisSpan, size: number, margin: number) {
  const { region, core, anchor } = span;
  const room = size - margin * 2;
  if (region.high - region.low > room) {
    const shift = size / 2 - anchor;
    return core.high - core.low <= room
      ? pullInside(core, shift, size, margin)
      : shift;
  }
  if (region.low >= margin && region.high <= size - margin) return 0;
  return size / 2 - (region.low + region.high) / 2;
}

// Pull the chart so its edge never leaves empty canvas on one side while the
// other side is clipped.
function coverShift(chart: Span, shift: number, size: number, margin: number) {
  const low = chart.low + shift;
  const high = chart.high + shift;
  if (low > margin) return shift - (low - margin);
  if (high < size - margin) return shift + (size - margin - high);
  return shift;
}

// One axis of the Nudge. A chart that fits inside [margin, size - margin] is
// left alone unless an edge clips, then centred whole. A chart too large to fit
// keeps its region on screen, then is covered so no empty canvas shows.
function nudgeAxis(pan: number, span: AxisSpan, size: number, margin: number) {
  const { chart } = span;
  if (chart.high - chart.low <= size - margin * 2) {
    if (chart.low >= margin && chart.high <= size - margin) return pan;
    return pan + size / 2 - (chart.low + chart.high) / 2;
  }
  const shift = regionShift(span, size, margin);
  return pan + coverShift(chart, shift, size, margin);
}

export interface NudgeTarget {
  // Chart-coord rectangle to keep on screen.
  region: Extents;
  // The whole chart's extents, so the Nudge can avoid leaving the canvas empty
  // on one side while the other side is clipped.
  chart: Extents;
  // Focus and their spouses: kept on screen first when the region is too large
  // to fit an axis.
  core: Extents;
  // Chart point kept centred on an axis the region is too large for.
  focus: Point;
  viewBoxOrigin: Point;
  canvas: Viewport;
  marginPx: number;
}

// The pan that keeps the region, and as much of the chart as fits, on the
// canvas, padded by marginPx. Scale is untouched.
export function nudgeIntoView(t: Transform, target: NudgeTarget): Point {
  const { region, chart, core, focus, viewBoxOrigin, canvas, marginPx } =
    target;
  function place(p: Point) {
    return chartToScreen(t, p, viewBoxOrigin);
  }
  const rLo = place(region.min);
  const rHi = place(region.max);
  const cLo = place(chart.min);
  const cHi = place(chart.max);
  const kLo = place(core.min);
  const kHi = place(core.max);
  const at = place(focus);
  return {
    x: nudgeAxis(
      t.pan.x,
      {
        region: { low: rLo.x, high: rHi.x },
        chart: { low: cLo.x, high: cHi.x },
        core: { low: kLo.x, high: kHi.x },
        anchor: at.x
      },
      canvas.width,
      marginPx
    ),
    y: nudgeAxis(
      t.pan.y,
      {
        region: { low: rLo.y, high: rHi.y },
        chart: { low: cLo.y, high: cHi.y },
        core: { low: kLo.y, high: kHi.y },
        anchor: at.y
      },
      canvas.height,
      marginPx
    )
  };
}
