// Top-down builders for the chart-root parent FB and the depth-1 ancestor
// FBs (which include Aunts/Uncles). Depth ≥ 2 bloodline-only ancestry lives
// in build-ancestor-tree.ts, called via placeAncestorCouple.
//
// Two-pass orchestration for the chart-root parent FB:
//   Pass 1 — build bloodline kid PBs (focus + siblings) and pack them.
//   Pass 2 — build Fa.PB / Mo.PB with step-fam FBs sized to clear the
//            bloodline kid row's chart extents.

import type { FamilyBlock, PersonPlacement } from './block-family';
import { PersonBlock } from './block-person';
import { computeBloodlineFootprint } from './bloodline-footprint';
import type { BloodlineFootprint } from './bloodline-footprint';
import { placeAncestorCouple } from './build-ancestor-tree';
import {
  buildMarriageFB,
  kidXsFromPacked,
  packBlocks,
  placeInternalCouple
} from './build-marriages';
import { buildFocusPB, buildSiblingPB } from './build-owned';
import {
  buildAncestorPBWithStepFams,
  measureStepFamsExtent
} from './build-step-fams';
import { HALF_PITCH, isPersonKnown, presentChildren } from './helpers';
import type { FamilyRow, LayoutIndices } from './helpers';

export function buildChartRoot(focusId: number, ix: LayoutIndices) {
  if (!ix.persons.has(focusId)) return null;
  const parentFam = ix.parentFamByPerson.get(focusId);
  if (parentFam !== undefined && ix.levels >= 1) {
    return buildParentFB(focusId, parentFam, ix);
  }
  return buildFocusPB(focusId, ix);
}

// At depth 1, Aunts/Uncles share the sibship with the bloodline kid, fanning
// outward in birth order (left for Fa branch, right for Mo branch); the
// bloodline kid sits at the inward end. Aunts/Uncles are bare PBs — their
// own children, marriages, and ancestry are out of rendering scope
// (CONTEXT.md, ADR-0002).
interface ChildhoodFBKidsArgs {
  bloodlineId: number;
  fam: FamilyRow;
  ancestorChartX: number;
  stepFamSpacer?: number;
  ix: LayoutIndices;
}

function childhoodFBKids(args: ChildhoodFBKidsArgs) {
  const { bloodlineId, fam, ancestorChartX, stepFamSpacer, ix } = args;
  const bloodlinePlacement: PersonPlacement = {
    id: bloodlineId,
    external: true,
    x: 0,
    block: null
  };
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

function buildParentFB(
  focusId: number,
  parentFam: FamilyRow,
  ix: LayoutIndices
) {
  // Build focus sibship first so we know its chart extent, then size
  // step-fam reservations and Aunts/Uncles spacers based on that extent
  // — Aunts/Uncles get pushed past the focus sibship AND the step-fams
  // (see CONTEXT.md "Step-fam fan", ADR-0001).
  const sibIds = presentChildren(parentFam, ix);
  const kidPBs = sibIds.map((sid) =>
    sid === focusId ? buildFocusPB(sid, ix) : buildSiblingPB(sid, ix)
  );
  const packed = packBlocks(kidPBs);
  const footprint = computeBloodlineFootprint({
    parentFam,
    packed,
    sibIds,
    focusId,
    ix
  });
  const faSpacer = computeAuntShift({
    parentId: parentFam.husband_id,
    bloodlineFamId: parentFam.id,
    footprint,
    side: 'left',
    ix
  });
  const moSpacer = computeAuntShift({
    parentId: parentFam.wife_id,
    bloodlineFamId: parentFam.id,
    footprint,
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
    footprint,
    side: 'left',
    ix
  });
  const moPB = parentPB({
    personId: parentFam.wife_id,
    childhood: moChildhood,
    parentFam,
    footprint,
    side: 'right',
    ix
  });
  const couple = placeInternalCouple(faPB, moPB, parentFam);
  const kidXs = kidXsFromPacked(packed, couple.childAnchor.x);
  const kids: PersonPlacement[] = sibIds.map((sid, i) => ({
    id: sid,
    external: false,
    x: kidXs[i]!,
    block: kidPBs[i]!
  }));
  return buildMarriageFB({
    famId: parentFam.id,
    husband: couple.husband,
    wife: couple.wife,
    kids,
    anchor: couple.childAnchor,
    tieY: couple.tieY
  });
}

interface ParentPBArgs {
  personId: number | null;
  childhood: FamilyBlock | null;
  parentFam: FamilyRow;
  footprint: BloodlineFootprint;
  side: 'left' | 'right';
  ix: LayoutIndices;
}

function parentPB(args: ParentPBArgs) {
  if (!isPersonKnown(args.personId, args.ix)) return null;
  return buildAncestorPBWithStepFams({
    personId: args.personId,
    childhoodFamily: args.childhood,
    bloodlineFamId: args.parentFam.id,
    footprint: args.footprint,
    side: args.side,
    ix: args.ix
  });
}

function childhoodForParent(
  parentId: number | null,
  ancestorChartX: number,
  stepFamSpacer: number,
  ix: LayoutIndices
) {
  if (!isPersonKnown(parentId, ix)) return null;
  const placed = placeAncestorCouple(parentId, 1, ancestorChartX, ix);
  if (placed === null) return null;
  const { fam, husbandPB, wifePB, tieXFBlocal } = placed;
  const kids = childhoodFBKids({
    bloodlineId: parentId,
    fam,
    ancestorChartX,
    stepFamSpacer,
    ix
  });
  const couple = placeInternalCouple(husbandPB, wifePB, fam, tieXFBlocal);
  return buildMarriageFB({
    famId: fam.id,
    husband: couple.husband,
    wife: couple.wife,
    kids,
    anchor: couple.childAnchor,
    tieY: couple.tieY
  });
}

interface AuntShiftArgs {
  parentId: number | null;
  bloodlineFamId: number;
  footprint: BloodlineFootprint;
  side: 'left' | 'right';
  ix: LayoutIndices;
}

function computeAuntShift(args: AuntShiftArgs) {
  if (!isPersonKnown(args.parentId, args.ix)) return 0;
  const stepFams = measureStepFamsExtent(
    args.parentId,
    args.bloodlineFamId,
    args.ix
  );
  // Aunts/Uncles must clear:
  //   (1) the distance from the parent's box edge out to the footprint's
  //       outer edge (the bloodline extension past Fa/Mo's own box), plus
  //   (2) the step-fam reservation, which gets placed past that edge.
  const parentBoxEdge = args.footprint.parentBoxEdge(args.side);
  const outerEdge = args.footprint.outerEdge(args.side);
  const extentPastBox =
    args.side === 'left'
      ? Math.max(0, parentBoxEdge - outerEdge)
      : Math.max(0, outerEdge - parentBoxEdge);
  return extentPastBox + stepFams;
}
