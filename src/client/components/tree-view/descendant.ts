// Descendant tree layout. One bloodline descendant + each of their spouses
// (multi-spouse fan, Husband-left), with children of each Couple hanging
// from that Couple's Child anchor (Tie mid for Primary, secondary spouse's
// box-bottom for non-Primary).
//
// Layout is owned by block.ts (`buildDescendantUnitBlock`). This module
// flattens the Block tree into the legacy DescendantUnit shape (sub +
// rowLeftX + rowRightX) so focus-row.ts and other consumers don't need
// updating until phase 4.
//
// Spouses are rendered at every depth (including the gen limit) so a
// descendant's horizontal extent is the same whether they're being viewed as
// Focus or as a depth=N descendant of their parent. Otherwise toggling focus
// parent ↔ child would change the descendant's sub-layout width and the
// whole row would shift sideways. Only the recursion into the spouse's
// children is gated by the gen limit — handled inside buildDescendantUnitBlock.

import { flattenBlock } from './block';
import { buildDescendantUnitBlock } from './block-descendant';
import { ROW_H } from './helpers';
import type { LayoutIndices, SubLayout } from './helpers';

export interface DescendantUnit {
  sub: SubLayout;
  rowLeftX: number;
  rowRightX: number;
}

export function layoutDescendantUnit(
  personId: number,
  depth: number,
  ix: LayoutIndices
): DescendantUnit {
  const block = buildDescendantUnitBlock(personId, depth, ix);
  const flat = flattenBlock(block, 0, depth * ROW_H);
  return {
    sub: {
      leftWidth: block.leftWidth,
      rightWidth: block.rightWidth,
      nodes: flat.nodes,
      lines: flat.lines
    },
    rowLeftX: block.rowLeftX,
    rowRightX: block.rowRightX
  };
}

export function layoutDescendantTree(
  personId: number,
  depth: number,
  ix: LayoutIndices
): SubLayout {
  return layoutDescendantUnit(personId, depth, ix).sub;
}
