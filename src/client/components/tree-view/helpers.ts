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
