// Top-down builders for the block-tree layout.
//
// Two-pass orchestration for the chart-root parent FB:
//   Pass 1 — build bloodline kid PBs (focus + siblings) and pack them.
//   Pass 2 — build Fa.PB / Mo.PB with step-fam FBs sized to clear the
//            bloodline kid row's chart extents.

import type { Block } from './block';
import { FamilyBlock } from './block-family';
import type {
  AdultPlacement,
  FamilyBlockSpec,
  KidPlacement
} from './block-family';
import { PersonBlock } from './block-person';
import {
  computeFBExtents,
  kidXsFromPacked,
  packBlocks,
  type PackedBlocks
} from './build-marriages';
import { buildFocusPersonBlock, buildSiblingPersonBlock } from './build-owned';
import {
  buildAncestorPBWithStepFams,
  measureStepFamsExtent
} from './build-step-fams';
import {
  BOX_H,
  BOX_W,
  COUPLE_PITCH,
  isPersonKnown,
  presentChildren,
  ROW_H
} from './helpers';
import type { FamilyRow, LayoutIndices } from './helpers';

export function buildChartRoot(
  focusId: number,
  ix: LayoutIndices
): Block | null {
  if (!ix.persons.has(focusId)) return null;
  const parentFam = ix.parentFamByPerson.get(focusId);
  if (parentFam !== undefined && ix.levels >= 1) {
    const block = buildParentFamilyBlock(focusId, parentFam, ix);
    if (block !== null) return block;
  }
  return buildFocusPersonBlock(focusId, ix);
}

// `ancestorChartX` is the chart-X of the bloodline ancestor whose childhood
// FB we're building. The drop from the GGP couple's Tie to the sibship
// bar is always vertical; the Tie's X depends on depth (see
// `buildChildhoodFamily`). Top-level callers pass -HALF_PITCH for Fa and
// +HALF_PITCH for Mo (Fa and Mo's own chart-X relative to focus = 0).
const HALF_PITCH = COUPLE_PITCH / 2;

function ancestorPBOrNull(
  parentId: number | null,
  depth: number,
  ancestorChartX: number,
  ix: LayoutIndices
): PersonBlock | null {
  if (!isPersonKnown(parentId, ix)) return null;
  return buildPlainAncestorPB(parentId, depth, ancestorChartX, ix);
}

interface BuildChildhoodArgs {
  personId: number;
  currentDepth: number;
  ancestorChartX: number;
  stepFamSpacer?: number;
  ix: LayoutIndices;
}

function buildChildhoodFamily(args: BuildChildhoodArgs): FamilyBlock | null {
  const { personId, currentDepth, ancestorChartX, ix } = args;
  const stepFamSpacer = args.stepFamSpacer ?? 0;
  if (currentDepth >= ix.levels) return null;
  const fam = ix.parentFamByPerson.get(personId);
  if (fam === undefined) return null;
  const parentDepth = currentDepth + 1;
  const kids = childhoodFBKids({
    bloodlineId: personId,
    fam,
    currentDepth,
    ancestorChartX,
    stepFamSpacer,
    ix
  });
  // Tie sits off the bloodline kid's column in the direction of the
  // ancestor's sex (male's parents fan left, female's right). Same rule
  // at every depth — the bar reaches out to whichever kid is farthest.
  // Magnitude scales with remaining levels above (ADR-0001).
  const tieXFBlocal = tieXForFB(personId, currentDepth, ix);
  const husbandChartX = ancestorChartX + tieXFBlocal - HALF_PITCH;
  const wifeChartX = ancestorChartX + tieXFBlocal + HALF_PITCH;
  const husbandPB = ancestorPBOrNull(
    fam.husband_id,
    parentDepth,
    husbandChartX,
    ix
  );
  const wifePB = ancestorPBOrNull(fam.wife_id, parentDepth, wifeChartX, ix);
  if (husbandPB === null && wifePB === null) return null;

  const couple = layoutInternalCouple(husbandPB, wifePB, fam, tieXFBlocal);
  const extents = computeFBExtents({
    husband: couple.husband,
    wife: couple.wife,
    kids
  });
  const spec: FamilyBlockSpec = {
    famId: fam.id,
    husband: couple.husband,
    wife: couple.wife,
    kids,
    adultY: 0,
    kidY: ROW_H,
    tieY: couple.tieY,
    childAnchorX: couple.childAnchorX,
    childAnchorY: couple.childAnchorY,
    leftWidth: extents.leftWidth,
    rightWidth: extents.rightWidth
  };
  return new FamilyBlock(spec);
}

