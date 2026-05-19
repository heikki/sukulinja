// Pure layout helpers and shared types for the tree-view component.
//
// See docs/tree-view.html for the domain vocabulary and
// docs/adr/0001-tree-view-layout-architecture.md for the load-bearing
// design decisions (Block-tree architecture, asymmetric sibship rule).

import type { FamilyRow, PersonRow } from '@common/types';

export type { FamilyRow, PersonRow };

// Indices passed to the recursive layout functions.
export interface LayoutIndices {
  persons: Map<number, PersonRow>;
  parentFamByPerson: Map<number, FamilyRow>;
  spouseFamsByPerson: Map<number, FamilyRow[]>;
  levels: number;
}

export interface Line {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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

// ============= Sibship packing =============

// Pack a list of items left-to-right with a fixed gap; returns the X offset
// of each item's pivot in the packed coord system, plus the total span.
// Items only need leftWidth + rightWidth — accepts any shape with those
// fields (Block instances or anonymous pack records).
export function packHorizontally(
  items: ReadonlyArray<{ leftWidth: number; rightWidth: number }>,
  gap: number
): { offsets: number[]; totalWidth: number } {
  const offsets: number[] = [];
  let cursor = 0;
  for (const [i, item] of items.entries()) {
    if (i > 0) cursor += gap;
    cursor += item.leftWidth;
    offsets.push(cursor);
    cursor += item.rightWidth;
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
