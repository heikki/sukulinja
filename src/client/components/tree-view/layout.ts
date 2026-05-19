// Top-level chart assembly.
//
// Build the chart root (either the parent FamilyBlock or — when focus has no
// known parents within ix.levels — the focus's PersonBlock), then re-center
// it so the focus's PersonBlock lands at chart (0, 0). All recursion lives
// inside the block tree itself (see build-tree.ts and docs/ancestor-refactor.html).

import { renderChartBlocks } from './block';
import type { PlacedBlock, RenderOutput } from './block';
import { buildChartRoot } from './build-tree';
import type { LayoutIndices } from './helpers';

export type { LayoutIndices } from './helpers';

export function buildChart(
  focusId: number,
  ix: LayoutIndices
): RenderOutput | null {
  const root = buildChartRoot(focusId, ix);
  if (root === null) return null;
  const focusPos = root.personLocalPos(focusId) ?? { x: 0, y: 0 };
  const placed: PlacedBlock = {
    block: root,
    offsetX: -focusPos.x,
    offsetY: -focusPos.y
  };
  return renderChartBlocks([placed], []);
}
