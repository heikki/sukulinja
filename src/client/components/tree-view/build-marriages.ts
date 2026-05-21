// Low-level FamilyNode construction utilities — packing, extents, and the
// final FN assembly from pre-computed adult/kid placements.

import {
  BOX_H,
  HALF_PITCH,
  isHusbandIn,
  isPersonKnown,
  otherSpouseOf,
  SIBLING_GAP
} from './helpers';
import type { Extents, FamilyRow, LayoutIndices, Point } from './helpers';
import { FamilyNode } from './node-family';
import type { AdultSlot, KidSlot } from './node-family';
import { PersonNode } from './node-person';

export interface PackedBlocks {
  positions: number[];
  totalWidth: number;
  barMid: number;
}

export function kidXsFromPacked(packed: PackedBlocks, anchorX: number) {
  return packed.positions.map((p) => p - packed.barMid + anchorX);
}

export function packBlocks(extents: readonly Extents[]) {
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
// child-anchor / tie-Y the FN will use.
export interface SpousePlacement {
  xSpouse: number;
  childAnchor: Point;
  tieY: number;
}

interface BuildAnchorAdultFNArgs {
  // The anchor adult — their PersonNode is rendered by an outer node, so
  // this FN places them at local x = 0 as an Anchor slot.
  anchorAdultId: number;
  fam: FamilyRow;
  kidBlocks: PersonNode[];
  packed: PackedBlocks;
  placement: SpousePlacement;
  ix: LayoutIndices;
}

export function buildAnchorAdultFN(args: BuildAnchorAdultFNArgs) {
  const { anchorAdultId, fam, kidBlocks, packed, placement, ix } = args;
  const otherId = otherSpouseOf(fam, anchorAdultId);
  const renderedSpouseId = isPersonKnown(otherId, ix) ? otherId : null;

  const anchorIsHusband = isHusbandIn(fam, anchorAdultId);
  const anchorAdult: AdultSlot = { id: anchorAdultId, localX: 0 };
  const spouseAdult: AdultSlot =
    otherId === null
      ? null
      : renderedSpouseId === null
        ? { id: otherId, localX: placement.xSpouse }
        : {
            node: new PersonNode(renderedSpouseId, null, [], null),
            localX: placement.xSpouse
          };

  const kidXs = kidXsFromPacked(packed, placement.childAnchor.x);
  const kids: KidSlot[] = kidBlocks.map((kb, i) => ({
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

export function placeInternalCouple(
  husbandPN: PersonNode | null,
  wifePN: PersonNode | null,
  tieXFNlocal = 0
) {
  if (husbandPN !== null && wifePN !== null) {
    // Spouse-to-spouse separation is fixed at COUPLE_PITCH. The Tie midpoint
    // sits at FN-local x = tieXFNlocal (see ADR-0001); the bloodline kid
    // stays at FN-local 0, and the sibship bar absorbs any gap between Tie
    // and kid.
    return {
      husband: { node: husbandPN, localX: tieXFNlocal - HALF_PITCH },
      wife: { node: wifePN, localX: tieXFNlocal + HALF_PITCH },
      childAnchor: { x: tieXFNlocal, y: 0 },
      tieY: 0
    };
  }
  // Lone parent (or neither): pivot at x = 0, drop from the present adult's
  // box bottom (BOX_H/2) so the sibship bar lines up correctly.
  const anyPresent = husbandPN !== null || wifePN !== null;
  return {
    husband: husbandPN === null ? null : { node: husbandPN, localX: 0 },
    wife: wifePN === null ? null : { node: wifePN, localX: 0 },
    childAnchor: { x: 0, y: anyPresent ? BOX_H / 2 : 0 },
    tieY: 0
  };
}
