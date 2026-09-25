// The pure core of the Transition: given the previous and next Hourglass chart and
// the Relayout kind, decide for every box and edge whether it slides (Move), fades
// in (Enter) or fades out as a Ghost (Leave), and where each slider goes from → to
// in screen space. Knows *what* moves, never *when* (the Schedule) and never
// touches the DOM (apply.ts).
//
// FLIP runs in two moments with two viewports: captureFirst snapshots old screen
// positions through the *old* viewport before the layout changes; planTransition
// pairs them against the settled new layout through the *new* viewport.
//
// Pairing is one-to-one between instances. Items carry a unique per-instance `key`
// (the path); a *match key* groups the candidates: a Generation Relayout keeps the
// tree rooted (the key itself), a Focus Relayout re-roots, so it falls back to the
// relayout-invariant personId / baseKey. A group can hold several instances on
// either side (pedigree collapse, or one person drawn in two roles), so each
// instance pairs with its nearest counterpart on screen; the rest enter or leave.

import type { Box, DrawnLine, EmitOutput, LineKind, Point } from '../emit';

// Focus = focus change (re-roots, match by personId/baseKey); Generation = level
// change (rooted, match by unique key).
export type RelayoutKind = 'focus' | 'generation';

// Maps a chart-local point to a screen pixel under the *current* viewport
// (pan/extents/scale). Returns null before the viewport can resolve it.
export type ToScreen = (p: Point) => Point | null;

// A card's on-screen footprint, in screen pixels.
export interface CardSize {
  width: number;
  height: number;
}

// Old screen positions captured before the relayout, keyed by instance key,
// alongside the chart they were read from. An edge's are its points.
export interface FirstScreen {
  chart: EmitOutput;
  boxes: Map<string, Point>;
  edges: Map<string, Point[]>;
}

// A surviving box: its new unique key (to find the element) plus where it slides
// from (old screen) → to (new screen).
export interface BoxMove {
  key: string;
  from: Point;
  to: Point;
}

// A surviving edge: its new unique key and kind, the new chart-local points
// (the slide target), and each point's old → new screen position.
export interface EdgeMove {
  key: string;
  kind: LineKind;
  local: Point[];
  from: Point[];
  to: Point[];
}

export interface MovePlan {
  boxes: BoxMove[];
  edges: EdgeMove[];
}

// Instance keys of the next chart's boxes/edges that fade in.
export interface EnterPlan {
  boxKeys: Set<string>;
  edgeKeys: Set<string>;
}

// The previous chart's boxes/edges that fade out as Ghosts, with their old
// chart-local geometry intact.
export interface LeavePlan {
  boxes: Box[];
  edges: DrawnLine[];
}

// Every item lands in exactly one phase: a next-chart item either moves (and has
// an old → new pair) or enters; a prev-chart item either moves or leaves.
export interface TransitionPlan {
  move: MovePlan;
  enter: EnterPlan;
  leave: LeavePlan;
  // Old key → new key of every sliding survivor, so state tied to an old
  // instance (an Enter fade still running) can follow it across the relayout.
  pairs: { boxes: Map<string, string>; edges: Map<string, string> };
}

// FLIP "First": snapshot every on-screen card and edge endpoint in screen space,
// read through the old viewport before the layout changes.
export function captureFirst(
  prev: EmitOutput,
  toScreen: ToScreen
): FirstScreen {
  const boxes = new Map<string, Point>();
  for (const b of prev.boxes) {
    const s = toScreen(b.pos);
    if (s !== null) boxes.set(b.key, s);
  }
  const edges = new Map<string, Point[]>();
  for (const l of prev.lines) {
    const s = pointsToScreen(l.points, toScreen);
    if (s !== null) edges.set(l.key, s);
  }
  return { chart: prev, boxes, edges };
}

// How to read the new layout: the Relayout kind, the chart→screen mapping under
// the settled (new) viewport, and the on-screen card size.
export interface PlanContext {
  kind: RelayoutKind;
  toScreen: ToScreen;
  card: CardSize;
}

// FLIP "Last": pair the settled new layout against the captured old positions and
// split every item into Move / Enter / Leave.
export function planTransition(
  first: FirstScreen,
  next: EmitOutput,
  { kind, toScreen, card }: PlanContext
): TransitionPlan {
  const byKey = kind === 'generation';
  const prev = first.chart;

  const boxTo = screenMap(next.boxes, (b) => toScreen(b.pos));
  const boxPairs = pairNearest(
    prev.boxes.filter((b) => first.boxes.has(b.key)),
    next.boxes.filter((b) => boxTo.has(b.key)),
    (b) => (byKey ? b.key : `p${b.personId}`),
    (o, n) => dist(first.boxes.get(o.key)!, boxTo.get(n.key)!)
  );
  for (const k of collisions(boxPairs, first.boxes, boxTo, card)) {
    boxPairs.delete(k);
  }

  const edgeTo = screenMap(next.lines, (l) =>
    pointsToScreen(l.points, toScreen)
  );
  const edgePairs = pairNearest(
    prev.lines.filter((l) => first.edges.has(l.key)),
    next.lines.filter((l) => edgeTo.has(l.key)),
    (l) => (byKey ? l.key : l.baseKey),
    (o, n) => {
      if (!connected(o, n, boxPairs)) return null;
      const a = first.edges.get(o.key)!;
      const b = edgeTo.get(n.key)!;
      // Points slide pairwise, so the shapes must match point for point.
      if (a.length !== b.length) return null;
      return a.reduce((sum, p, i) => sum + dist(p, b[i]!), 0);
    }
  );

  const nextBoxes = new Map(next.boxes.map((b) => [b.key, b]));
  const nextLines = new Map(next.lines.map((l) => [l.key, l]));
  const movedBoxes = new Set(boxPairs.values());
  const movedEdges = new Set(edgePairs.values());
  return {
    move: {
      boxes: [...boxPairs].map(([o, n]) => ({
        key: n,
        from: first.boxes.get(o)!,
        to: boxTo.get(n)!
      })),
      edges: [...edgePairs].map(([o, n]) => {
        const l = nextLines.get(n)!;
        return {
          key: n,
          kind: l.kind,
          local: l.points,
          from: first.edges.get(o)!,
          to: edgeTo.get(n)!
        };
      })
    },
    enter: {
      boxKeys: new Set([...nextBoxes.keys()].filter((k) => !movedBoxes.has(k))),
      edgeKeys: new Set([...nextLines.keys()].filter((k) => !movedEdges.has(k)))
    },
    leave: {
      boxes: prev.boxes.filter((b) => !boxPairs.has(b.key)),
      edges: prev.lines.filter((l) => !edgePairs.has(l.key))
    },
    pairs: { boxes: boxPairs, edges: edgePairs }
  };
}