function buildPlainAncestorPB(
  personId: number,
  depth: number,
  ancestorChartX: number,
  ix: LayoutIndices
): PersonBlock {
  const childhood = buildChildhoodFamily({
    personId,
    currentDepth: depth,
    ancestorChartX,
    ix
  });
  return new PersonBlock(personId, childhood, [], null);
}

function tieXForFB(
  personId: number,
  currentDepth: number,
  ix: LayoutIndices
): number {
  // Ancestor couples land as close to chart center as the inter-couple
  // spacing allows; the bar/legs reach out to whichever kids are farther.
  // Shift magnitude follows (2^remainingAbove − 1) × HALF_PITCH so deeper
  // pyramids still get exponentially more room at higher gens.
  const remainingAbove = Math.max(1, ix.levels - currentDepth);
  const directional = HALF_PITCH * (2 ** remainingAbove - 1);
  const sex = ix.persons.get(personId)?.sex;
  return sex === 'F' ? directional : -directional;
}

// Bloodline kid sits at FB-local 0 (the PB anchor). At depth 1, Aunts/Uncles
// share the sibship with the bloodline kid, fanning outward in birth order
// (left for Fa branch, right for Mo branch); the bloodline kid sits at the
// inward end. Aunts/Uncles are bare PBs — their own children, marriages,
// and ancestry are out of rendering scope (CONTEXT.md, ADR-0002). At
// depth ≥ 2 the sibship is bloodline-only.
interface ChildhoodFBKidsArgs {
  bloodlineId: number;
  fam: FamilyRow;
  currentDepth: number;
  ancestorChartX: number;
  stepFamSpacer?: number;
  ix: LayoutIndices;
}

function childhoodFBKids(args: ChildhoodFBKidsArgs): KidPlacement[] {
  const { bloodlineId, fam, currentDepth, ancestorChartX, stepFamSpacer, ix } =
    args;
  const bloodlinePlacement: KidPlacement = {
    id: bloodlineId,
    external: true,
    x: 0,
    block: null
  };
  if (currentDepth !== 1) return [bloodlinePlacement];
  const sibIds = presentChildren(fam, ix);
  const auntIds = sibIds.filter((sid) => sid !== bloodlineId);
  if (auntIds.length === 0) return [bloodlinePlacement];

  const auntPBs = auntIds.map((sid) => new PersonBlock(sid, null, [], null));
  const fanLeft = ancestorChartX < 0;
  // packBlocks needs the bloodline kid's width too — its box (rendered by
  // the parent FB above) still occupies a column in the sibship row. Use a
  // throwaway PB to participate in packing; the real placement is `external`
  // with no block.
  const bloodlineDummy = new PersonBlock(bloodlineId, null, [], null);
  const orderedBlocks = fanLeft
    ? [...auntPBs, bloodlineDummy]
    : [bloodlineDummy, ...auntPBs];
  const packed = packBlocks(orderedBlocks);
  const bloodlineIdx = fanLeft ? orderedBlocks.length - 1 : 0;
  const shift = -packed.positions[bloodlineIdx]!;
  // Push Aunts/Uncles past the step-fam reservation + focus row extent
  // so step-spouses + half-siblings fit between the bloodline parent and
  // the Aunts/Uncles in chart-X space.
  const auntShift = (stepFamSpacer ?? 0) * (fanLeft ? -1 : 1);

  return orderedBlocks.map((blk, i) => {
    if (i === bloodlineIdx) return bloodlinePlacement;
    return {
      id: blk.personId,
      external: false,
      x: packed.positions[i]! + shift + auntShift,
      block: blk
    };
  });
}

