import type { FamilyRow, PersonRow } from '@common/types';

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

export interface Extents {
  left: number;
  right: number;
}

// Horizontal units: slot. 1 slot = COUPLE_PITCH_PX = BOX_W_PX + GAP_PX in
// pixels. Each PersonNode has a slot footprint of 1 slot wide, with
// implicit half-gap padding on each side; adjacent slots share their
// padding (the gap between adjacent boxes is a full gap = half-padding
// from each neighbouring slot). Build and nodes never reference pixel
// gap values; emit multiplies slot positions by PITCH_PX at the seam and
// applies BOX_W_PX for tie-endpoint box-edge clipping.
export const BOX_W = 1;
export const COUPLE_PITCH = 1;
export const HALF_PITCH = 0.5;
// Extents of a bare PersonNode (no children) — used when packing reserves
// a slot for a person whose PersonNode lives elsewhere.
export const BARE_PERSON_EXTENTS: Extents = { left: 0.5, right: 0.5 };

// Pixel constants — used by emit (and external renderers).
export const BOX_W_PX = 184;
export const PITCH_PX = 212;

// Vertical — pixels.
export const BOX_H = 90;
const ROW_GAP = 70;
export const ROW_PITCH = BOX_H + ROW_GAP;
export const NONPRIMARY_TIE_Y_OFFSET = 6;

export const AVATAR_R = 22;
export const AVATAR_CX = 28;
export const SVG_HALF = 5000;
export const DRAG_THRESHOLD_PX = 4;
export const DEFAULT_FOCUS_ID = 1;

export function otherSpouseOf(fam: FamilyRow, personId: number) {
  if (fam.husband_id === personId) return fam.wife_id;
  if (fam.wife_id === personId) return fam.husband_id;
  return null;
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
