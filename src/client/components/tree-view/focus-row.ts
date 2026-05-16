// Focus row + descendants below + half-sibship columns from each parent's
// other marriages.
//
// The row is a single horizontal pack of "row slots". Each slot is one of:
//   - a bloodline-sibling slot (one per child of the focus's parent fam,
//     focus's slot also carries the spouse fan + descendant subtree),
//   - a half-sibship slot (one per non-mainFam in either bloodline parent's
//     spouseFams — kids of mother's other husbands or father's other wives,
//     packaged with the step-parent box at parent row so a single shift
//     positions both).
//
// Slot order follows the data's iteration order around the mainFam:
//   - Mother's spouseFams: any fam at iteration index < B (the bloodline
//     mainFam's index) contributes a slot to the LEFT of the bloodline
//     siblings; index > B contributes a slot to the RIGHT. Father's
//     spouseFams contribute symmetrically.
//   - Within the bloodline group, individual siblings keep birth order.
//
// Packing uses each slot's full sub.leftWidth/rightWidth (not row-only),
// so each visible branch reserves its own horizontal column — focus's
// descendant subtree, lateral siblings' primary-spouse pairs, and each
// half-sibship slot don't share X with one another.

import { layoutDescendantUnit } from './descendant';
import { buildStepFamSlot } from './half-sibships';
import {
  barAndLegs,
  bareBox,
  BOX_W,
  COUPLE_PITCH,
  isHusbandIn,
  linesOnly,
  otherSpouseOf,
  packHorizontally,
  presentChildren,
  ROW_H,
  shiftLayout,
  SIBLING_GAP,
  unionLayouts
} from './helpers';
import type { FamilyRow, LayoutIndices, Line, SubLayout } from './helpers';

interface BloodlineSiblingSlot {
  kind: 'bloodline-sibling';
  sub: SubLayout;
  // Row-level extents (Y=0 boxes only) within sub-local coords. Used as the
  // sibship bar's horizontal extent.
  rowLeftX: number;
  rowRightX: number;
  // The bloodline sibling person at this slot.
  siblingId: number;
  // X of the bloodline sibling's box within sub-local coords (offset from
  // slot pivot to the sibling box).
  siblingX: number;
}

interface HalfSibSlot {
  kind: 'half-sib';
  sub: SubLayout;
  // The non-mainFam fam this slot represents.
  famId: number;
  // Which bloodline parent owns the spouseFams this slot came from; tells
  // composeBloodlineParents which parent the step-spouse should Tie back to.
  side: 'mother' | 'father';
  // Step-parent box X within sub-local coords (always 0 — buildStepFamSlot
  // pivots both step-parent and half-sibship at slot-local 0).
}

type RowSlot = BloodlineSiblingSlot | HalfSibSlot;

export interface StepFamPlacement {
  famId: number;
  side: 'mother' | 'father';
  // Step-parent box X in chart coords (also the half-sib slot pivot).
  stepX: number;
}

export interface FocusRowResult {
  sub: SubLayout;
  parentAnchorX: number | null;
  stepFams: StepFamPlacement[];
}

export interface LayoutFocusRowOpts {
  // Bloodline parent Couple's separation (from coupleSeparation). The
  // parent-row Couple's full footprint at y=-ROW_H spans anchorX ± sep/2 ±
  // BOX_W/2; half-sibship slots must clear that footprint (otherwise a
  // step-parent box at parent row would overlap a bloodline parent box).
  // Zero when there's no bloodline Couple (single-parent / orphan focus).
  sep: number;
}

