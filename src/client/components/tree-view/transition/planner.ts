// The pure core of the Transition: given the previous and next Hourglass chart and
// the Relayout kind, work out which boxes and edges survive and where each slides
// from → to in screen space. Knows *what* moves, never *when* (the controller) and
// never touches the DOM (apply.ts).
//
// FLIP runs in two moments with two viewports: captureFirst snapshots old screen
// positions through the *old* viewport before the layout changes; planMove pairs
// them against the settled new layout through the *new* viewport.
//
// Items carry a unique per-instance `key` (the path) so pedigree-collapse
// duplicates stay apart. Matching across the relayout uses a *match key*: a
// Generation Relayout keeps the tree rooted (key used directly); a Focus Relayout
// re-roots, so it falls back to the relayout-invariant personId / baseKey.

import type { Box, DrawnLine, EmitOutput, Point } from '../emit';

// Focus = focus change (re-roots, match by personId/baseKey); Generation = level
// change (rooted, match by unique key).
export type RelayoutKind = 'focus' | 'generation';

// Maps a chart-local point to a screen pixel under the *current* viewport
// (pan/extents/scale). Returns null before the viewport can resolve it.
export type ToScreen = (p: Point) => Point | null;

// Old screen positions captured before the relayout, keyed by match key. Edge
// endpoints are kept as a screen-space segment.
export interface FirstScreen {
  boxes: Map<string, Point>;
  edges: Map<string, { from: Point; to: Point }>;
}

// A surviving box: its new unique key (to find the element) plus where it slides
// from (old screen) → to (new screen).
export interface BoxMove {
  key: string;
  from: Point;
  to: Point;
}

// A surviving edge: its new unique key, the new chart-local endpoints (the morph
// target), and the old → new screen-space endpoints.
export interface EdgeMove {
  key: string;
  local: { from: Point; to: Point };
  from: { from: Point; to: Point };
  to: { from: Point; to: Point };
}

export interface MovePlan {
  boxes: BoxMove[];
  edges: EdgeMove[];
}

function boxMatchKey(key: string, personId: number, byKey: boolean) {
  return byKey ? key : `p${personId}`;
}

function edgeMatchKey(key: string, baseKey: string, byKey: boolean) {
  return byKey ? key : baseKey;
}

// FLIP "First": snapshot every on-screen card and edge endpoint in screen space,
// read through the old viewport before the layout changes.
export function captureFirst(
  prev: EmitOutput,
  kind: RelayoutKind,
  toScreen: ToScreen
): FirstScreen {
  const byKey = kind === 'generation';
  const boxes = new Map<string, Point>();
  for (const b of prev.boxes) {
    const s = toScreen(b.pos);
    if (s !== null) boxes.set(boxMatchKey(b.key, b.personId, byKey), s);
  }
  const edges = new Map<string, { from: Point; to: Point }>();
  for (const l of prev.lines) {
    const from = toScreen(l.from);
    const to = toScreen(l.to);
    if (from !== null && to !== null) {
      edges.set(edgeMatchKey(l.key, l.baseKey, byKey), { from, to });
    }
  }
  return { boxes, edges };
}

// FLIP "Last": pair the settled new layout against the captured old positions.
// A box/edge present in both is a mover with from (old screen) → to (new
// screen); one absent from `first` is new (it fades in — the Enter phase) and is
// skipped here.
export function planMove(
  first: FirstScreen,
  next: EmitOutput,
  kind: RelayoutKind,
  toScreen: ToScreen
): MovePlan {
  const byKey = kind === 'generation';
  const boxes: BoxMove[] = [];
  for (const b of next.boxes) {
    const from = first.boxes.get(boxMatchKey(b.key, b.personId, byKey));
    if (from === undefined) continue;
    const to = toScreen(b.pos);
    if (to === null) continue;
    boxes.push({ key: b.key, from, to });
  }
  const edges: EdgeMove[] = [];
  for (const l of next.lines) {
    const from = first.edges.get(edgeMatchKey(l.key, l.baseKey, byKey));
    if (from === undefined) continue;
    const toFrom = toScreen(l.from);
    const toTo = toScreen(l.to);
    if (toFrom === null || toTo === null) continue;
    edges.push({
      key: l.key,
      local: { from: l.from, to: l.to },
      from,
      to: { from: toFrom, to: toTo }
    });
  }
  return { boxes, edges };
}

// A chart's relayout-invariant identity: persons by id, family edges by base
// key. Pedigree-collapse duplicates (same personId, several boxes) and the two
// instances of a collapsed family fold to one entry each, so a re-rooting Focus
// Relayout still recognises who/what survived.
export interface ChartIds {
  boxIds: Set<number>;
  edgeKeys: Set<string>;
}

export function emptyChartIds(): ChartIds {
  return { boxIds: new Set(), edgeKeys: new Set() };
}

export function chartIds(chart: EmitOutput): ChartIds {
  return {
    boxIds: new Set(chart.boxes.map((b) => b.personId)),
    edgeKeys: new Set(chart.lines.map((l) => l.baseKey))
  };
}

// The Enter set: persons / families present in `next` but absent from the last
// layout. Keyed by identity (not the per-instance key) so a Focus Relayout, which
// re-keys every instance, fades only genuinely-new items rather than the whole
// chart.
export function planEnter(next: ChartIds, prev: ChartIds): ChartIds {
  return {
    boxIds: new Set([...next.boxIds].filter((id) => !prev.boxIds.has(id))),
    edgeKeys: new Set([...next.edgeKeys].filter((k) => !prev.edgeKeys.has(k)))
  };
}

// The Leave set: the previous chart's boxes and edges absent from `next`, with
// their old chart-local geometry intact so the controller can render them as
// fading Ghosts. Matched the same way as Move — by unique key on a Generation
// Relayout, by personId / baseKey on a Focus Relayout — so an item that merely
// re-keys (and so really survives) is not mistaken for a departure.
export interface LeavePlan {
  boxes: Box[];
  edges: DrawnLine[];
}

export function planLeave(
  prev: EmitOutput,
  next: EmitOutput,
  kind: RelayoutKind
): LeavePlan {
  const byKey = kind === 'generation';
  const nextBoxes = new Set(
    next.boxes.map((b) => boxMatchKey(b.key, b.personId, byKey))
  );
  const nextEdges = new Set(
    next.lines.map((l) => edgeMatchKey(l.key, l.baseKey, byKey))
  );
  return {
    boxes: prev.boxes.filter(
      (b) => !nextBoxes.has(boxMatchKey(b.key, b.personId, byKey))
    ),
    edges: prev.lines.filter(
      (l) => !nextEdges.has(edgeMatchKey(l.key, l.baseKey, byKey))
    )
  };
}
