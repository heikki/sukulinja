// See CONTEXT.md for the authoritative domain vocabulary.

import type { FamilyRow, PersonRow } from '@common/types';

export type { FamilyRow, PersonRow };

export interface LayoutIndices {
  persons: Map<number, PersonRow>;
  parentFamByPerson: Map<number, FamilyRow>;
  spouseFamsByPerson: Map<number, FamilyRow[]>;
  levels: number;
}

export interface Point {
  x: number;
  y: number;
}

export function translatePoint(p: Point, by: Point) {
  return { x: p.x + by.x, y: p.y + by.y };
}

export const BOX_W = 184;
export const BOX_H = 90;
export const SIBLING_GAP = 28;
// Match SIBLING_GAP for visually uniform spacing across the row.
export const COUPLE_GAP = 28;
export const ROW_GAP = 70;
export const ROW_H = BOX_H + ROW_GAP;
export const AVATAR_R = 22;
export const AVATAR_CX = 28;
export const SVG_HALF = 5000;
export const COUPLE_PITCH = BOX_W + COUPLE_GAP;
export const DRAG_THRESHOLD_PX = 4;
export const DEFAULT_FOCUS_ID = 3;
export const NONPRIMARY_TIE_Y_OFFSET = 6;

export function otherSpouseOf(fam: FamilyRow, personId: number) {
  if (fam.husband_id === personId) return fam.wife_id;
  if (fam.wife_id === personId) return fam.husband_id;
  return null;
}

export function isHusbandIn(fam: FamilyRow, personId: number) {
  return fam.husband_id === personId;
}

export function isPersonKnown(
  personId: number | null,
  ix: LayoutIndices
): personId is number {
  return personId !== null && ix.persons.has(personId);
}

export function presentChildren(fam: FamilyRow, ix: LayoutIndices) {
  return fam.child_ids.filter((cid) => ix.persons.has(cid));
}

export function isMeaningfulSpouseFam(
  fam: FamilyRow,
  personId: number,
  ix: LayoutIndices
) {
  return (
    presentChildren(fam, ix).length > 0 || otherSpouseOf(fam, personId) !== null
  );
}
