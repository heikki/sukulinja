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
import {
  BOX_H,
  BOX_W,
  COUPLE_GAP,
  COUPLE_PITCH,
  presentChildren,
  ROW_H
} from './helpers';
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

type Tilt = 'center' | 'left' | 'right';

function buildChildhoodFamily(
  personId: number,
  currentDepth: number,
  tilt: Tilt,
  ix: LayoutIndices
): FamilyBlock | null {
  if (currentDepth >= ix.levels) return null;
  const fam = ix.parentFamByPerson.get(personId);
  if (fam === undefined) return null;
  const parentDepth = currentDepth + 1;
  const husbandPB =
    fam.husband_id !== null && ix.persons.has(fam.husband_id)
      ? buildPlainAncestorPB(fam.husband_id, parentDepth, tilt, ix)
      : null;
  const wifePB =
    fam.wife_id !== null && ix.persons.has(fam.wife_id)
      ? buildPlainAncestorPB(fam.wife_id, parentDepth, tilt, ix)
      : null;
  if (husbandPB === null && wifePB === null) return null;

  const couple = layoutInternalCouple(husbandPB, wifePB, fam, tilt);
  // External bloodline kid sits at the bloodline-side column. For tilted
  // couples the bloodline kid lands directly below the pivoted GP
  // (FB-local x = 0); for centered couples it lands under the Tie midpoint.
  const externalKidX = tilt === 'center' ? couple.childAnchorX : 0;
  const kids: KidPlacement[] = [
    { id: personId, external: true, x: externalKidX, block: null }
  ];
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
  tilt: Tilt,
  ix: LayoutIndices
): PersonBlock {
  // Tilt is preserved through the chain (paternal branch tilts left all the
  // way up, maternal branch tilts right) so deeper great-GP rows don't
  // converge at the same chart X.
  const childhood = buildChildhoodFamily(personId, depth, tilt, ix);
  return new PersonBlock(personId, childhood, [], null);
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

  const faChildhood = childhoodForParent(parentFam.husband_id, 'left', ix);
  const moChildhood = childhoodForParent(parentFam.wife_id, 'right', ix);

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
    faChildhood,
    moChildhood,
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
  tilt: Tilt,
  ix: LayoutIndices
): FamilyBlock | null {
  if (parentId === null || !ix.persons.has(parentId)) return null;
  return buildChildhoodFamily(parentId, 1, tilt, ix);
}

interface ParentContextArgs {
  parentFam: FamilyRow;
  kidPBs: PersonBlock[];
  packed: PackedBlocks;
  sibIds: number[];
  focusId: number;
  faChildhood: FamilyBlock | null;
  moChildhood: FamilyBlock | null;
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
  const faCoupleRight = Math.max(BOX_W / 2, args.faChildhood?.rightWidth ?? 0);
  const moCoupleLeft = Math.max(BOX_W / 2, args.moChildhood?.leftWidth ?? 0);
  return Math.max(COUPLE_PITCH, faCoupleRight + moCoupleLeft + COUPLE_GAP);
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
  tilt: Tilt = 'center'
): InternalCoupleLayout {
  if (husbandPB !== null && wifePB !== null) {
    return couplePlacement(husbandPB, wifePB, fam, tilt);
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
  tilt: Tilt
): InternalCoupleLayout {
  // Sep widens to clear husband's right subtree extent + wife's left
  // subtree extent. For tilted couples the inner spouse sits at FB-local
  // 0, the outer spouse at ±sep — so deeper ancestor rows widen
  // recursively.
  const sep = Math.max(
    COUPLE_PITCH,
    husbandPB.coupleRightWidth + wifePB.coupleLeftWidth + COUPLE_GAP
  );
  if (tilt === 'left') {
    return {
      husband: {
        id: fam.husband_id!,
        external: false,
        x: -sep,
        block: husbandPB
      },
      wife: { id: fam.wife_id!, external: false, x: 0, block: wifePB },
      childAnchorX: -sep / 2,
      childAnchorY: 0,
      tieY: 0
    };
  }
  if (tilt === 'right') {
    return {
      husband: { id: fam.husband_id!, external: false, x: 0, block: husbandPB },
      wife: { id: fam.wife_id!, external: false, x: sep, block: wifePB },
      childAnchorX: sep / 2,
      childAnchorY: 0,
      tieY: 0
    };
  }
  return {
    husband: {
      id: fam.husband_id!,
      external: false,
      x: -sep / 2,
      block: husbandPB
    },
    wife: { id: fam.wife_id!, external: false, x: sep / 2, block: wifePB },
    childAnchorX: 0,
    childAnchorY: 0,
    tieY: 0
  };
}
