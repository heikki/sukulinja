// Descendant tree layout. One bloodline descendant + each of their spouses
// (multi-spouse fan, Husband-left), with children of each Couple hanging
// from that Couple's Child anchor (Tie mid for Primary, secondary spouse's
// box-bottom for non-Primary).
//
// Each spouse-fam is treated as a horizontal "slot" containing the spouse
// box + (optional) descendant sibship below. Slots fan outward from the
// bloodline person via a cursor that consumes each slot's width — so a
// multi-marriage descendant with wide sub-trees under spouse 2 won't have
// spouse 2 land on top of spouse 1's children. The "width" here is the
// recursive SubLayout's leftWidth / rightWidth, so the cursor sees the full
// reserved footprint of each fan slot, not just the spouse box.

import {
  bareBox,
  BOX_H,
  BOX_W,
  COUPLE_GAP,
  COUPLE_PITCH,
  isHusbandIn,
  linesOnly,
  otherSpouseOf,
  presentChildren,
  ROW_H,
  shiftLayout,
  sibshipLayout,
  unionLayouts
} from './helpers';
import type { FamilyRow, LayoutIndices, SubLayout } from './helpers';

// A descendant person + their spouses + their descendants as one SubLayout,
// with the row-level extent (Y = depth*ROW_H boxes only) reported separately
// so callers laying out laterals at the same row can reserve only the row
// width instead of the full subtree width.
export interface DescendantUnit {
  sub: SubLayout;
  rowLeftX: number;
  rowRightX: number;
}

// Spouses are rendered at every depth (including the gen limit) so a
// descendant's horizontal extent is the same whether they're being viewed as
// Focus or as a depth=N descendant of their parent. Otherwise toggling focus
// parent ↔ child would change the descendant's sub-layout width and the
// whole row would shift sideways. Only the recursion into the spouse's
// children is gated by the gen limit.
export function layoutDescendantUnit(
  personId: number,
  depth: number,
  ix: LayoutIndices
): DescendantUnit {
  const y = depth * ROW_H;
  const personBox = bareBox(personId, y);
  const fams = (ix.spouseFamsByPerson.get(personId) ?? []).filter(
    (f) => f.child_ids.length > 0 || otherSpouseOf(f, personId) !== null
  );
  if (fams.length === 0) {
    return { sub: personBox, rowLeftX: -BOX_W / 2, rowRightX: BOX_W / 2 };
  }

  const fanDir: 1 | -1 = personFanDir(personId, fams, ix);
  const includeChildren = depth < ix.levels;

  // Iterate spouseFams in REVERSE so the most-recent marriage (iter index
  // N-1 in the data) sits adjacent to the shared person, and the earliest
  // marriage (iter 0) fans furthest outward. This matches the iteration-
  // order rule applied at the parent row in focus-row.ts: in any view that
  // includes this person's spouse fan, husbands/wives appear left-to-right
  // in data-iteration order around the shared person.
  const orderedFams = [...fams].reverse();

  const parts: SubLayout[] = [personBox];
  // outerEdge: positive distance from bloodline (x=0) on the fanDir side
  // already consumed by the bloodline box + prior fan slots' full footprint.
  let outerEdge = BOX_W / 2;
  // rowOuterEdge: same as outerEdge but only counting Y=row spouse boxes,
  // not the descendant sibships below. Used to report row-level extent.
  let rowOuterEdge = BOX_W / 2;

  for (const [i, fam] of orderedFams.entries()) {
    const placement = placeDescendantFam({
      personId,
      fam,
      i,
      fanDir,
      depth,
      ix,
      includeChildren,
      outerEdge
    });
    parts.push(...placement.parts);
    outerEdge = placement.outerEdge;
    if (placement.spouseX !== null) {
      rowOuterEdge = Math.max(
        rowOuterEdge,
        Math.abs(placement.spouseX) + BOX_W / 2
      );
    }
  }

  const sub = unionLayouts(parts);
  return {
    sub,
    rowLeftX: fanDir === 1 ? -BOX_W / 2 : -rowOuterEdge,
    rowRightX: fanDir === 1 ? rowOuterEdge : BOX_W / 2
  };
}

export function layoutDescendantTree(
  personId: number,
  depth: number,
  ix: LayoutIndices
): SubLayout {
  return layoutDescendantUnit(personId, depth, ix).sub;
}

function personFanDir(
  personId: number,
  fams: FamilyRow[],
  ix: LayoutIndices
): 1 | -1 {
  if (fams.some((f) => isHusbandIn(f, personId))) return 1;
  if (ix.persons.get(personId)?.sex === 'M') return 1;
  return -1;
}

interface PlaceDescendantFamArgs {
  personId: number;
  fam: FamilyRow;
  i: number;
  fanDir: 1 | -1;
  depth: number;
  ix: LayoutIndices;
  includeChildren: boolean;
  outerEdge: number;
}

interface PlaceDescendantFamResult {
  parts: SubLayout[];
  outerEdge: number;
  spouseX: number | null;
}

