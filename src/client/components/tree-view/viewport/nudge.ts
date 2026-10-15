// The refocus Nudge: the pan that keeps what matters of the chart on the
// canvas. Pure geometry over the pan-zoom transform.

import { chartToScreen } from '@client/pan-zoom';
import type { Extents, Point, Transform, Viewport } from '@client/pan-zoom';

interface Span {
  low: number;
  high: number;
}

interface AxisSpan {
  region: Span;
  chart: Span;
  cores: Span[];
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
// large to fit centres Focus's anchor, then pulls the first core that fits back
// inside the margins, so the clip falls on the rest of the row, not on the part
// that matters most.
function regionShift(span: AxisSpan, size: number, margin: number) {
  const { region, cores, anchor } = span;
  const room = size - margin * 2;
  if (region.high - region.low > room) {
    const shift = size / 2 - anchor;
    const core = cores.find((c) => c.high - c.low <= room);
    return core === undefined ? shift : pullInside(core, shift, size, margin);
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
  // What to keep on screen first when the region is too large to fit an axis,
  // most preferred first; the first that fits an axis is used.
  cores: Extents[];
  // Chart point kept centred on an axis the region is too large for.
  focus: Point;
  viewBoxOrigin: Point;
  canvas: Viewport;
  marginPx: number;
}

// The pan that keeps the region, and as much of the chart as fits, on the
// canvas, padded by marginPx. Scale is untouched.
export function nudgeIntoView(t: Transform, target: NudgeTarget): Point {
  const { region, chart, cores, focus, viewBoxOrigin, canvas, marginPx } =
    target;
  function place(p: Point) {
    return chartToScreen(t, p, viewBoxOrigin);
  }
  const rLo = place(region.min);
  const rHi = place(region.max);
  const cLo = place(chart.min);
  const cHi = place(chart.max);
  const coresLo = cores.map((c) => place(c.min));
  const coresHi = cores.map((c) => place(c.max));
  const at = place(focus);
  return {
    x: nudgeAxis(
      t.pan.x,
      {
        region: { low: rLo.x, high: rHi.x },
        chart: { low: cLo.x, high: cHi.x },
        cores: cores.map((_, i) => ({
          low: coresLo[i]!.x,
          high: coresHi[i]!.x
        })),
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
        cores: cores.map((_, i) => ({
          low: coresLo[i]!.y,
          high: coresHi[i]!.y
        })),
        anchor: at.y
      },
      canvas.height,
      marginPx
    )
  };
}
