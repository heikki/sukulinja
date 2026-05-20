// Bloodline-only Ancestor tree construction (depth ≥ 2). At depth 1, lateral
// context (Aunts/Uncles, step-fams, Half-siblings) makes the FB no longer
// pure bloodline — that case stays in build-tree.ts (see ADR-0002). This
// module is the recursive bloodline-pair-to-bloodline-pair structure above
// that, plus the helper that depth-1 uses to place the GP couple.

import { FamilyBlock } from './block-family';
import type { PersonPlacement } from './block-family';
import { PersonBlock } from './block-person';
import { placeInternalCouple } from './build-marriages';
import { HALF_PITCH, isPersonKnown } from './helpers';
import type { LayoutIndices } from './helpers';

export function buildAncestorTree(
  personId: number | null,
  depth: number,
  chartX: number,
  ix: LayoutIndices
): PersonBlock | null {
  if (!isPersonKnown(personId, ix)) return null;
  const childhood = buildAncestorChildhoodFB(personId, depth, chartX, ix);
  return new PersonBlock(personId, childhood, [], null);
}

// Used by build-tree.ts at depth 1 to place the GP couple, and recursively
// inside buildAncestorTree at depth ≥ 2. Returns null when the kid has no
// known parents in scope or recursion would exceed the generation limit.
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
  const tieXFBlocal = ancestorShift(kidSex, kidDepth, ix.levels) * HALF_PITCH;
  const husbandChartX = kidChartX + tieXFBlocal - HALF_PITCH;
  const wifeChartX = kidChartX + tieXFBlocal + HALF_PITCH;
  const husbandPB = buildAncestorTree(
    fam.husband_id,
    kidDepth + 1,
    husbandChartX,
    ix
  );
  const wifePB = buildAncestorTree(fam.wife_id, kidDepth + 1, wifeChartX, ix);
  if (husbandPB === null && wifePB === null) return null;
  return { fam, husbandPB, wifePB, tieXFBlocal };
}

function buildAncestorChildhoodFB(
  kidId: number,
  kidDepth: number,
  kidChartX: number,
  ix: LayoutIndices
) {
  const placed = placeAncestorCouple(kidId, kidDepth, kidChartX, ix);
  if (placed === null) return null;
  const { fam, husbandPB, wifePB, tieXFBlocal } = placed;
  const bloodlineKid: PersonPlacement = {
    id: kidId,
    external: true,
    x: 0,
    block: null
  };
  const couple = placeInternalCouple(husbandPB, wifePB, fam, tieXFBlocal);
  return new FamilyBlock({
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