function placeDescendantFam(
  args: PlaceDescendantFamArgs
): PlaceDescendantFamResult {
  const { personId, fam, i, fanDir, depth, ix, includeChildren, outerEdge } =
    args;
  const isPrimary = i === 0;
  const spouseId = otherSpouseOf(fam, personId);
  const sib = buildFamSib(fam, depth, ix, includeChildren);
  const slot = computeFamSlot({ sib, fanDir, isPrimary, outerEdge });

  const parts = assembleFamParts({
    fam,
    spouseId,
    sib,
    spouseX: slot.spouseX,
    anchorX: slot.anchorX,
    depth,
    fanDir,
    isPrimary,
    ix
  });
  const placedSpouseX =
    spouseId !== null && ix.persons.has(spouseId) ? slot.spouseX : null;
  return { parts, outerEdge: slot.newOuterEdge, spouseX: placedSpouseX };
}

interface FamSlotArgs {
  sib: SubLayout | null;
  fanDir: 1 | -1;
  isPrimary: boolean;
  outerEdge: number;
}

interface FamSlotPlacement {
  spouseX: number;
  anchorX: number;
  newOuterEdge: number;
}

function computeFamSlot(args: FamSlotArgs): FamSlotPlacement {
  const { sib, fanDir, isPrimary, outerEdge } = args;
  const sibInner = sibExtent(sib, fanDir, 'inner');
  const sibOuter = sibExtent(sib, fanDir, 'outer');
  if (isPrimary) {
    // Primary spouse sits adjacent at the canonical COUPLE_PITCH offset;
    // the primary descendant sibship hangs from the Tie midpoint and is
    // allowed to extend back toward bloodline on its inner side (there's
    // nothing at that row Y to collide with).
    const spouseX = fanDir * COUPLE_PITCH;
    const anchorX = spouseX / 2;
    const newOuterEdge = Math.max(
      Math.abs(spouseX) + BOX_W / 2,
      Math.abs(anchorX) + sibOuter
    );
    return { spouseX, anchorX, newOuterEdge };
  }
  // Non-primary spouse fans further outward so its (anchored under the
  // spouse box) sibship clears the prior fam's footprint.
  const inner = Math.max(BOX_W / 2, sibInner);
  const spouseDist = outerEdge + COUPLE_GAP + inner;
  const spouseX = fanDir * spouseDist;
  return {
    spouseX,
    anchorX: spouseX,
    newOuterEdge: spouseDist + Math.max(BOX_W / 2, sibOuter)
  };
}

function sibExtent(
  sib: SubLayout | null,
  fanDir: 1 | -1,
  side: 'inner' | 'outer'
): number {
  if (sib === null) return 0;
  const towardOuter = side === 'outer';
  // Outer (away from bloodline) is +X for fanDir=1, -X for fanDir=-1.
  // SubLayout exposes leftWidth (extent to -X) and rightWidth (extent to +X).
  const useRightWidth = fanDir === 1 ? towardOuter : !towardOuter;
  return useRightWidth ? sib.rightWidth : sib.leftWidth;
}

interface AssembleFamArgs {
  fam: FamilyRow;
  spouseId: number | null;
  sib: SubLayout | null;
  spouseX: number;
  anchorX: number;
  depth: number;
  fanDir: 1 | -1;
  isPrimary: boolean;
  ix: LayoutIndices;
}

function assembleFamParts(args: AssembleFamArgs): SubLayout[] {
  const { fam, spouseId, sib, spouseX, anchorX, depth, fanDir, isPrimary, ix } =
    args;
  const y = depth * ROW_H;
  const parts: SubLayout[] = [];
  if (spouseId !== null && ix.persons.has(spouseId)) {
    parts.push(shiftLayout(bareBox(spouseId, y), spouseX));
  }
  parts.push(buildTie({ fam, spouseX, y, fanDir, isPrimary }));
  if (sib !== null) {
    parts.push(shiftLayout(sib, anchorX));
    parts.push(buildSibDrop({ fam, anchorX, y, depth, isPrimary }));
  }
  return parts;
}

interface BuildTieArgs {
  fam: FamilyRow;
  spouseX: number;
  y: number;
  fanDir: 1 | -1;
  isPrimary: boolean;
}

function buildTie(args: BuildTieArgs): SubLayout {
  const { fam, spouseX, y, fanDir, isPrimary } = args;
  const tieY = isPrimary ? y : y - 6 * fanDir;
  const leftX = Math.min(0, spouseX);
  const rightX = Math.max(0, spouseX);
  return linesOnly([
    {
      key: `tie-${fam.id}`,
      x1: leftX + BOX_W / 2,
      y1: tieY,
      x2: rightX - BOX_W / 2,
      y2: tieY
    }
  ]);
}

interface BuildSibDropArgs {
  fam: FamilyRow;
  anchorX: number;
  y: number;
  depth: number;
  isPrimary: boolean;
}

function buildSibDrop(args: BuildSibDropArgs): SubLayout {
  const { fam, anchorX, y, depth, isPrimary } = args;
  const anchorY = isPrimary ? y : y + BOX_H / 2;
  const busY = (depth + 1) * ROW_H - ROW_H / 2;
  return linesOnly([
    {
      key: `ddrop-${fam.id}`,
      x1: anchorX,
      y1: anchorY,
      x2: anchorX,
      y2: busY
    }
  ]);
}

function buildFamSib(
  fam: FamilyRow,
  depth: number,
  ix: LayoutIndices,
  includeChildren: boolean
): SubLayout | null {
  if (!includeChildren) return null;
  const kids = presentChildren(fam, ix);
  if (kids.length === 0) return null;
  const children = kids.map((cid) => ({
    id: cid,
    sub: layoutDescendantTree(cid, depth + 1, ix)
  }));
  return sibshipLayout(children, (depth + 1) * ROW_H, `dsib-${fam.id}`);
}
