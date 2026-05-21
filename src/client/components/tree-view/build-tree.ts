// Top-down builders for the chart-root parent FamilyNode and the depth-1
// ancestor FamilyNodes (which include Aunts/Uncles). Depth ≥ 2 bloodline-
// only ancestry lives in build-ancestor-tree.ts, called via
// placeAncestorCouple.
//
// Two-pass orchestration for the chart-root parent FamilyNode:
//   Pass 1 — build bloodline kid nodes (focus + siblings) and pack them.
//   Pass 2 — build Fa node / Mo node with step-fam FamilyNodes sized to
//            clear the bloodline kid row's chart extents.

import { computeBloodlineFootprint } from './bloodline-footprint';
import type { BloodlineFootprint } from './bloodline-footprint';
import { placeAncestorCouple } from './build-ancestor-tree';
import { kidXsFromRow, packRow, placeInternalCouple } from './build-marriages';
import { buildFocusNode, buildSiblingNode } from './build-owned';
import {
  buildAncestorNodeWithStepFams,
  measureStepFamsExtent
} from './build-step-fams';
import {
  BARE_PERSON_EXTENTS,
  HALF_PITCH,
  isPersonKnown,
  presentChildren
} from './helpers';
import type { FamilyRow, LayoutIndices } from './helpers';
import { FamilyNode } from './node-family';
import type { Anchor, KidSlot } from './node-family';
import { PersonNode } from './node-person';

export function buildChartRoot(focusId: number, ix: LayoutIndices) {
  if (!ix.persons.has(focusId)) return null;
  const parentFam = ix.parentFamByPerson.get(focusId);
  if (parentFam !== undefined && ix.levels >= 1) {
    return buildParentFN(focusId, parentFam, ix);
  }
  return buildFocusNode(focusId, ix);
}

// At depth 1, Aunts/Uncles share the sibship with the bloodline kid, fanning
// outward in birth order (left for Fa branch, right for Mo branch); the
// bloodline kid sits at the inward end. Aunts/Uncles are bare nodes — their
// own children, marriages, and ancestry are out of rendering scope
// (CONTEXT.md, ADR-0002).
interface ChildhoodFNKidsArgs {
  bloodlineId: number;
  fam: FamilyRow;
  ancestorChartX: number;
  stepFamSpacer?: number;
  ix: LayoutIndices;
}

function childhoodFNKids(args: ChildhoodFNKidsArgs): KidSlot[] {
  const { bloodlineId, fam, ancestorChartX, stepFamSpacer, ix } = args;
  const bloodlineSlot: Anchor = { personId: bloodlineId, localX: 0 };
  const sibIds = presentChildren(fam, ix);
  const auntIds = sibIds.filter((sid) => sid !== bloodlineId);
  if (auntIds.length === 0) return [bloodlineSlot];

  const auntNodes = auntIds.map((sid) => new PersonNode(sid, null, [], null));
  const fanLeft = ancestorChartX < 0;
  // `null` marks the bloodline slot — its box is rendered by the parent
  // FamilyNode above, but it still occupies a column in the sibship row
  // for packing.
  const ordered: Array<PersonNode | null> = fanLeft
    ? [...auntNodes, null]
    : [null, ...auntNodes];
  const packed = packRow(ordered.map((b) => b?.extents ?? BARE_PERSON_EXTENTS));
  const bloodlineIdx = fanLeft ? ordered.length - 1 : 0;
  const shift = -packed.positions[bloodlineIdx]!;
  // Push Aunts/Uncles past the step-fam reservation + focus row extent
  // so step-spouses + half-siblings fit between the bloodline parent and
  // the Aunts/Uncles in chart-X space.
  const auntShift = (stepFamSpacer ?? 0) * (fanLeft ? -1 : 1);

  return ordered.map((blk, i) => {
    if (blk === null) return bloodlineSlot;
    return {
      node: blk,
      localX: packed.positions[i]! + shift + auntShift
    };
  });
}

function buildParentFN(
  focusId: number,
  parentFam: FamilyRow,
  ix: LayoutIndices
) {
  // Build focus sibship first so we know its chart extent, then size
  // step-fam reservations and Aunts/Uncles spacers based on that extent
  // — Aunts/Uncles get pushed past the focus sibship AND the step-fams
  // (see CONTEXT.md "Step-fam fan", ADR-0001).
  const sibIds = presentChildren(parentFam, ix);
  const kidNodes = sibIds.map((sid) =>
    sid === focusId ? buildFocusNode(sid, ix) : buildSiblingNode(sid, ix)
  );
  const packed = packRow(kidNodes.map((k) => k.extents));
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
  const faNode = parentNode({
    personId: parentFam.husband_id,
    childhood: faChildhood,
    parentFam,
    footprint,
    side: 'left',
    ix
  });
  const moNode = parentNode({
    personId: parentFam.wife_id,
    childhood: moChildhood,
    parentFam,
    footprint,
    side: 'right',
    ix
  });
  const couple = placeInternalCouple(faNode, moNode);
  const kidXs = kidXsFromRow(packed, couple.childAnchor.x);
  const kids: KidSlot[] = sibIds.map((_sid, i) => ({
    node: kidNodes[i]!,
    localX: kidXs[i]!
  }));
  return new FamilyNode({
    famId: parentFam.id,
    husband: couple.husband,
    wife: couple.wife,
    kids,
    childAnchor: couple.childAnchor,
    tieY: couple.tieY
  });
}

interface ParentNodeArgs {
  personId: number | null;
  childhood: FamilyNode | null;
  parentFam: FamilyRow;
  footprint: BloodlineFootprint;
  side: 'left' | 'right';
  ix: LayoutIndices;
}

function parentNode(args: ParentNodeArgs) {
  if (!isPersonKnown(args.personId, args.ix)) return null;
  return buildAncestorNodeWithStepFams({
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
  const { fam, husbandNode, wifeNode, tieXLocal } = placed;
  const kids = childhoodFNKids({
    bloodlineId: parentId,
    fam,
    ancestorChartX,
    stepFamSpacer,
    ix
  });
  const couple = placeInternalCouple(husbandNode, wifeNode, tieXLocal);
  return new FamilyNode({
    famId: fam.id,
    husband: couple.husband,
    wife: couple.wife,
    kids,
    childAnchor: couple.childAnchor,
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
