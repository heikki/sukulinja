// Pure geometry for the tree-view canvas's pan + zoom transform. No DOM,
// no Lit. The component holds `{ pan, scale }` state and dispatches to
// these helpers; the SVG element maps `chart → SVG-pixel` via its viewBox
// (so `viewBoxOrigin = extents.min - margin`), and the surrounding .pan
// div applies `translate(pan) scale(scale)` to that SVG.
//
// Therefore: screen = pan + scale * (chart - viewBoxOrigin).

import type { Point } from './emit';

export interface Transform {
  pan: Point;
  scale: number;
}

export interface ScaleBounds {
  minScale: number;
  maxScale: number;
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
  const targetScale = t.scale * factor;
  const newScale = Math.min(
    bounds.maxScale,
    Math.max(bounds.minScale, targetScale)
  );
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
