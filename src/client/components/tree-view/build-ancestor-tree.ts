// Bloodline-only Ancestor tree construction (depth ≥ 2). At depth 1, lateral
// context (Aunts/Uncles, step-fams, Half-siblings) makes the FamilyNode no
// longer pure bloodline — that case stays in build-tree.ts (see ADR-0002).
// This module is the recursive bloodline-pair-to-bloodline-pair structure
// above that, plus the helper that depth-1 uses to place the GP couple.

import { placeInternalCouple } from './build-marriages';
import { HALF_PITCH, isPersonKnown } from './helpers';
import type { LayoutIndices } from './helpers';
import { FamilyNode } from './node-family';
import type { Anchor } from './node-family';
import { PersonNode } from './node-person';

function buildAncestorTree(
  personId: number | null,
  depth: number,
  chartX: number,
  ix: LayoutIndices
): PersonNode | null {
  if (!isPersonKnown(personId, ix)) return null;
  const childhood = buildAncestorChildhoodFN(personId, depth, chartX, ix);
  return new PersonNode(personId, childhood, [], null);
}

// Returns null when the kid has no known parents in scope or recursion
// would exceed the generation limit.
export function placeAncestorCouple(
  kidId: number,
  kidDepth: number,
  kidChartX: number,
  ix: LayoutIndices
) {
  if (kidDepth >= ix.levels) return null;
  const fam = ix.parentFamByPerson.get(kidId);
  if (fam === undefined) return null;
  const kidSex = ix.persons.get(kidId)?.sex;
  const tieXLocal = ancestorShift(kidSex, kidDepth, ix.levels) * HALF_PITCH;
  const husbandChartX = kidChartX + tieXLocal - HALF_PITCH;
  const wifeChartX = kidChartX + tieXLocal + HALF_PITCH;
  const husbandNode = buildAncestorTree(
    fam.husband_id,
    kidDepth + 1,
    husbandChartX,
    ix
  );
  const wifeNode = buildAncestorTree(fam.wife_id, kidDepth + 1, wifeChartX, ix);
  if (husbandNode === null && wifeNode === null) return null;
  return { fam, husbandNode, wifeNode, tieXLocal };
}

function buildAncestorChildhoodFN(
  kidId: number,
  kidDepth: number,
  kidChartX: number,
  ix: LayoutIndices
) {
  const placed = placeAncestorCouple(kidId, kidDepth, kidChartX, ix);
  if (placed === null) return null;
  const { fam, husbandNode, wifeNode, tieXLocal } = placed;
  const bloodlineKid: Anchor = { personId: kidId, localX: 0 };
  const couple = placeInternalCouple(husbandNode, wifeNode, tieXLocal);
  return new FamilyNode({
    famId: fam.id,
    husband: couple.husband,
    wife: couple.wife,
    kids: [bloodlineKid],
    childAnchor: couple.childAnchor,
    tieY: couple.tieY
  });
}

// Directional Tie shift for the bloodline kid's parents, as a signed
// multiplier of HALF_PITCH. Magnitude follows the (2^remainingAbove − 1)
// sequence — 1 at the topmost row, 3 one row lower, 7 two rows lower, etc.
// Sign by the bloodline kid's sex: male's parents fan left (negative),
// female's right (positive). See ADR-0001.
function ancestorShift(
  kidSex: string | null | undefined,
  kidDepth: number,
  levels: number
) {
  const remainingAbove = Math.max(1, levels - kidDepth);
  const magnitude = 2 ** remainingAbove - 1;
  return kidSex === 'F' ? magnitude : -magnitude;
}
