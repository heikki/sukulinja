// LayoutIndices is the build pipeline's input: maps and counts derived from
// the loaded persons + families that every builder reads from. The query
// helpers below operate against that shape — used across the build/ files
// to filter known persons, present children, and meaningful spouse fams.

import type { FamilyRow, PersonRow } from '@common/types';

export interface LayoutIndices {
  persons: Map<number, PersonRow>;
  parentFamByPerson: Map<number, FamilyRow>;
  spouseFamsByPerson: Map<number, FamilyRow[]>;
  levels: number;
  // Set by buildChart from actual ancestor depth; sizes the pyramid shift
  // so it doesn't reserve space for ancestors that don't exist.
  ancestorLevels?: number;
}

export function otherSpouseOf(fam: FamilyRow, personId: number) {
  if (fam.husband_id === personId) return fam.wife_id;
  if (fam.wife_id === personId) return fam.husband_id;
  return null;
}

export function isPersonKnown(
  personId: number | null,
  ix: LayoutIndices
): personId is number {
  return personId !== null && ix.persons.has(personId);
}

export function presentChildren(fam: FamilyRow, ix: LayoutIndices) {
  return fam.child_ids.filter((cid) => ix.persons.has(cid));
}

// A person has bloodline ancestry if their parent Family lists at least one
// known adult — matches buildAncestorStack's render rule (a couple with both
// adults unknown occupies no row).
export function hasKnownAncestry(personId: number | null, ix: LayoutIndices) {
  if (!isPersonKnown(personId, ix)) return false;
  const fam = ix.parentFamByPerson.get(personId);
  if (fam === undefined) return false;
  return isPersonKnown(fam.husband_id, ix) || isPersonKnown(fam.wife_id, ix);
}

export function isMeaningfulSpouseFam(
  fam: FamilyRow,
  personId: number,
  ix: LayoutIndices
) {
  return (
    presentChildren(fam, ix).length > 0 || otherSpouseOf(fam, personId) !== null
  );
}
