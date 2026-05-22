// Bloodline-only Ancestor stack — the recursive pyramid above Parent row.
// Returns the parent FamilyNode of `kidId` with the kids slot supplied by
// the caller (single Anchor at depth ≥ 2; full Aunts/Uncles sibship at
// depth 1 from parent-row). Tie position follows ADR-0001.

import { isPersonKnown } from '../helpers';
import type { LayoutIndices } from '../helpers';
import type { FamilyNode } from '../nodes/family-node';
import { PersonNode } from '../nodes/person-node';
import type { Anchor, KidSlot } from '../nodes/types';
import { buildCenteredFamily } from './family';

export function buildAncestorStack(
  kidId: number,
  kidDepth: number,
  kidChartX: number,
  kids: readonly KidSlot[],
  ix: LayoutIndices
): FamilyNode | null {
  if (kidDepth >= ix.levels) return null;
  const fam = ix.parentFamByPerson.get(kidId);
  if (fam === undefined) return null;

  const kidSex = ix.persons.get(kidId)?.sex;
  // ADR-0001: tie shifts by (2^n − 1) × HALF_PITCH = ancestorShift × 0.5
  // slots. Adults sit ± 0.5 (one HALF_PITCH) from the tie.
  const tieXLocal = ancestorShift(kidSex, kidDepth, ix.levels) * 0.5;
  const husbandChartX = kidChartX + tieXLocal - 0.5;
  const wifeChartX = kidChartX + tieXLocal + 0.5;

  const husbandNode = buildAncestorPerson(
    fam.husband_id,
    kidDepth + 1,
    husbandChartX,
    ix
  );
  const wifeNode = buildAncestorPerson(
    fam.wife_id,
    kidDepth + 1,
    wifeChartX,
    ix
  );
  if (husbandNode === null && wifeNode === null) return null;

  return buildCenteredFamily({
    famId: fam.id,
    husband: husbandNode,
    wife: wifeNode,
    kids,
    tieXLocal
  });
}

// No marriages: ADR-0002 hides step-fams above Parent row.
function buildAncestorPerson(
  personId: number | null,
  depth: number,
  chartX: number,
  ix: LayoutIndices
): PersonNode | null {
  if (!isPersonKnown(personId, ix)) return null;
  const kid: Anchor = { personId, localX: 0 };
  const childhood = buildAncestorStack(personId, depth, chartX, [kid], ix);
  return new PersonNode(personId, childhood, [], null);
}

// ADR-0001: signed HALF_PITCH multiplier — magnitude (2^remainingAbove − 1),
// sign by kid sex (male → left/negative, female → right/positive).
function ancestorShift(
  kidSex: string | null | undefined,
  kidDepth: number,
  levels: number
) {
  const remainingAbove = Math.max(1, levels - kidDepth);
  const magnitude = 2 ** remainingAbove - 1;
  return kidSex === 'F' ? magnitude : -magnitude;
}