function buildParentFamilyBlock(
  focusId: number,
  parentFam: FamilyRow,
  ix: LayoutIndices
): FamilyBlock | null {
  const sibIds = presentChildren(parentFam, ix);
  if (parentFam.husband_id === null && parentFam.wife_id === null) {
    if (sibIds.length === 0) return null;
  }
  // Build focus sibship first so we know its chart extent, then size
  // step-fam reservations and Aunts/Uncles spacers based on that extent
  // — Aunts/Uncles get pushed past the focus sibship AND the step-fams
  // (see CONTEXT.md "Step-fam fan", ADR-0001).
  const kidPBs = sibIds.map((sid) =>
    sid === focusId
      ? buildFocusPersonBlock(sid, ix)
      : buildSiblingPersonBlock(sid, ix)
  );
  const packed = packBlocks(kidPBs);
  const ctx = parentChartContextBase({
    parentFam,
    kidPBs,
    packed,
    sibIds,
    focusId,
    ix
  });
  const faSpacer = computeAuntShift({
    parentId: parentFam.husband_id,
    bloodlineFamId: parentFam.id,
    parentChartX: ctx.faChartX,
    bloodlineEdge: ctx.bloodlineLeftChart,
    side: 'left',
    ix
  });
  const moSpacer = computeAuntShift({
    parentId: parentFam.wife_id,
    bloodlineFamId: parentFam.id,
    parentChartX: ctx.moChartX,
    bloodlineEdge: ctx.bloodlineRightChart,
    side: 'right',
    ix
  });
  const faChildhood = childhoodForParent(
    parentFam.husband_id,
    -HALF_PITCH,
    faSpacer,
    ix
  );
  const moChildhood = childhoodForParent(
    parentFam.wife_id,
    HALF_PITCH,
    moSpacer,
    ix
  );
  const faPB = parentPB({
    personId: parentFam.husband_id,
    childhood: faChildhood,
    parentFam,
    parentChartX: ctx.faChartX,
    side: 'left',
    bloodlineLeftChart: ctx.bloodlineLeftChart,
    bloodlineRightChart: ctx.bloodlineRightChart,
    ix
  });
  const moPB = parentPB({
    personId: parentFam.wife_id,
    childhood: moChildhood,
    parentFam,
    parentChartX: ctx.moChartX,
    side: 'right',
    bloodlineLeftChart: ctx.bloodlineLeftChart,
    bloodlineRightChart: ctx.bloodlineRightChart,
    ix
  });
  return assembleParentFB({ parentFam, faPB, moPB, kidPBs, packed, sibIds });
}

interface ParentPBArgs {
  personId: number | null;
  childhood: FamilyBlock | null;
  parentFam: FamilyRow;
  parentChartX: number;
  side: 'left' | 'right';
  bloodlineLeftChart: number;
  bloodlineRightChart: number;
  ix: LayoutIndices;
}

function parentPB(args: ParentPBArgs): PersonBlock | null {
  if (!isPersonKnown(args.personId, args.ix)) return null;
  return buildAncestorPBWithStepFams({
    personId: args.personId,
    childhoodFamily: args.childhood,
    bloodlineFamId: args.parentFam.id,
    parentChartX: args.parentChartX,
    side: args.side,
    bloodlineLeftChart: args.bloodlineLeftChart,
    bloodlineRightChart: args.bloodlineRightChart,
    ix: args.ix
  });
}

function childhoodForParent(
  parentId: number | null,
  ancestorChartX: number,
  stepFamSpacer: number,
  ix: LayoutIndices
): FamilyBlock | null {
  if (!isPersonKnown(parentId, ix)) return null;
  return buildChildhoodFamily({
    personId: parentId,
    currentDepth: 1,
    ancestorChartX,
    stepFamSpacer,
    ix
  });
}

interface AuntShiftArgs {
  parentId: number | null;
  bloodlineFamId: number;
  parentChartX: number;
  bloodlineEdge: number;
  side: 'left' | 'right';
  ix: LayoutIndices;
}

function computeAuntShift(args: AuntShiftArgs): number {
  if (!isPersonKnown(args.parentId, args.ix)) return 0;
  const stepFams = measureStepFamsExtent(
    args.parentId,
    args.bloodlineFamId,
    args.ix
  );
  // Aunts/Uncles must clear:
  //   (1) the distance from the parent's box edge out to the focus sibship
  //       edge (the bloodline footprint extension past Fa/Mo's own box), plus
  //   (2) the step-fam reservation, which gets placed past that edge.
  const parentBoxEdge =
    args.side === 'left'
      ? args.parentChartX - BOX_W / 2
      : args.parentChartX + BOX_W / 2;
  const extentPastBox =
    args.side === 'left'
      ? Math.max(0, parentBoxEdge - args.bloodlineEdge)
      : Math.max(0, args.bloodlineEdge - parentBoxEdge);
  return extentPastBox + stepFams;
}

interface ParentContextArgs {
  parentFam: FamilyRow;
  kidPBs: PersonBlock[];
  packed: PackedBlocks;
  sibIds: number[];
  focusId: number;
  ix: LayoutIndices;
}

interface ParentChartContext {
  faChartX: number;
  moChartX: number;
  bloodlineLeftChart: number;
  bloodlineRightChart: number;
}

function computeParentSep(args: ParentContextArgs): number {
  const faPresent = isPersonKnown(args.parentFam.husband_id, args.ix);
  const moPresent = isPersonKnown(args.parentFam.wife_id, args.ix);
  if (!faPresent || !moPresent) return 0;
  return COUPLE_PITCH;
}

