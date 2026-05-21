// Low-level FamilyNode construction utilities — packing, extents, and the
// final FamilyNode assembly from pre-computed adult/kid placements.

import type { FamilyRow } from '@common/types';

import {
  BOX_H,
  HALF_PITCH,
  isPersonKnown,
  otherSpouseOf,
  SIBLING_GAP
} from '../helpers';
import type { Extents, LayoutIndices, Point } from '../helpers';
import { FamilyNode, PersonNode } from '../nodes';
import type { AdultSlot, KidSlot } from '../nodes';

export interface PackedRow {
  positions: number[];
  totalWidth: number;
  barMid: number;
}

export function kidXsFromRow(packed: PackedRow, anchorX: number) {
  return packed.positions.map((p) => p - packed.barMid + anchorX);
}

export function packRow(extents: readonly Extents[]) {
  if (extents.length === 0) {
    return { positions: [], totalWidth: 0, barMid: 0 };
  }
  const positions: number[] = [];
  let cursor = 0;
  for (const [i, e] of extents.entries()) {
    if (i > 0) cursor += SIBLING_GAP;
    cursor += e.left;
    positions.push(cursor);
    cursor += e.right;
  }
  const barMid = (positions[0]! + positions[positions.length - 1]!) / 2;
  return { positions, totalWidth: cursor, barMid };
}

// Where the spouse sits relative to the anchor adult's box, plus the
// child-anchor / tie-Y the FamilyNode will use.
interface SpousePlacement {
  xSpouse: number;
  childAnchor: Point;
  tieY: number;
}

interface BuildAnchorAdultArgs {
  // The anchor adult — their PersonNode is rendered by an outer node, so
  // this FamilyNode places them at local x = 0 as an Anchor slot.
  anchorAdultId: number;
  fam: FamilyRow;
  kidNodes: PersonNode[];
  packed: PackedRow;
  placement: SpousePlacement;
  ix: LayoutIndices;
}

export function buildAnchorAdultFam(args: BuildAnchorAdultArgs) {
  const { anchorAdultId, fam, kidNodes, packed, placement, ix } = args;
  const otherId = otherSpouseOf(fam, anchorAdultId);
  const renderedSpouseId = isPersonKnown(otherId, ix) ? otherId : null;

  const anchorIsHusband = fam.husband_id === anchorAdultId;
  const anchorAdult: AdultSlot = { personId: anchorAdultId, localX: 0 };
  const spouseAdult: AdultSlot =
    otherId === null
      ? null
      : renderedSpouseId === null
        ? { personId: otherId, localX: placement.xSpouse }
        : {
            node: new PersonNode(renderedSpouseId, null, [], null),
            localX: placement.xSpouse
          };

  const kidXs = kidXsFromRow(packed, placement.childAnchor.x);
  const kids: KidSlot[] = kidNodes.map((kb, i) => ({
    node: kb,
    localX: kidXs[i]!
  }));

  return new FamilyNode({
    famId: fam.id,
    husband: anchorIsHusband ? anchorAdult : spouseAdult,
    wife: anchorIsHusband ? spouseAdult : anchorAdult,
    kids,
    childAnchor: placement.childAnchor,
    tieY: placement.tieY
  });
}

function placeInternalCouple(
  husbandNode: PersonNode | null,
  wifeNode: PersonNode | null,
  tieXLocal: number
) {
  if (husbandNode !== null && wifeNode !== null) {
    // Spouse-to-spouse separation is fixed at COUPLE_PITCH. The Tie midpoint
    // sits at family-local x = tieXLocal (see ADR-0001); the bloodline kid
    // stays at family-local 0, and the sibship bar absorbs any gap between Tie
    // and kid.
    return {
      husband: { node: husbandNode, localX: tieXLocal - HALF_PITCH },
      wife: { node: wifeNode, localX: tieXLocal + HALF_PITCH },
      childAnchor: { x: tieXLocal, y: 0 }
    };
  }
  // Lone parent (or neither): pivot at x = 0, drop from the present adult's
  // box bottom (BOX_H/2) so the sibship bar lines up correctly.
  const anyPresent = husbandNode !== null || wifeNode !== null;
  return {
    husband: husbandNode === null ? null : { node: husbandNode, localX: 0 },
    wife: wifeNode === null ? null : { node: wifeNode, localX: 0 },
    childAnchor: { x: 0, y: anyPresent ? BOX_H / 2 : 0 }
  };
}

interface CoupleFamilyNodeArgs {
  famId: number;
  husbandNode: PersonNode | null;
  wifeNode: PersonNode | null;
  kids: readonly KidSlot[];
  // Tie midpoint in the family-local frame. Defaults to 0; depth ≥ 2
  // ancestor couples shift it per ADR-0001's (2^n − 1) × HALF_PITCH sequence.
  tieXLocal?: number;
}

export function buildCoupleFamilyNode(args: CoupleFamilyNodeArgs) {
  const couple = placeInternalCouple(
    args.husbandNode,
    args.wifeNode,
    args.tieXLocal ?? 0
  );
  return new FamilyNode({
    famId: args.famId,
    husband: couple.husband,
    wife: couple.wife,
    kids: args.kids,
    childAnchor: couple.childAnchor,
    tieY: 0
  });
}
