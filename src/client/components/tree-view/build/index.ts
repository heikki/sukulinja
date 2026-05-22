// Layout pipeline entry. Focus is the chart root at (0, 0); emit walks the
// tree once and produces a flat EmitOutput.

import type { LayoutIndices } from '../helpers';
import { emitLayout } from './emit';
import { buildFocusPerson } from './focus-person';

export type { Box, EmitOutput } from './emit';

export function buildChart(focusId: number, ix: LayoutIndices) {
  if (!ix.persons.has(focusId)) return null;
  const root = buildFocusPerson(focusId, ix);
  return emitLayout(root, { x: 0, y: 0 });
}