export function layoutFocusRow(
  focusId: number,
  ix: LayoutIndices,
  opts: LayoutFocusRowOpts
): FocusRowResult {
  const parentFam = ix.parentFamByPerson.get(focusId);
  const focusUnit = layoutDescendantUnit(focusId, 0, ix);
  const focusSlot: BloodlineSiblingSlot = {
    kind: 'bloodline-sibling',
    sub: focusUnit.sub,
    rowLeftX: focusUnit.rowLeftX,
    rowRightX: focusUnit.rowRightX,
    siblingId: focusId,
    siblingX: 0
  };

  const sibIds =
    parentFam === undefined ? [focusId] : presentChildren(parentFam, ix);
  const focusIdxInSibs = sibIds.indexOf(focusId);
  const haveSibship = parentFam !== undefined && focusIdxInSibs !== -1;

  const bloodlineSibSlots: BloodlineSiblingSlot[] = haveSibship
    ? sibIds.map((sid, i) =>
        i === focusIdxInSibs ? focusSlot : buildSiblingSlot(sid, ix)
      )
    : [focusSlot];

  const halfSibSpecs = collectHalfSibSlots(parentFam, ix);

  const leftHalfSibs = halfSibSpecs
    .filter((s) => s.offset < 0)
    .sort((a, b) => a.offset - b.offset);
  const rightHalfSibs = halfSibSpecs
    .filter((s) => s.offset > 0)
    .sort((a, b) => a.offset - b.offset);

  const slots: RowSlot[] = [
    ...leftHalfSibs.map((s) => s.slot),
    ...bloodlineSibSlots,
    ...rightHalfSibs.map((s) => s.slot)
  ];

  const focusSlotIdx = leftHalfSibs.length + (haveSibship ? focusIdxInSibs : 0);

  // Pack using each slot's full sub.leftWidth/rightWidth — reserves the slot's
  // full column (including descendants under focus, the spouse fan of paired
  // siblings, and the half-sibship's row-0 spread).
  const packSubs = slots.map((s) => ({
    leftWidth: s.sub.leftWidth,
    rightWidth: s.sub.rightWidth,
    nodes: [],
    lines: []
  }));
  const { offsets } = packHorizontally(packSubs, SIBLING_GAP);
  const focusOffset = offsets[focusSlotIdx]!;
  const baseShifts = offsets.map((o) => o - focusOffset);

  // Apply parent-row shadow: half-sib slots on either side of the bloodline
  // group must clear the bloodline Couple's parent-row footprint (anchorX ±
  // sep/2 ± BOX_W/2), otherwise the step-parent box at parent row would
  // overlap a bloodline parent box. Push the innermost half-sib on each side
  // outward by the deficit; subsequent same-side slots get the same shift
  // so SIBLING_GAP spacing between them is preserved.
  const slotShifts = clearParentShadow({
    slots,
    baseShifts,
    bloodlineFirstIdx: leftHalfSibs.length,
    bloodlineLastIdx: leftHalfSibs.length + bloodlineSibSlots.length - 1,
    sep: opts.sep
  });

  const placed = slots.map((s, i) => shiftLayout(s.sub, slotShifts[i]!));

  const siblingXs: number[] = [];
  const bloodlineSibSlotIndices: number[] = [];
  const stepFams: StepFamPlacement[] = [];
  for (const [i, s] of slots.entries()) {
    if (s.kind === 'bloodline-sibling') {
      siblingXs.push(slotShifts[i]! + s.siblingX);
      bloodlineSibSlotIndices.push(i);
    } else {
      stepFams.push({ famId: s.famId, side: s.side, stepX: slotShifts[i]! });
    }
  }

  let parentAnchorX: number | null = null;
  const lines: Line[] = [];
  if (haveSibship) {
    const bloodlineSlotsOnly = bloodlineSibSlotIndices.map(
      (i) => slots[i]!
    ) as BloodlineSiblingSlot[];
    parentAnchorX = sibshipLines({
      lines,
      parentFam,
      slots: bloodlineSlotsOnly,
      siblingXs
    });
  }

  const layout = unionLayouts([...placed, linesOnly(lines)]);

  return {
    sub: layout,
    parentAnchorX,
    stepFams
  };
}

interface HalfSibSpec {
  slot: HalfSibSlot;
  // Iteration index relative to bloodline-mainFam's index in the same parent's
  // spouseFams. Negative → place on left of bloodline; positive → place on
  // right.
  offset: number;
}