// Bloodline footprint = union of focus's kid-row extent and Fa/Mo's own
// boxes at the parent row (NOT Aunts/Uncles, which get pushed past the
// step-fams via the spacer).
function parentChartContextBase(args: ParentContextArgs): ParentChartContext {
  const sep = computeParentSep(args);
  const focusIdx = args.sibIds.indexOf(args.focusId);
  const focusLocalX =
    focusIdx === -1 || args.kidPBs.length === 0
      ? 0
      : args.packed.positions[focusIdx]! - args.packed.barMid;
  const parentOffsetX = -focusLocalX;
  const faChartX = parentOffsetX + (sep > 0 ? -sep / 2 : 0);
  const moChartX = parentOffsetX + (sep > 0 ? sep / 2 : 0);
  const kidRowLeft =
    args.kidPBs.length === 0 ? -BOX_W / 2 : parentOffsetX - args.packed.barMid;
  const kidRowRight =
    args.kidPBs.length === 0
      ? BOX_W / 2
      : parentOffsetX + (args.packed.totalWidth - args.packed.barMid);
  const parentRowLeft =
    args.parentFam.husband_id === null ? Infinity : faChartX - BOX_W / 2;
  const parentRowRight =
    args.parentFam.wife_id === null ? -Infinity : moChartX + BOX_W / 2;
  return {
    faChartX,
    moChartX,
    bloodlineLeftChart: Math.min(kidRowLeft, parentRowLeft),
    bloodlineRightChart: Math.max(kidRowRight, parentRowRight)
  };
}

interface AssembleParentArgs {
  parentFam: FamilyRow;
  faPB: PersonBlock | null;
  moPB: PersonBlock | null;
  kidPBs: PersonBlock[];
  packed: PackedBlocks;
  sibIds: number[];
}

function assembleParentFB(args: AssembleParentArgs): FamilyBlock {
  const { parentFam, faPB, moPB, kidPBs, packed, sibIds } = args;
  const couple = layoutInternalCouple(faPB, moPB, parentFam);
  const kidXs = kidXsFromPacked(packed, couple.childAnchorX);
  const kids: KidPlacement[] = sibIds.map((sid, i) => ({
    id: sid,
    external: false,
    x: kidXs[i]!,
    block: kidPBs[i]!
  }));
  const extents = computeFBExtents({
    husband: couple.husband,
    wife: couple.wife,
    kids
  });
  const spec: FamilyBlockSpec = {
    famId: parentFam.id,
    husband: couple.husband,
    wife: couple.wife,
    kids,
    adultY: 0,
    kidY: ROW_H,
    tieY: couple.tieY,
    childAnchorX: couple.childAnchorX,
    childAnchorY: couple.childAnchorY,
    leftWidth: extents.leftWidth,
    rightWidth: extents.rightWidth
  };
  return new FamilyBlock(spec);
}

interface InternalCoupleLayout {
  husband: AdultPlacement | null;
  wife: AdultPlacement | null;
  childAnchorX: number;
  childAnchorY: number;
  tieY: number;
}

function layoutInternalCouple(
  husbandPB: PersonBlock | null,
  wifePB: PersonBlock | null,
  fam: FamilyRow,
  tieXFBlocal = 0
): InternalCoupleLayout {
  if (husbandPB !== null && wifePB !== null) {
    return couplePlacement(husbandPB, wifePB, fam, tieXFBlocal);
  }
  if (husbandPB !== null) {
    return {
      husband: { id: fam.husband_id!, external: false, x: 0, block: husbandPB },
      wife: null,
      childAnchorX: 0,
      childAnchorY: BOX_H / 2,
      tieY: 0
    };
  }
  if (wifePB !== null) {
    return {
      husband: null,
      wife: { id: fam.wife_id!, external: false, x: 0, block: wifePB },
      childAnchorX: 0,
      childAnchorY: BOX_H / 2,
      tieY: 0
    };
  }
  return {
    husband: null,
    wife: null,
    childAnchorX: 0,
    childAnchorY: 0,
    tieY: 0
  };
}

function couplePlacement(
  husbandPB: PersonBlock,
  wifePB: PersonBlock,
  fam: FamilyRow,
  tieXFBlocal: number
): InternalCoupleLayout {
  // Spouse-to-spouse separation is fixed at COUPLE_PITCH. The Tie midpoint
  // sits at FB-local x = tieXFBlocal (the chart-X of the bloodline kid;
  // see ADR-0001). The bloodline kid itself stays at FB-local 0; the L-bar
  // in block-family.ts handles any horizontal gap between Tie and kid.
  const sep = COUPLE_PITCH;
  return {
    husband: {
      id: fam.husband_id!,
      external: false,
      x: tieXFBlocal - sep / 2,
      block: husbandPB
    },
    wife: {
      id: fam.wife_id!,
      external: false,
      x: tieXFBlocal + sep / 2,
      block: wifePB
    },
    childAnchorX: tieXFBlocal,
    childAnchorY: 0,
    tieY: 0
  };
}
