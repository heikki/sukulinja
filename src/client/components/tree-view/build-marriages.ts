// Low-level FamilyBlock construction utilities — packing, extents, and the
// final FB assembly from pre-computed adult/kid placements.

import { FamilyBlock } from './block-family';
import type { AdultSlot, KidSlot } from './block-family';
import { PersonBlock } from './block-person';
import {
  BOX_H,
  HALF_PITCH,
  isHusbandIn,
  isPersonKnown,
  otherSpouseOf,
  SIBLING_GAP
} from './helpers';
import type { Extents, FamilyRow, LayoutIndices, Point } from './helpers';

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
// child-anchor / tie-Y the FB will use.
export interface SpousePlacement {
  xSpouse: number;
  childAnchor: Point;
  tieY: number;
}

interface BuildAnchorAdultFBArgs {
  // The anchor adult — their PersonBlock is rendered by an outer block, so
  // this FB places them at local x = 0 as an Anchor slot.
  anchorAdultId: number;
  fam: FamilyRow;
  kidBlocks: PersonBlock[];
  packed: PackedBlocks;
  placement: SpousePlacement;
  ix: LayoutIndices;
}

export function buildAnchorAdultFB(args: BuildAnchorAdultFBArgs) {
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
            block: new PersonBlock(renderedSpouseId, null, [], null),
            localX: placement.xSpouse
          };

  const kidXs = kidXsFromPacked(packed, placement.childAnchor.x);
  const kids: KidSlot[] = kidBlocks.map((kb, i) => ({
    block: kb,
    localX: kidXs[i]!
  }));

  return new FamilyBlock({
    famId: fam.id,
    husband: anchorIsHusband ? anchorAdult : spouseAdult,
    wife: anchorIsHusband ? spouseAdult : anchorAdult,
    kids,
    childAnchor: placement.childAnchor,
    tieY: placement.tieY
  });
}

export function placeInternalCouple(
  husbandPB: PersonBlock | null,
  wifePB: PersonBlock | null,
  tieXFBlocal = 0
) {
  if (husbandPB !== null && wifePB !== null) {
    // Spouse-to-spouse separation is fixed at COUPLE_PITCH. The Tie midpoint
    // sits at FB-local x = tieXFBlocal (see ADR-0001); the bloodline kid
    // stays at FB-local 0, and the sibship bar absorbs any gap between Tie
    // and kid.
    return {
      husband: { block: husbandPB, localX: tieXFBlocal - HALF_PITCH },
      wife: { block: wifePB, localX: tieXFBlocal + HALF_PITCH },
      childAnchor: { x: tieXFBlocal, y: 0 },
      tieY: 0
    };
  }
  // Lone parent (or neither): pivot at x = 0, drop from the present adult's
  // box bottom (BOX_H/2) so the sibship bar lines up correctly.
  const anyPresent = husbandPB !== null || wifePB !== null;
  return {
    husband: husbandPB === null ? null : { block: husbandPB, localX: 0 },
    wife: wifePB === null ? null : { block: wifePB, localX: 0 },
    childAnchor: { x: 0, y: anyPresent ? BOX_H / 2 : 0 },
    tieY: 0
  };
}
