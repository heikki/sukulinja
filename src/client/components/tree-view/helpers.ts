import type { FamilyRow, PersonRow } from '@common/types';

export interface LayoutIndices {
  persons: Map<number, PersonRow>;
  parentFamByPerson: Map<number, FamilyRow>;
  spouseFamsByPerson: Map<number, FamilyRow[]>;
  levels: number;
  // Set by buildChart from actual ancestor depth; sizes the pyramid shift
  // so it doesn't reserve space for ancestors that don't exist.
  ancestorLevels?: number;
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

// Horizontal layout uses slot units. 1 slot = box width + one gap. Each
// PersonNode has a slot footprint of 1 slot wide, with implicit half-gap
// padding on each side; adjacent slots share their padding (the gap
// between adjacent boxes is half-padding from each neighbour). Build and
// nodes operate in literal slot values:
//   0    — at slot origin
//   0.5  — half-slot (= half-couple-pitch = half-person-footprint)
//   1    — one slot (= couple-pitch = full person footprint)
// The pixel values that turn slots into screen coordinates live with the
// box renderer (see EmitTheme); emit receives them at the seam.

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
