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
import {
  buildAncestorPBWithStepFams,
  measureStepFamsExtent
} from './build-step-fams';
import { BOX_H, COUPLE_PITCH, presentChildren, ROW_H } from './helpers';
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
  if (parentId === null || !ix.persons.has(parentId)) return null;
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
  // Build kids first so we know the sibship's bar midpoint — the GGP
  // couple's Tie sits directly above it (keeping the drop vertical).
  const kids = childhoodFBKids({
    bloodlineId: personId,
    fam,
    currentDepth,
    ancestorChartX,
    stepFamSpacer,
    ix
  });
  // The Tie sits off the kid's column in the direction of the
  // ancestor's sex (male's parents fan left, female's right). The
  // magnitude is max(|bar midpoint|, directional shift) so depth-1
  // sibships with wide Aunts/Uncles use the bar midpoint, while
  // only-child cases (and depth ≥ 2) get the scaled directional shift.
  // The directional shift itself grows with remaining levels above
  // (ADR-0001), so the upper pyramid has horizontal room.
  const tieXFBlocal = tieXForFB(personId, currentDepth, kids, ix);
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

function sibshipBarMid(kids: readonly KidPlacement[]): number {
  let minX = kids[0]!.x;
  let maxX = kids[0]!.x;
  for (const k of kids) {
    if (k.x < minX) minX = k.x;
    if (k.x > maxX) maxX = k.x;
  }
  return (minX + maxX) / 2;
}

function tieXForFB(
  personId: number,
  currentDepth: number,
  kids: readonly KidPlacement[],
  ix: LayoutIndices
): number {
  // Directional shift magnitude follows (2^remainingAbove − 1) × HALF_PITCH
  // so deeper pyramids get exponentially more room.
  const remainingAbove = Math.max(1, ix.levels - currentDepth);
  const directional = HALF_PITCH * (2 ** remainingAbove - 1);
  const sex = ix.persons.get(personId)?.sex;
  const barMid = sibshipBarMid(kids);
  // For Fa branch (male), both barMid and the directional shift are
  // negative; take the more negative. For Mo branch (female), both
  // positive; take the more positive. For an only-child sibship at
  // depth 1 the barMid is 0 and the directional shift wins.
  return sex === 'F'
    ? Math.max(barMid, directional)
    : Math.min(barMid, -directional);
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
  // Step-spouses of the bloodline parent sit adjacent to the parent on
  // the parent row — push Aunts/Uncles past them so nothing collides.
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
  // at +HALF_PITCH. Focus's step-parents sit adjacent to Fa/Mo on the
  // parent row, so Aunts/Uncles in each childhood FB are pushed past
  // that reservation (see CONTEXT.md "Step-fam fan", ADR-0001).
  const faChildhood = parentChildhood(
    parentFam.husband_id,
    -HALF_PITCH,
    parentFam,
    ix
  );
  const moChildhood = parentChildhood(
    parentFam.wife_id,
    HALF_PITCH,
    parentFam,
    ix
  );
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
  const faPB = parentPB({
    personId: parentFam.husband_id,
    childhood: faChildhood,
    parentFam,
    parentChartX: ctx.faChartX,
    side: 'left',
    ix
  });
  const moPB = parentPB({
    personId: parentFam.wife_id,
    childhood: moChildhood,
    parentFam,
    parentChartX: ctx.moChartX,
    side: 'right',
    ix
  });
  return assembleParentFB({ parentFam, faPB, moPB, kidPBs, packed, sibIds });
}

function parentChildhood(
  parentId: number | null,
  ancestorChartX: number,
  parentFam: FamilyRow,
  ix: LayoutIndices
): FamilyBlock | null {
  if (parentId === null || !ix.persons.has(parentId)) return null;
  const spacer = measureStepFamsExtent(parentId, parentFam.id, ix);
  return childhoodForParent(parentId, ancestorChartX, spacer, ix);
}

interface ParentPBArgs {
  personId: number | null;
  childhood: FamilyBlock | null;
  parentFam: FamilyRow;
  parentChartX: number;
  side: 'left' | 'right';
  ix: LayoutIndices;
}

function parentPB(args: ParentPBArgs): PersonBlock | null {
  if (args.personId === null || !args.ix.persons.has(args.personId)) {
    return null;
  }
  return buildAncestorPBWithStepFams({
    personId: args.personId,
    childhoodFamily: args.childhood,
    bloodlineFamId: args.parentFam.id,
    parentChartX: args.parentChartX,
    side: args.side,
    ix: args.ix
  });
}

function childhoodForParent(
  parentId: number | null,
  ancestorChartX: number,
  stepFamSpacer: number,
  ix: LayoutIndices
): FamilyBlock | null {
  if (parentId === null || !ix.persons.has(parentId)) return null;
  return buildChildhoodFamily({
    personId: parentId,
    currentDepth: 1,
    ancestorChartX,
    stepFamSpacer,
    ix
  });
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

function parentChartContext(args: ParentContextArgs): ParentChartContext {
  const sep = computeParentSep(args);
  const focusIdx = args.sibIds.indexOf(args.focusId);
  const focusLocalX =
    focusIdx === -1 || args.kidPBs.length === 0
      ? 0
      : args.packed.positions[focusIdx]! - args.packed.barMid;
  const parentOffsetX = -focusLocalX;
  return {
    faChartX: parentOffsetX + (sep > 0 ? -sep / 2 : 0),
    moChartX: parentOffsetX + (sep > 0 ? sep / 2 : 0)
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