// Every item on a first paint fades in.
export function enterAll(chart: EmitOutput): EnterPlan {
  return {
    boxKeys: new Set(chart.boxes.map((b) => b.key)),
    edgeKeys: new Set(chart.lines.map((l) => l.key))
  };
}

// An edge slides only with the boxes it touches: pairing its old and new instance
// must carry each old attached box onto a new attached one, else the slide would
// leave it dangling from a card that fades instead.
function connected(
  o: DrawnLine,
  n: DrawnLine,
  boxPairs: ReadonlyMap<string, string>
) {
  return (
    o.attach.length === n.attach.length &&
    o.attach.every((k) => n.attach.includes(boxPairs.get(k) ?? ''))
  );
}

function pointsToScreen(points: Point[], toScreen: ToScreen) {
  const out: Point[] = [];
  for (const p of points) {
    const s = toScreen(p);
    if (s === null) return null;
    out.push(s);
  }
  return out;
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function screenMap<T extends { key: string }, S>(
  items: T[],
  toScreen: (item: T) => S | null
) {
  const out = new Map<string, S>();
  for (const item of items) {
    const s = toScreen(item);
    if (s !== null) out.set(item.key, s);
  }
  return out;
}

// One-to-one pairing within each match-key group, nearest first. `cost` returns
// null for a pair that must not form. Almost every group is a single instance on
// each side; the greedy sort only matters for the few that repeat.
function pairNearest<T extends { key: string }>(
  olds: T[],
  news: T[],
  matchKey: (item: T) => string,
  cost: (o: T, n: T) => number | null
) {
  const groups = new Map<string, { olds: T[]; news: T[] }>();
  for (const o of olds) groupOf(groups, matchKey(o)).olds.push(o);
  for (const n of news) groupOf(groups, matchKey(n)).news.push(n);
  const pairs = new Map<string, string>();
  for (const g of groups.values()) {
    const candidates: Array<{ o: T; n: T; c: number }> = [];
    for (const o of g.olds) {
      for (const n of g.news) {
        const c = cost(o, n);
        if (c !== null) candidates.push({ o, n, c });
      }
    }
    candidates.sort((a, b) => a.c - b.c);
    const taken = new Set<string>();
    for (const { o, n } of candidates) {
      if (pairs.has(o.key) || taken.has(n.key)) continue;
      pairs.set(o.key, n.key);
      taken.add(n.key);
    }
  }
  return pairs;
}

function groupOf<T>(groups: Map<string, { olds: T[]; news: T[] }>, k: string) {
  let g = groups.get(k);
  if (g === undefined) {
    g = { olds: [], news: [] };
    groups.set(k, g);
  }
  return g;
}

// Survivors whose slide would pass through another survivor's card. All slides
// share one easing, so two cards' separation moves along a straight line from
// its old to its new value; they collide when that line enters the zone where
// the cards overlap. Farthest travellers go first: each one that still collides
// with a remaining slider is dropped (its old key returned), so the long jumps
// fade out and back in while the short, local slides keep moving.
function collisions(
  pairs: Map<string, string>,
  from: Map<string, Point>,
  to: Map<string, Point>,
  card: CardSize
) {
  const sliders = [...pairs].map(([o, n]) => {
    const a = from.get(o)!;
    const b = to.get(n)!;
    return { key: o, from: a, delta: { x: b.x - a.x, y: b.y - a.y } };
  });
  sliders.sort(
    (p, q) =>
      Math.hypot(q.delta.x, q.delta.y) - Math.hypot(p.delta.x, p.delta.y)
  );
  const dropped = new Set<string>();
  for (const p of sliders) {
    const hit = sliders.some(
      (q) =>
        q !== p &&
        !dropped.has(q.key) &&
        passesThrough(
          { x: q.from.x - p.from.x, y: q.from.y - p.from.y },
          { x: q.delta.x - p.delta.x, y: q.delta.y - p.delta.y },
          card
        )
    );
    if (hit) dropped.add(p.key);
  }
  return dropped;
}

// Does the separation `start + s·step` (s ∈ [0, 1]) enter the open overlap zone
// |x| < width, |y| < height?
function passesThrough(start: Point, step: Point, card: CardSize) {
  const x = overlapSpan(start.x, step.x, card.width);
  const y = overlapSpan(start.y, step.y, card.height);
  if (x === null || y === null) return false;
  return Math.max(x.lo, y.lo, 0) < Math.min(x.hi, y.hi, 1);
}

// The span of s where |start + s·step| < reach.
function overlapSpan(start: number, step: number, reach: number) {
  if (step === 0) {
    return Math.abs(start) < reach ? { lo: -Infinity, hi: Infinity } : null;
  }
  const a = (-reach - start) / step;
  const b = (reach - start) / step;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}
