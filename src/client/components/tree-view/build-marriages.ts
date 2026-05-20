// Low-level FamilyBlock construction utilities — packing, extents, and the
// final FB assembly from pre-computed adult/kid placements. Higher-level
// step-fam logic lives in build-step-fams.ts; PB builders + parent FB
// orchestration live in build-tree.ts.

import type { Block } from './block';
import { FamilyBlock } from './block-family';
import type { FamilyBlockSpec, PersonPlacement } from './block-family';
import { PersonBlock } from './block-person';
import {
  isHusbandIn,
  isPersonKnown,
  otherSpouseOf,
  ROW_H,
  SIBLING_GAP
} from './helpers';
import type { FamilyRow, LayoutIndices, Point } from './helpers';

export interface PackedBlocks {
  positions: number[];
  totalWidth: number;
  barMid: number;
}

export function kidXsFromPacked(packed: PackedBlocks, anchorX: number) {
  return packed.positions.map((p) => p - packed.barMid + anchorX);
}

export function packBlocks(blocks: readonly Block[]) {
  if (blocks.length === 0) {
    return { positions: [], totalWidth: 0, barMid: 0 };
  }
  const positions: number[] = [];
  let cursor = 0;
  for (const [i, b] of blocks.entries()) {
    if (i > 0) cursor += SIBLING_GAP;
    cursor += b.leftWidth;
    positions.push(cursor);
    cursor += b.rightWidth;
  }
  const barMid = (positions[0]! + positions[positions.length - 1]!) / 2;
  return { positions, totalWidth: cursor, barMid };
}

function computeFBExtents(
  husband: PersonPlacement | null,
  wife: PersonPlacement | null,
  kids: readonly PersonPlacement[]
) {
  let minX = 0;
  let maxX = 0;
  if (husband !== null && husband.block !== null) {
    minX = Math.min(minX, husband.x - husband.block.leftWidth);
    maxX = Math.max(maxX, husband.x + husband.block.rightWidth);
  }
  if (wife !== null && wife.block !== null) {
    minX = Math.min(minX, wife.x - wife.block.leftWidth);
    maxX = Math.max(maxX, wife.x + wife.block.rightWidth);
  }
  for (const k of kids) {
    if (k.block !== null) {
      minX = Math.min(minX, k.x - k.block.leftWidth);
      maxX = Math.max(maxX, k.x + k.block.rightWidth);
    }
  }
  return { leftWidth: -minX, rightWidth: maxX };
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
  const extents = computeFBExtents(args.husband, args.wife, args.kids);
  const spec: FamilyBlockSpec = {
    famId: args.famId,
    husband: args.husband,
    wife: args.wife,
    kids: args.kids,
    adultY: 0,
    kidY: ROW_H,
    tieY: args.tieY,
    childAnchor: args.anchor,
    leftWidth: extents.leftWidth,
    rightWidth: extents.rightWidth
  };
  return new FamilyBlock(spec);
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
