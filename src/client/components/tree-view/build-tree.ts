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
  packBlocks,
  type PackedBlocks
} from './build-marriages';
import { buildFocusPersonBlock, buildSiblingPersonBlock } from './build-owned';
import { buildAncestorPBWithStepFams } from './build-step-fams';
import { BOX_H, BOX_W, COUPLE_PITCH, presentChildren, ROW_H } from './helpers';
import type { FamilyRow, LayoutIndices } from './helpers';

// ============= Top-level =============

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

// ============= Childhood FB + plain ancestor PB (depth ≥ 2) =============

// `ancestorChartX` is the chart-X of the bloodline ancestor whose childhood
// FB we're building, measured in the FB-local frame whose origin is that
// ancestor's own box. By the bloodline-pyramid rule (see CONTEXT.md and
// ADR-0001), the GGP couple's Tie sits at FB-local x = ancestorChartX, and
// each parent's own chart-X recurses as 2*ancestorChartX ± HALF_PITCH.
// Top-level callers pass -HALF_PITCH for Fa, +HALF_PITCH for Mo.
const HALF_PITCH = COUPLE_PITCH / 2;

function ancestorPBOrNull(
  parentId: number | null,
  depth: number,
  ancestorChartX: number,
  ix: LayoutIndices
): PersonBlock | null {
  if (parentId === null || !ix.persons.has(parentId)) return null;
  return buildPlainAncestorPB(parentId, depth, ancestorChartX, ix);
}

function buildChildhoodFamily(
  personId: number,
  currentDepth: number,
  ancestorChartX: number,
  ix: LayoutIndices
): FamilyBlock | null {
  if (currentDepth >= ix.levels) return null;
  const fam = ix.parentFamByPerson.get(personId);
  if (fam === undefined) return null;
  const parentDepth = currentDepth + 1;
  // Symmetric pyramid: GGP Tie sits at chart-X = 2 * ancestorChartX (so the
  // ancestor sits halfway between his/her own grandparents' Ties one row up,
  // recursively). Husband and wife straddle the Tie at ± HALF_PITCH.
  const husbandChartX = 2 * ancestorChartX - HALF_PITCH;
  const wifeChartX = 2 * ancestorChartX + HALF_PITCH;
  const husbandPB = ancestorPBOrNull(
    fam.husband_id,
    parentDepth,
    husbandChartX,
    ix
  );
  const wifePB = ancestorPBOrNull(fam.wife_id, parentDepth, wifeChartX, ix);
  if (husbandPB === null && wifePB === null) return null;

  const couple = layoutInternalCouple(husbandPB, wifePB, fam, ancestorChartX);
  const kids = childhoodFBKids({
    bloodlineId: personId,
    fam,
    currentDepth,
    ancestorChartX,
    ix
  });
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
  const childhood = buildChildhoodFamily(personId, depth, ancestorChartX, ix);
  return new PersonBlock(personId, childhood, [], null);
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
  ix: LayoutIndices;
}

function childhoodFBKids(args: ChildhoodFBKidsArgs): KidPlacement[] {
  const { bloodlineId, fam, currentDepth, ancestorChartX, ix } = args;
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

  return orderedBlocks.map((blk, i) => {
    if (i === bloodlineIdx) return bloodlinePlacement;
    return {
      id: blk.personId,
      external: false,
      x: packed.positions[i]! + shift,
      block: blk
    };
  });
}

// ============= Parent FB (chart root) =============

