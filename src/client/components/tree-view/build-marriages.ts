// Low-level FamilyBlock construction utilities — packing, extents, and the
// final FB assembly from pre-computed adult/kid placements. Higher-level
// step-fam logic lives in build-step-fams.ts; PB builders + parent FB
// orchestration live in build-tree.ts.

import type { Block } from './block';
import { FamilyBlock } from './block-family';
import type {
  AdultPlacement,
  FamilyBlockSpec,
  KidPlacement
} from './block-family';
import { ROW_H, SIBLING_GAP } from './helpers';

export interface PackedBlocks {
  positions: number[];
  totalWidth: number;
  barMid: number;
}

export function packBlocks(blocks: readonly Block[]): PackedBlocks {
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

export interface ExtentArgs {
  husband: AdultPlacement | null;
  wife: AdultPlacement | null;
  kids: readonly KidPlacement[];
}

export function computeFBExtents(args: ExtentArgs): {
  leftWidth: number;
  rightWidth: number;
} {
  let minX = 0;
  let maxX = 0;
  if (args.husband !== null && args.husband.block !== null) {
    minX = Math.min(minX, args.husband.x - args.husband.block.leftWidth);
    maxX = Math.max(maxX, args.husband.x + args.husband.block.rightWidth);
  }
  if (args.wife !== null && args.wife.block !== null) {
    minX = Math.min(minX, args.wife.x - args.wife.block.leftWidth);
    maxX = Math.max(maxX, args.wife.x + args.wife.block.rightWidth);
  }
  for (const k of args.kids) {
    if (k.block !== null) {
      minX = Math.min(minX, k.x - k.block.leftWidth);
      maxX = Math.max(maxX, k.x + k.block.rightWidth);
    }
  }
  return { leftWidth: -minX, rightWidth: maxX };
}

export interface BuildMarriageArgs {
  famId: number;
  husband: AdultPlacement | null;
  wife: AdultPlacement | null;
  kids: KidPlacement[];
  anchorX: number;
  anchorY: number;
  tieY: number;
}

export function buildMarriageFamilyBlock(args: BuildMarriageArgs): FamilyBlock {
  const extents = computeFBExtents({
    husband: args.husband,
    wife: args.wife,
    kids: args.kids
  });
  const spec: FamilyBlockSpec = {
    famId: args.famId,
    husband: args.husband,
    wife: args.wife,
    kids: args.kids,
    adultY: 0,
    kidY: ROW_H,
    tieY: args.tieY,
    childAnchorX: args.anchorX,
    childAnchorY: args.anchorY,
    leftWidth: extents.leftWidth,
    rightWidth: extents.rightWidth
  };
  return new FamilyBlock(spec);
}
