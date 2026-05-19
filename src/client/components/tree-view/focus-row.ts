// Focus row + descendants below + half-sibship columns from each parent's
// other marriages, expressed as a horizontal pack of Block-tree slots.
//
// Slot kinds, in pack order around Focus:
//   - 'bloodline': one of {Focus, full sibling}, rendered as a Block at row 0.
//     For Focus: a DescendantUnitBlock carrying the full descendant subtree.
//     For a sibling with a primary spouse: a FamilyBlock(sibling + spouse).
//     For a lone sibling: a PersonBlock.
//   - 'step-fam': step-parent + half-sibs as a FamilyBlock (one adult + kids)
//     placed at row -ROW_H so the step-parent lands at the parent row and
//     the half-sibs at the focus row. externalSpouseRef points to the
//     bloodline parent in the main FamilyBlock; the cross-Block Tie that
//     reaches across is drawn by layout.ts (see stepTies there).
//
// Slot order matches the old code: half-sib slots with iter index < B (the
// bloodline mainFam's index) go to the LEFT of bloodline siblings; iter
// index > B goes to the RIGHT. Within the bloodline group, full siblings
// keep birth order.
//
// Packing uses each slot Block's full leftWidth/rightWidth (not row-only),
// so each visible branch reserves its own horizontal column. After packing,
// the innermost half-sib slot on each side is pushed outward if it would
// overlap the parent-row Couple's footprint.

import { flattenBlock, PersonBlock } from './block';
import type { Block } from './block';
import { buildDescendantUnitBlock } from './block-descendant';
import { FamilyBlock } from './block-family';
import type { FamilyChildEntry } from './block-family';
import {
  barAndLegs,
  BOX_W,
  COUPLE_PITCH,
  isHusbandIn,
  otherSpouseOf,
  packHorizontally,
  presentChildren,
  ROW_H,
  SIBLING_GAP
} from './helpers';
import type {
  FamilyRow,
  LayoutIndices,
  Line,
  PositionedPerson,
  SubLayout
} from './helpers';

export interface StepFamPlacement {
  famId: number;
  side: 'mother' | 'father';
  // Step-parent box X in chart coords.
  stepX: number;
}

export interface FocusRowResult {
  sub: SubLayout;
  parentAnchorX: number | null;
  stepFams: StepFamPlacement[];
}

export interface LayoutFocusRowOpts {
  // Bloodline parent Couple's separation. Half-sib slots must clear the
  // parent Couple's parent-row footprint (anchorX ± sep/2 ± BOX_W/2);
  // zero when there's no bloodline Couple.
  sep: number;
}

interface BloodlineSlot {
  kind: 'bloodline';
  block: Block;
  siblingId: number;
  // X of the bloodline sibling within the slot Block's local frame (used to
  // compute chart-coord siblingX for the sibship bar).
  siblingX: number;
}

interface StepFamSlot {
  kind: 'step-fam';
  block: FamilyBlock;
  famId: number;
  side: 'mother' | 'father';
}

type RowSlot = BloodlineSlot | StepFamSlot;

interface HalfSibSpec {
  slot: StepFamSlot;
  // Iteration index in the bloodline parent's spouseFams, relative to that
  // parent's bloodline mainFam. Negative = left, positive = right.
  offset: number;
}

export function layoutFocusRow(
  focusId: number,
  ix: LayoutIndices,
  opts: LayoutFocusRowOpts
): FocusRowResult {
  const parentFam = ix.parentFamByPerson.get(focusId);

  const focusBlock = buildDescendantUnitBlock(focusId, 0, ix);
  const focusSlot: BloodlineSlot = {
    kind: 'bloodline',
    block: focusBlock,
    siblingId: focusId,
    siblingX: 0
  };

  const sibIds =
    parentFam === undefined ? [focusId] : presentChildren(parentFam, ix);
  const focusIdxInSibs = sibIds.indexOf(focusId);
  const haveSibship = parentFam !== undefined && focusIdxInSibs !== -1;

  const bloodlineSlots: BloodlineSlot[] = haveSibship
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
    ...bloodlineSlots,
    ...rightHalfSibs.map((s) => s.slot)
  ];
  const focusSlotIdx = leftHalfSibs.length + (haveSibship ? focusIdxInSibs : 0);

  // Pack using each slot's full Block width.
  const packSubs = slots.map((s) => ({
    leftWidth: s.block.leftWidth,
    rightWidth: s.block.rightWidth,
    nodes: [],
    lines: []
  }));
  const { offsets } = packHorizontally(packSubs, SIBLING_GAP);
  const focusOffset = offsets[focusSlotIdx]!;
  const baseShifts = offsets.map((o) => o - focusOffset);

  const slotShifts = clearParentShadow({
    slots,
    baseShifts,
    bloodlineFirstIdx: leftHalfSibs.length,
    bloodlineLastIdx: leftHalfSibs.length + bloodlineSlots.length - 1,
    sep: opts.sep
  });

  // Materialise each slot into chart-coord nodes + lines.
  const allNodes: PositionedPerson[] = [];
  const allLines: Line[] = [];
  let minSlotLeft = 0;
  let maxSlotRight = 0;
  const stepFams: StepFamPlacement[] = [];
  const siblingChartXs: number[] = [];
  const siblingIds: number[] = [];

  for (const [i, slot] of slots.entries()) {
    const slotX = slotShifts[i]!;
    const slotY = slot.kind === 'step-fam' ? -ROW_H : 0;
    const flat = flattenBlock(slot.block, slotX, slotY);
    allNodes.push(...flat.nodes);
    allLines.push(...flat.lines);
    minSlotLeft = Math.min(minSlotLeft, slotX - slot.block.leftWidth);
    maxSlotRight = Math.max(maxSlotRight, slotX + slot.block.rightWidth);

    if (slot.kind === 'bloodline') {
      siblingChartXs.push(slotX + slot.siblingX);
      siblingIds.push(slot.siblingId);
    } else {
      stepFams.push({ famId: slot.famId, side: slot.side, stepX: slotX });
    }
  }

  let parentAnchorX: number | null = null;
  if (haveSibship) {
    parentAnchorX = appendSibshipLines({
      lines: allLines,
      parentFam,
      siblingIds,
      siblingChartXs
    });
  }

  const sub: SubLayout = {
    leftWidth: -minSlotLeft,
    rightWidth: maxSlotRight,
    nodes: allNodes,
    lines: allLines
  };

  return { sub, parentAnchorX, stepFams };
}

