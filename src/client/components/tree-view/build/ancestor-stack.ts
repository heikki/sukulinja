// Bloodline-only Ancestor stack — the recursive pyramid above Parent row.
// Returns the parent FamilyNode of `kidId` with the kids slot supplied by
// the caller (single Anchor at depth ≥ 2; full Aunts/Uncles sibship at
// depth 1 from parent-row). Tie position follows ADR-0001.

import type { FamilyNode, PersonSlot } from '../nodes/family-node';
import { PersonNode } from '../nodes/person-node';
import { buildCenteredFamily } from './family';
import { isPersonKnown } from './indices';
import type { LayoutIndices } from './indices';

export function buildAncestorStack(
  kidId: number,
  kidDepth: number,
  kidChartX: number,
  kids: readonly PersonSlot[],
  ix: LayoutIndices
): FamilyNode | null {
  if (kidDepth >= ix.levels) return null;
  const fam = ix.parentFamByPerson.get(kidId);
  if (fam === undefined) return null;

  const kidSex = ix.persons.get(kidId)?.sex;
  // ancestorLevels (set by buildChart from actual depth) is what makes
  // the pyramid compact when ancestry is shallower than the slider.
  const effectiveLevels = ix.ancestorLevels ?? ix.levels;
  const tieXLocal = ancestorShift(kidSex, kidDepth, effectiveLevels);
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
  const kid: PersonSlot = { node: null, personId, localX: 0 };
  const childhood = buildAncestorStack(personId, depth, chartX, [kid], ix);
  return new PersonNode(personId, childhood, [], null);
}

// ADR-0001: signed slot offset — magnitude (2^remainingAbove − 1) / 2,
// sign by kid sex (male → left/negative, female → right/positive).
function ancestorShift(
  kidSex: string | null | undefined,
  kidDepth: number,
  levels: number
) {
  const remainingAbove = Math.max(1, levels - kidDepth);
  const magnitude = (2 ** remainingAbove - 1) / 2;
  return kidSex === 'F' ? magnitude : -magnitude;
}
