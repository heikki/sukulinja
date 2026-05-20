// Low-level FamilyBlock construction utilities — packing, extents, and the
// final FB assembly from pre-computed adult/kid placements. Higher-level
// step-fam logic lives in build-step-fams.ts; PB builders + parent FB
// orchestration live in build-tree.ts.

import { FamilyBlock } from './block-family';
import type { PersonPlacement } from './block-family';
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

interface BuildMarriageFBArgs {
  famId: number;
  husband: PersonPlacement | null;
  wife: PersonPlacement | null;
  kids: PersonPlacement[];
  anchor: Point;
  tieY: number;
}

export function buildMarriageFB(args: BuildMarriageFBArgs) {
  return new FamilyBlock({
    famId: args.famId,
    husband: args.husband,
    wife: args.wife,
    kids: args.kids,
    tieY: args.tieY,
    childAnchor: args.anchor
  });
}

// Where the spouse sits relative to the externalAdult's anchor, plus the
// child-anchor / tie-Y the FB will use.
export interface SpousePlacement {
  xSpouse: number;
  anchor: Point;
  tieY: number;
}

interface BuildExternalAdultFBArgs {
  // The "anchor" adult — their box is rendered by an outer block, so the FB
  // places them at local x = 0 with external = true.
  externalAdultId: number;
  fam: FamilyRow;
  kidBlocks: PersonBlock[];
  packed: PackedBlocks;
  placement: SpousePlacement;
  ix: LayoutIndices;
}

export function buildExternalAdultFB(args: BuildExternalAdultFBArgs) {
  const { externalAdultId, fam, kidBlocks, packed, placement, ix } = args;
  const otherId = otherSpouseOf(fam, externalAdultId);
  const renderedSpouseId = isPersonKnown(otherId, ix) ? otherId : null;

  const externalIsHusband = isHusbandIn(fam, externalAdultId);
  const externalAdult: PersonPlacement = {
    id: externalAdultId,
    external: true,
    x: 0,
    block: null
  };
  const spouseAdult: PersonPlacement | null =
    otherId === null
      ? null
      : {
          id: otherId,
          external: renderedSpouseId === null,
          x: placement.xSpouse,
          block:
            renderedSpouseId === null
              ? null
              : new PersonBlock(renderedSpouseId, null, [], null)
        };

  const kidXs = kidXsFromPacked(packed, placement.anchor.x);
  const kids: PersonPlacement[] = kidBlocks.map((kb, i) => ({
    id: kb.personId,
    external: false,
    x: kidXs[i]!,
    block: kb
  }));

  return buildMarriageFB({
    famId: fam.id,
    husband: externalIsHusband ? externalAdult : spouseAdult,
    wife: externalIsHusband ? spouseAdult : externalAdult,
    kids,
    anchor: placement.anchor,
    tieY: placement.tieY
  });
}

export function placeInternalCouple(
  husbandPB: PersonBlock | null,
  wifePB: PersonBlock | null,
  fam: FamilyRow,
  tieXFBlocal = 0
) {
  if (husbandPB !== null && wifePB !== null) {
    // Spouse-to-spouse separation is fixed at COUPLE_PITCH. The Tie midpoint
    // sits at FB-local x = tieXFBlocal (the chart-X of the bloodline kid;
    // see ADR-0001). The bloodline kid itself stays at FB-local 0; the L-bar
    // in block-family.ts handles any horizontal gap between Tie and kid.
    return {
      husband: {
        id: fam.husband_id!,
        external: false,
        x: tieXFBlocal - HALF_PITCH,
        block: husbandPB
      },
      wife: {
        id: fam.wife_id!,
        external: false,
        x: tieXFBlocal + HALF_PITCH,
        block: wifePB
      },
      childAnchor: { x: tieXFBlocal, y: 0 },
      tieY: 0
    };
  }
  // Lone parent (or neither): pivot at x = 0, drop from the present adult's
  // box bottom (BOX_H/2) so the sibship bar lines up correctly.
  const anyPresent = husbandPB !== null || wifePB !== null;
  return {
    husband:
      husbandPB === null
        ? null
        : { id: fam.husband_id!, external: false, x: 0, block: husbandPB },
    wife:
      wifePB === null
        ? null
        : { id: fam.wife_id!, external: false, x: 0, block: wifePB },
    childAnchor: { x: 0, y: anyPresent ? BOX_H / 2 : 0 },
    tieY: 0
  };
}