function buildParentFamilyBlock(
  focusId: number,
  parentFam: FamilyRow,
  ix: LayoutIndices
): FamilyBlock | null {
  const sibIds = presentChildren(parentFam, ix);
  if (parentFam.husband_id === null && parentFam.wife_id === null) {
    if (sibIds.length === 0) return null;
  }

  // Father sits at chart-X = -HALF_PITCH (left of focus column 0); Mother
  // at +HALF_PITCH. The symmetric pyramid above each is built from those
  // chart-X values (see CONTEXT.md "Bloodline pyramid", ADR-0001).
  const faChildhood = childhoodForParent(parentFam.husband_id, -HALF_PITCH, ix);
  const moChildhood = childhoodForParent(parentFam.wife_id, HALF_PITCH, ix);

  const kidPBs = sibIds.map((sid) =>
    sid === focusId
      ? buildFocusPersonBlock(sid, ix)
      : buildSiblingPersonBlock(sid, ix)
  );
  const packed = packBlocks(kidPBs);

  const ctx = parentChartContext({
    parentFam,
    kidPBs,
    packed,
    sibIds,
    focusId,
    ix
  });

  const faPB =
    parentFam.husband_id !== null && ix.persons.has(parentFam.husband_id)
      ? buildAncestorPBWithStepFams({
          personId: parentFam.husband_id,
          childhoodFamily: faChildhood,
          bloodlineFamId: parentFam.id,
          parentChartX: ctx.faChartX,
          bloodlineLeftChart: ctx.bloodlineLeftChart,
          bloodlineRightChart: ctx.bloodlineRightChart,
          ix
        })
      : null;
  const moPB =
    parentFam.wife_id !== null && ix.persons.has(parentFam.wife_id)
      ? buildAncestorPBWithStepFams({
          personId: parentFam.wife_id,
          childhoodFamily: moChildhood,
          bloodlineFamId: parentFam.id,
          parentChartX: ctx.moChartX,
          bloodlineLeftChart: ctx.bloodlineLeftChart,
          bloodlineRightChart: ctx.bloodlineRightChart,
          ix
        })
      : null;

  return assembleParentFB({ parentFam, faPB, moPB, kidPBs, packed, sibIds });
}

function childhoodForParent(
  parentId: number | null,
  ancestorChartX: number,
  ix: LayoutIndices
): FamilyBlock | null {
  if (parentId === null || !ix.persons.has(parentId)) return null;
  return buildChildhoodFamily(parentId, 1, ancestorChartX, ix);
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
  const faPresent =
    args.parentFam.husband_id !== null &&
    args.ix.persons.has(args.parentFam.husband_id);
  const moPresent =
    args.parentFam.wife_id !== null &&
    args.ix.persons.has(args.parentFam.wife_id);
  if (!faPresent || !moPresent) return 0;
  return COUPLE_PITCH;
}

function kidRowExtents(
  kidPBs: PersonBlock[],
  packed: PackedBlocks,
  parentOffsetX: number
): { leftChart: number; rightChart: number } {
  if (kidPBs.length === 0) {
    return { leftChart: -BOX_W / 2, rightChart: BOX_W / 2 };
  }
  return {
    leftChart: parentOffsetX - packed.barMid,
    rightChart: parentOffsetX + (packed.totalWidth - packed.barMid)
  };
}

function parentChartContext(args: ParentContextArgs): ParentChartContext {
  const sep = computeParentSep(args);
  const focusIdx = args.sibIds.indexOf(args.focusId);
  const focusLocalX =
    focusIdx === -1 || args.kidPBs.length === 0
      ? 0
      : args.packed.positions[focusIdx]! - args.packed.barMid;
  const parentOffsetX = -focusLocalX;
  const kidRow = kidRowExtents(args.kidPBs, args.packed, parentOffsetX);
  // Step-fams span both parent and focus rows, so the bloodline footprint
  // they must clear is the UNION of bloodline kid-row extents and the
  // bloodline parent boxes (Fa, Mo) at parent row.
  const faChartX = parentOffsetX + (sep > 0 ? -sep / 2 : 0);
  const moChartX = parentOffsetX + (sep > 0 ? sep / 2 : 0);
  const faPresent =
    args.parentFam.husband_id !== null &&
    args.ix.persons.has(args.parentFam.husband_id);
  const moPresent =
    args.parentFam.wife_id !== null &&
    args.ix.persons.has(args.parentFam.wife_id);
  const parentRowLeft = faPresent ? faChartX - BOX_W / 2 : Infinity;
  const parentRowRight = moPresent ? moChartX + BOX_W / 2 : -Infinity;
  return {
    faChartX,
    moChartX,
    bloodlineLeftChart: Math.min(kidRow.leftChart, parentRowLeft),
    bloodlineRightChart: Math.max(kidRow.rightChart, parentRowRight)
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
  const kidXs = packed.positions.map(
    (p) => p - packed.barMid + couple.childAnchorX
  );
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

// ============= Internal-couple layout =============

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
