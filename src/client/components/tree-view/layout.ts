// Build the chart root, then emit a flat EmitOutput with focus pinned at
// chart (0, 0). The focus-centering offset is folded into the emit pass's
// starting absolute coord — root.offset is unused at the chart root since
// the root has no parent.

import { buildChartRoot } from './build-tree';
import { emitLayout } from './emit';
import type { LayoutIndices } from './helpers';

export function buildChart(focusId: number, ix: LayoutIndices) {
  const root = buildChartRoot(focusId, ix);
  if (root === null) return null;
  const focusPos = root.personLocalPos(focusId) ?? { x: 0, y: 0 };
  return emitLayout(root, { x: -focusPos.x, y: -focusPos.y });
}