function collectHalfSibSlots(
  parentFam: FamilyRow | undefined,
  ix: LayoutIndices
): HalfSibSpec[] {
  if (parentFam === undefined) return [];
  const seenFamIds = new Set<number>([parentFam.id]);
  const specs: HalfSibSpec[] = [];

  if (parentFam.wife_id !== null) {
    collectFromParent({
      fams: ix.spouseFamsByPerson.get(parentFam.wife_id) ?? [],
      mainFamId: parentFam.id,
      bloodlineParentId: parentFam.wife_id,
      side: 'mother',
      ix,
      seenFamIds,
      out: specs
    });
  }

  if (parentFam.husband_id !== null) {
    collectFromParent({
      fams: ix.spouseFamsByPerson.get(parentFam.husband_id) ?? [],
      mainFamId: parentFam.id,
      bloodlineParentId: parentFam.husband_id,
      side: 'father',
      ix,
      seenFamIds,
      out: specs
    });
  }

  return specs;
}

interface ClearParentShadowArgs {
  slots: RowSlot[];
  baseShifts: number[];
  bloodlineFirstIdx: number;
  bloodlineLastIdx: number;
  sep: number;
}

// Return baseShifts adjusted so half-sib slots clear the bloodline Couple's
// parent-row footprint. The innermost half-sib on each side is pushed outward
// by the deficit between its natural edge and the required edge; same-side
// neighbours follow the same shift so SIBLING_GAP spacing is preserved.
function clearParentShadow(args: ClearParentShadowArgs): number[] {
  const { slots, baseShifts, bloodlineFirstIdx, bloodlineLastIdx, sep } = args;
  if (sep === 0 || bloodlineLastIdx < bloodlineFirstIdx) return baseShifts;

  const anchorX = bloodlineMidpoint(
    slots,
    baseShifts,
    bloodlineFirstIdx,
    bloodlineLastIdx
  );
  const rightStartIdx = bloodlineLastIdx + 1;
  const leftEndIdx = bloodlineFirstIdx - 1;
  const shadowHalfWidth = sep / 2 + BOX_W / 2 + SIBLING_GAP;

  let rightDeficit = 0;
  if (rightStartIdx < slots.length) {
    const naturalLeftEdge =
      baseShifts[rightStartIdx]! - slots[rightStartIdx]!.sub.leftWidth;
    rightDeficit = Math.max(0, anchorX + shadowHalfWidth - naturalLeftEdge);
  }

  let leftDeficit = 0;
  if (leftEndIdx >= 0) {
    const naturalRightEdge =
      baseShifts[leftEndIdx]! + slots[leftEndIdx]!.sub.rightWidth;
    leftDeficit = Math.max(0, naturalRightEdge - (anchorX - shadowHalfWidth));
  }

  if (rightDeficit === 0 && leftDeficit === 0) return baseShifts;

  return baseShifts.map((shift, i) => {
    if (i >= rightStartIdx) return shift + rightDeficit;
    if (i <= leftEndIdx) return shift - leftDeficit;
    return shift;
  });
}

function bloodlineMidpoint(
  slots: RowSlot[],
  slotShifts: number[],
  firstIdx: number,
  lastIdx: number
): number {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (let i = firstIdx; i <= lastIdx; i += 1) {
    const s = slots[i]!;
    if (s.kind !== 'bloodline-sibling') continue;
    const sibX = slotShifts[i]! + s.siblingX;
    minX = Math.min(minX, sibX);
    maxX = Math.max(maxX, sibX);
  }
  return (minX + maxX) / 2;
}

interface CollectFromParentArgs {
  fams: FamilyRow[];
  mainFamId: number;
  bloodlineParentId: number;
  side: 'mother' | 'father';
  ix: LayoutIndices;
  seenFamIds: Set<number>;
  out: HalfSibSpec[];
}

