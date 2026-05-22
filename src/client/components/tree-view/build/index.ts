// Layout pipeline entry. Focus is the chart root at (0, 0); emit walks the
// tree once and produces a flat EmitOutput.

import { isPersonKnown } from '../helpers';
import type { LayoutIndices } from '../helpers';
import { emitLayout } from './emit';
import type { EmitTheme } from './emit';
import { buildFocusPerson } from './focus-person';

export type { Box, EmitOutput, EmitTheme } from './emit';

export function buildChart(
  focusId: number,
  ix: LayoutIndices,
  theme: EmitTheme
) {
  if (!ix.persons.has(focusId)) return null;
  const effectiveIx: LayoutIndices = {
    ...ix,
    ancestorLevels: actualMaxAncestorDepth(focusId, ix.levels, ix)
  };
  const root = buildFocusPerson(focusId, effectiveIx);
  return emitLayout(root, { x: 0, y: 0 }, theme);
}

// A row counts only if the parent family has at least one known adult —
// matches buildAncestorStack's render rule (a couple with both adults
// unknown returns null and doesn't occupy a row).
function actualMaxAncestorDepth(
  personId: number,
  maxAllowed: number,
  ix: LayoutIndices
): number {
  if (maxAllowed <= 0) return 0;
  const fam = ix.parentFamByPerson.get(personId);
  if (fam === undefined) return 0;
  const fatherId = isPersonKnown(fam.husband_id, ix) ? fam.husband_id : null;
  const motherId = isPersonKnown(fam.wife_id, ix) ? fam.wife_id : null;
  if (fatherId === null && motherId === null) return 0;
  const fatherDepth =
    fatherId !== null
      ? actualMaxAncestorDepth(fatherId, maxAllowed - 1, ix)
      : 0;
  const motherDepth =
    motherId !== null
      ? actualMaxAncestorDepth(motherId, maxAllowed - 1, ix)
      : 0;
  return 1 + Math.max(fatherDepth, motherDepth);
}