// ============= Sibling slot builders =============

function buildSiblingSlot(siblingId: number, ix: LayoutIndices): BloodlineSlot {
  const fams = ix.spouseFamsByPerson.get(siblingId) ?? [];
  const primary = fams[0];
  const spouseId =
    primary === undefined ? null : otherSpouseOf(primary, siblingId);
  if (primary === undefined || spouseId === null || !ix.persons.has(spouseId)) {
    return {
      kind: 'bloodline',
      block: new PersonBlock(siblingId),
      siblingId,
      siblingX: 0
    };
  }
  const siblingOnLeft = isSiblingOnLeft(primary, siblingId, ix);
  const husbandId = siblingOnLeft ? siblingId : spouseId;
  const wifeId = siblingOnLeft ? spouseId : siblingId;
  const block = new FamilyBlock({
    famId: primary.id,
    husbandId,
    wifeId,
    childEntries: [],
    externalSpouseRef: null,
    sibKeyPrefix: 'fbar'
  });
  return {
    kind: 'bloodline',
    block,
    siblingId,
    siblingX: siblingOnLeft ? -COUPLE_PITCH / 2 : COUPLE_PITCH / 2
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

// ============= Step-fam slot collection =============

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
    const block = buildStepFamBlock(fam, bloodlineParentId, side, ix);
    if (block === null) continue;
    seenFamIds.add(fam.id);
    out.push({
      slot: { kind: 'step-fam', block, famId: fam.id, side },
      offset: i - bloodlineIdx
    });
  }
}

function buildStepFamBlock(
  fam: FamilyRow,
  bloodlineParentId: number,
  side: 'mother' | 'father',
  ix: LayoutIndices
): FamilyBlock | null {
  const stepId = otherSpouseOf(fam, bloodlineParentId);
  if (stepId === null || !ix.persons.has(stepId)) return null;
  const kids = presentChildren(fam, ix);
  if (kids.length === 0) return null;

  const stepIsHusband = isHusbandIn(fam, stepId);
  const husbandId = stepIsHusband ? stepId : null;
  const wifeId = stepIsHusband ? null : stepId;
  const childEntries: FamilyChildEntry[] = kids.map((cid) => ({
    id: cid,
    block: new PersonBlock(cid)
  }));

  return new FamilyBlock({
    famId: fam.id,
    husbandId,
    wifeId,
    childEntries,
    externalSpouseRef: { personId: bloodlineParentId, side },
    sibKeyPrefix: 'hsib'
  });
}

// ============= Parent-row shadow clearance =============

interface ClearParentShadowArgs {
  slots: RowSlot[];
  baseShifts: number[];
  bloodlineFirstIdx: number;
  bloodlineLastIdx: number;
  sep: number;
}

// Return baseShifts adjusted so half-sib slots clear the bloodline Couple's
// parent-row footprint. Innermost half-sib on each side gets pushed outward;
// same-side neighbours follow so SIBLING_GAP spacing is preserved.
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
      baseShifts[rightStartIdx]! - slots[rightStartIdx]!.block.leftWidth;
    rightDeficit = Math.max(0, anchorX + shadowHalfWidth - naturalLeftEdge);
  }

  let leftDeficit = 0;
  if (leftEndIdx >= 0) {
    const naturalRightEdge =
      baseShifts[leftEndIdx]! + slots[leftEndIdx]!.block.rightWidth;
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
  shifts: number[],
  firstIdx: number,
  lastIdx: number
): number {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (let i = firstIdx; i <= lastIdx; i += 1) {
    const s = slots[i]!;
    if (s.kind !== 'bloodline') continue;
    const sibX = shifts[i]! + s.siblingX;
    minX = Math.min(minX, sibX);
    maxX = Math.max(maxX, sibX);
  }
  return (minX + maxX) / 2;
}

// ============= Bloodline sibship bar + parent drop =============

interface AppendSibshipLinesArgs {
  lines: Line[];
  parentFam: FamilyRow;
  siblingIds: number[];
  siblingChartXs: number[];
}

function appendSibshipLines(args: AppendSibshipLinesArgs): number {
  const { lines, parentFam, siblingIds, siblingChartXs } = args;
  const busY = -ROW_H / 2;
  const minSibX = Math.min(...siblingChartXs);
  const maxSibX = Math.max(...siblingChartXs);
  const parentAnchorX = (minSibX + maxSibX) / 2;

  lines.push(
    ...barAndLegs(siblingChartXs, siblingIds, 0, `fsib-${parentFam.id}`)
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

