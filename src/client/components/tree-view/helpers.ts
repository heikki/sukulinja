// Pure layout helpers and shared types for the tree-view component.
//
// See docs/tree-view.html for the domain vocabulary and
// docs/adr/0001-tree-view-layout-architecture.md for the load-bearing
// design decisions (Sub-layout calculus, asymmetric sibship rule).

import type { FamilyRow, PersonRow } from '@common/types';

export type { FamilyRow, PersonRow };

// Indices passed to the recursive layout functions.
export interface LayoutIndices {
  persons: Map<number, PersonRow>;
  parentFamByPerson: Map<number, FamilyRow>;
  spouseFamsByPerson: Map<number, FamilyRow[]>;
  levels: number;
}

export interface PositionedPerson {
  id: number;
  x: number;
  y: number;
}

export interface Line {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Sub-layout: a positioned sub-region with pivot at local x=0. leftWidth /
// rightWidth measure extent on each side of the pivot. Composers shift
// sub-layouts to land their pivot at a target X.
export interface SubLayout {
  leftWidth: number;
  rightWidth: number;
  nodes: PositionedPerson[];
  lines: Line[];
}

export const BOX_W = 184;
export const BOX_H = 90;
export const SIBLING_GAP = 28;
// COUPLE_GAP matches SIBLING_GAP so the spacing between adjacent boxes is
// visually uniform across the row, whether the adjacency is a Couple Tie or
// a sibling drop.
export const COUPLE_GAP = 28;
export const ROW_GAP = 70;
export const ROW_H = BOX_H + ROW_GAP;
export const AVATAR_R = 22;
export const AVATAR_CX = 28;
export const SVG_HALF = 5000;
export const COUPLE_PITCH = BOX_W + COUPLE_GAP;
export const DRAG_THRESHOLD_PX = 4;
export const DEFAULT_FOCUS_ID = 3;

export function emptyLayout(): SubLayout {
  return { leftWidth: 0, rightWidth: 0, nodes: [], lines: [] };
}

export function linesOnly(lines: Line[]): SubLayout {
  return { leftWidth: 0, rightWidth: 0, nodes: [], lines };
}

export function bareBox(personId: number, y: number): SubLayout {
  return {
    leftWidth: BOX_W / 2,
    rightWidth: BOX_W / 2,
    nodes: [{ id: personId, x: 0, y }],
    lines: []
  };
}

export function shiftLayout(sub: SubLayout, dx: number): SubLayout {
  return {
    leftWidth: sub.leftWidth - dx,
    rightWidth: sub.rightWidth + dx,
    nodes: sub.nodes.map((n) => ({ ...n, x: n.x + dx })),
    lines: sub.lines.map((l) => ({
      key: l.key,
      x1: l.x1 + dx,
      y1: l.y1,
      x2: l.x2 + dx,
      y2: l.y2
    }))
  };
}

export function unionLayouts(parts: SubLayout[]): SubLayout {
  if (parts.length === 0) return emptyLayout();
  let leftWidth = 0;
  let rightWidth = 0;
  const nodes: PositionedPerson[] = [];
  const lines: Line[] = [];
  for (const p of parts) {
    leftWidth = Math.max(leftWidth, p.leftWidth);
    rightWidth = Math.max(rightWidth, p.rightWidth);
    nodes.push(...p.nodes);
    lines.push(...p.lines);
  }
  return { leftWidth, rightWidth, nodes, lines };
}

// Pack a list of sub-layouts left-to-right with a fixed gap; returns the X
// offset of each sub's pivot in the packed coord system, plus the total span.
export function packHorizontally(
  subs: SubLayout[],
  gap: number
): { offsets: number[]; totalWidth: number } {
  const offsets: number[] = [];
  let cursor = 0;
  for (const [i, sub] of subs.entries()) {
    if (i > 0) cursor += gap;
    cursor += sub.leftWidth;
    offsets.push(cursor);
    cursor += sub.rightWidth;
  }
  return { offsets, totalWidth: cursor };
}

// Horizontal sibling bar at busY (= y - ROW_H / 2) spanning min..max(childXs),
// plus a vertical leg from each childX down to box-top at y. Bar omitted for
// a lone child. Coordinate system is caller's — pass local Xs for layout-local
// composition, chart Xs for direct chart use.
export function barAndLegs(
  childXs: number[],
  childIds: number[],
  y: number,
  keyPrefix: string
): Line[] {
  if (childXs.length === 0) return [];
  const busY = y - ROW_H / 2;
  const lines: Line[] = [];
  if (childXs.length > 1) {
    let minX = childXs[0]!;
    let maxX = childXs[0]!;
    for (const cx of childXs) {
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
    }
    lines.push({
      key: `${keyPrefix}-bar`,
      x1: minX,
      y1: busY,
      x2: maxX,
      y2: busY
    });
  }
  for (const [i, cx] of childXs.entries()) {
    lines.push({
      key: `${keyPrefix}-leg-${childIds[i]}`,
      x1: cx,
      y1: busY,
      x2: cx,
      y2: y - BOX_H / 2
    });
  }
  return lines;
}

// Children of a Couple, in birth order, with bar + legs. Returned pivot =
// bar midpoint. Each child's sub-layout pivot must be the child's box X.
// When dropFromY is provided, a vertical drop is added from (0, dropFromY)
// down to the bar — used for half-sibships hanging from a non-Primary Child
// anchor (e.g. a step-parent's box bottom).
export function sibshipLayout(
  children: Array<{ id: number; sub: SubLayout }>,
  y: number,
  keyPrefix: string,
  dropFromY?: number
): SubLayout {
  if (children.length === 0) return emptyLayout();
  const subs = children.map((c) => c.sub);
  const packed = packHorizontally(subs, SIBLING_GAP);
  const centers = packed.offsets;
  const barMid = (centers[0]! + centers[centers.length - 1]!) / 2;
  const localXs = centers.map((c) => c - barMid);

  const nodes: PositionedPerson[] = [];
  const lines: Line[] = [];
  for (const [i, sub] of subs.entries()) {
    const dx = localXs[i]!;
    for (const n of sub.nodes) nodes.push({ ...n, x: n.x + dx });
    for (const l of sub.lines) {
      lines.push({
        key: l.key,
        x1: l.x1 + dx,
        y1: l.y1,
        x2: l.x2 + dx,
        y2: l.y2
      });
    }
  }

  const busY = y - ROW_H / 2;
  lines.push(
    ...barAndLegs(
      localXs,
      children.map((c) => c.id),
      y,
      keyPrefix
    )
  );

  if (dropFromY !== undefined) {
    lines.push({
      key: `${keyPrefix}-drop`,
      x1: 0,
      y1: dropFromY,
      x2: 0,
      y2: busY
    });
  }

  return {
    leftWidth: barMid,
    rightWidth: packed.totalWidth - barMid,
    nodes,
    lines
  };
}

// ============= Family helpers =============

export function otherSpouseOf(fam: FamilyRow, personId: number): number | null {
  if (fam.husband_id === personId) return fam.wife_id;
  if (fam.wife_id === personId) return fam.husband_id;
  return null;
}

export function isHusbandIn(fam: FamilyRow, personId: number): boolean {
  return fam.husband_id === personId;
}

export function presentChildren(fam: FamilyRow, ix: LayoutIndices): number[] {
  return fam.child_ids.filter((cid) => ix.persons.has(cid));
}
