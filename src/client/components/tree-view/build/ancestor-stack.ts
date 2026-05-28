// Bloodline-only Ancestor stack — the recursive pyramid above Parent row.
// Returns the parent FamilyNode of `kidId` with the kids slot supplied by
// the caller (single Anchor at depth ≥ 2; full Aunts/Uncles sibship at
// depth 1 from parent-row). Tie position follows ADR-0001.

import { buildCenteredFamily } from './family';
import { hasKnownAncestry, isPersonKnown } from './indices';
import type { LayoutIndices } from './indices';
import type { FamilyNode, PersonSlot } from './nodes/family-node';
import { PersonNode } from './nodes/person-node';

export function buildAncestorStack(
  kidId: number,
  kidDepth: number,
  kidChartX: number,
  kids: readonly PersonSlot[],
  ix: LayoutIndices,
  // True when kidId's spouse at this couple has no bloodline ancestry — the
  // shift collapses (see ancestorShift) so a lone pyramid doesn't drift off
  // Focus's column with nothing on the other side to counterweight it.
  siblingEmpty = false
): FamilyNode | null {
  if (kidDepth >= ix.levels) return null;
  const fam = ix.parentFamByPerson.get(kidId);
  if (fam === undefined) return null;

  const kidSex = ix.persons.get(kidId)?.sex;
  // ancestorLevels (set by buildChart from actual depth) keeps the pyramid
  // compact when ancestry is shallower than the slider.
  const effectiveLevels = ix.ancestorLevels ?? ix.levels;
  const tieXLocal = ancestorShift(
    kidSex,
    kidDepth,
    effectiveLevels,
    siblingEmpty
  );
  const husbandChartX = kidChartX + tieXLocal - 0.5;
  const wifeChartX = kidChartX + tieXLocal + 0.5;

  // Each parent's own pyramid (built one level up) collapses when its spouse
  // here has no ancestry — so hand each the OTHER's emptiness.
  const husbandHasAnc = hasKnownAncestry(fam.husband_id, ix);
  const wifeHasAnc = hasKnownAncestry(fam.wife_id, ix);

  const husbandNode = buildAncestorPerson(
    fam.husband_id,
    kidDepth + 1,
    husbandChartX,
    ix,
    !wifeHasAnc
  );
  const wifeNode = buildAncestorPerson(
    fam.wife_id,
    kidDepth + 1,
    wifeChartX,
    ix,
    !husbandHasAnc
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
  ix: LayoutIndices,
  siblingEmpty = false
): PersonNode | null {
  if (!isPersonKnown(personId, ix)) return null;
  const kid: PersonSlot = { node: null, personId, localX: 0 };
  const childhood = buildAncestorStack(
    personId,
    depth,
    chartX,
    [kid],
    ix,
    siblingEmpty
  );
  return new PersonNode(personId, childhood, [], null);
}

// ADR-0001: signed slot offset — magnitude (2^remainingAbove − 1) / 2, sign by
// kid sex (male → left/negative, female → right/positive). That magnitude sizes
// the pyramid for a balanced subtree fanning the opposite way to counterweight
// it; when the sibling ancestry is empty there's nothing to balance, so the lone
// pyramid would hang far off Focus's column. Collapse to the minimum half-slot
// in that case, tucking it back over the bloodline child.
function ancestorShift(
  kidSex: string | null | undefined,
  kidDepth: number,
  levels: number,
  siblingEmpty: boolean
) {
  const remainingAbove = Math.max(1, levels - kidDepth);
  const magnitude = siblingEmpty ? 0.5 : (2 ** remainingAbove - 1) / 2;
  return kidSex === 'F' ? magnitude : -magnitude;
}
