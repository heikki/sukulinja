// Build the chart root, then re-center it so focus lands at chart (0, 0).

import { renderChartBlocks } from './block';
import type { PlacedBlock } from './block';
import { buildChartRoot } from './build-tree';
import type { LayoutIndices } from './helpers';

export function buildChart(focusId: number, ix: LayoutIndices) {
  const root = buildChartRoot(focusId, ix);
  if (root === null) return null;
  const focusPos = root.personLocalPos(focusId) ?? { x: 0, y: 0 };
  const placed: PlacedBlock = {
    block: root,
    offset: { x: -focusPos.x, y: -focusPos.y }
  };
  return renderChartBlocks([placed], []);
}