function collectFromParent(args: CollectFromParentArgs): void {
  const { fams, mainFamId, bloodlineParentId, side, ix, seenFamIds, out } =
    args;
  const bloodlineIdx = fams.findIndex((f) => f.id === mainFamId);
  if (bloodlineIdx === -1) return;
  for (let i = 0; i < fams.length; i += 1) {
    const fam = fams[i]!;
    if (seenFamIds.has(fam.id)) continue;
    const slot = buildHalfSibRowSlot(fam, bloodlineParentId, side, ix);
    if (slot === null) continue;
    seenFamIds.add(fam.id);
    out.push({ slot, offset: i - bloodlineIdx });
  }
}

function buildHalfSibRowSlot(
  fam: FamilyRow,
  bloodlineParentId: number,
  side: 'mother' | 'father',
  ix: LayoutIndices
): HalfSibSlot | null {
  const stepId = otherSpouseOf(fam, bloodlineParentId);
  if (stepId === null || !ix.persons.has(stepId)) return null;
  if (presentChildren(fam, ix).length === 0) return null;
  const sub = buildStepFamSlot(fam, stepId, ix);
  return { kind: 'half-sib', sub, famId: fam.id, side };
}

function buildSiblingSlot(
  siblingId: number,
  ix: LayoutIndices
): BloodlineSiblingSlot {
  const fams = ix.spouseFamsByPerson.get(siblingId) ?? [];
  const primary = fams[0];
  const spouseId =
    primary === undefined ? null : otherSpouseOf(primary, siblingId);
  if (primary === undefined || spouseId === null || !ix.persons.has(spouseId)) {
    return {
      kind: 'bloodline-sibling',
      sub: bareBox(siblingId, 0),
      rowLeftX: -BOX_W / 2,
      rowRightX: BOX_W / 2,
      siblingId,
      siblingX: 0
    };
  }
  // Husband-left convention: sibling sits on the left if husband in this
  // fam, on the right if wife. Sex falls back when the fam doesn't assign
  // either role (legacy / malformed records).
  const siblingOnLeft = isSiblingOnLeft(primary, siblingId, ix);
  const siblingOffset = siblingOnLeft ? -COUPLE_PITCH / 2 : COUPLE_PITCH / 2;
  const spouseOffset = -siblingOffset;
  const tie: Line = {
    key: `tie-${primary.id}`,
    x1: -COUPLE_PITCH / 2 + BOX_W / 2,
    y1: 0,
    x2: COUPLE_PITCH / 2 - BOX_W / 2,
    y2: 0
  };
  const sub = unionLayouts([
    shiftLayout(bareBox(siblingId, 0), siblingOffset),
    shiftLayout(bareBox(spouseId, 0), spouseOffset),
    linesOnly([tie])
  ]);
  return {
    kind: 'bloodline-sibling',
    sub,
    rowLeftX: -COUPLE_PITCH / 2 - BOX_W / 2,
    rowRightX: COUPLE_PITCH / 2 + BOX_W / 2,
    siblingId,
    siblingX: siblingOffset
  };
}

function isSiblingOnLeft(
  primary: FamilyRow,
  siblingId: number,
  ix: LayoutIndices
): boolean {
  if (isHusbandIn(primary, siblingId)) return true;
  if (primary.wife_id === siblingId) return false;
  return ix.persons.get(siblingId)?.sex === 'M';
}

interface SibshipLinesArgs {
  lines: Line[];
  parentFam: FamilyRow;
  slots: BloodlineSiblingSlot[];
  siblingXs: number[];
}

function sibshipLines(args: SibshipLinesArgs): number {
  const { lines, parentFam, slots, siblingXs } = args;
  const busY = -ROW_H / 2;
  const minSibX = Math.min(...siblingXs);
  const maxSibX = Math.max(...siblingXs);
  const parentAnchorX = (minSibX + maxSibX) / 2;

  lines.push(
    ...barAndLegs(
      siblingXs,
      slots.map((s) => s.siblingId),
      0,
      `fsib-${parentFam.id}`
    )
  );
  lines.push({
    key: `fpdrop-${parentFam.id}`,
    x1: parentAnchorX,
    y1: -ROW_H,
    x2: parentAnchorX,
    y2: busY
  });
  return parentAnchorX;
}
