// Paths for the chart's connecting lines, built from a DrawnLine's points. A Tie
// is a straight segment. A sibship's Drop, Bar and Legs are one connector: where
// the Bar ends in the only vertical that meets it there, the line turns a
// rounded corner; T-junctions — middle Legs, a Drop landing mid-Bar, or a Drop
// and a Leg meeting the same end — stay square. The Move rebuilds the path from
// interpolated points every frame, so corners stay round mid-slide.

import type { LineKind, Point } from './emit';

// Corner radius in user units; a corner shrinks to fit a short run.
const CORNER_RADIUS = 20;
// Verticals closer than this (user units) share a column.
const SAME_COLUMN = 0.5;

export function edgePath(kind: LineKind, points: readonly Point[]) {
  return kind === 'tie' ? polyline(points) : sibshipPath(points);
}

interface Vertical {
  x: number;
  // The end away from the Bar: the Drop's anchor above, or a Leg's foot below.
  end: Point;
}

function sibshipPath(points: readonly Point[]) {
  const [anchor, bus, ...kids] = points;
  if (anchor === undefined || bus === undefined) return '';
  // A Drop whose top sits on the Bar (no parent to hang from) isn't drawn.
  const verticals: Vertical[] = [anchor, ...kids]
    .filter((end) => end.y !== bus.y)
    .map((end) => ({ x: end.x, end }));
  const xs = verticals.map((v) => v.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const busY = bus.y;
  function onBus(x: number) {
    return { x, y: busY };
  }
  // A Bar collapsed to a point: every vertical meets it straight on.
  if (maxX - minX < SAME_COLUMN) {
    return verticals.map((v) => polyline([onBus(v.x), v.end])).join(' ');
  }
  const leftTurn = loneVerticalAt(verticals, minX);
  const rightTurn = loneVerticalAt(verticals, maxX);
  const run = [
    ...(leftTurn === null ? [] : [leftTurn.end]),
    onBus(minX),
    onBus(maxX),
    ...(rightTurn === null ? [] : [rightTurn.end])
  ];
  const branches = verticals
    .filter((v) => v !== leftTurn && v !== rightTurn)
    .map((v) => polyline([onBus(v.x), v.end]));
  return [rounded(run), ...branches].join(' ');
}

// The vertical meeting the Bar's end at x, if it is the only one there — then
// the line turns a corner; with two (a Drop straight over a Leg) it's a T.
function loneVerticalAt(verticals: Vertical[], x: number) {
  const at = verticals.filter((v) => Math.abs(v.x - x) < SAME_COLUMN);
  return at.length === 1 ? at[0]! : null;
}

function polyline(points: readonly Point[]) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

// A polyline whose interior corners are quarter-circle arcs. Each radius is
// capped so neighbouring corners never overlap: a run between two corners lends
// each at most half its length, an end run all of it.
function rounded(points: readonly Point[]) {
  const last = points.length - 1;
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < last; i++) {
    const prev = points[i - 1]!;
    const at = points[i]!;
    const next = points[i + 1]!;
    const inLen = Math.hypot(at.x - prev.x, at.y - prev.y);
    const outLen = Math.hypot(next.x - at.x, next.y - at.y);
    const turn =
      (at.x - prev.x) * (next.y - at.y) - (at.y - prev.y) * (next.x - at.x);
    const r = Math.min(
      CORNER_RADIUS,
      i > 1 ? inLen / 2 : inLen,
      i < last - 1 ? outLen / 2 : outLen
    );
    if (turn === 0 || r <= 0) {
      d += ` L ${at.x} ${at.y}`;
      continue;
    }
    const a = toward(at, prev, inLen, r);
    const b = toward(at, next, outLen, r);
    // Screen y points down, so a positive turn is clockwise: sweep-flag 1.
    d += ` L ${a.x} ${a.y} A ${r} ${r} 0 0 ${turn > 0 ? 1 : 0} ${b.x} ${b.y}`;
  }
  return `${d} L ${points[last]!.x} ${points[last]!.y}`;
}

// The point `distance` along from → to (whose length is `len`). Scaling the unit
// direction keeps axis-aligned runs exact.
function toward(from: Point, to: Point, len: number, distance: number) {
  return {
    x: from.x + ((to.x - from.x) / len) * distance,
    y: from.y + ((to.y - from.y) / len) * distance
  };
}
