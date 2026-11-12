import type { Relation, Sex } from '@/common/types';

import type { FamilyIndices } from '../person-panel/family';
import { formatName } from '../tree-view/renderer';

// The relations a new person can be added as, in the card menu's order.
const RELATIONS: Relation[] = [
  'father',
  'mother',
  'spouse',
  'child',
  'sibling'
];

// What the menu and the form call each.
export const RELATION_LABELS: Record<Relation, string> = {
  father: 'Father',
  mother: 'Mother',
  spouse: 'Spouse',
  child: 'Child',
  sibling: 'Sibling'
};

// A family a child can go into: the person's as a spouse, named by the
// other parent.
export interface ChildFamily {
  familyId: number;
  label: string;
}

// The relations someone can be added as for the person: a father or a
// mother while they have fewer than two parents and none of that sex, and
// any spouse, child or sibling.
export function addableRelations(personId: number, ix: FamilyIndices) {
  const parents = ix.parentFamByPerson.get(personId);
  const known = [parents?.husband_id, parents?.wife_id].flatMap((id) => {
    const p = id === null || id === undefined ? undefined : ix.persons.get(id);
    return p === undefined ? [] : [p];
  });
  const full =
    parents !== undefined &&
    [parents.husband_id, parents.wife_id].every((id) => id !== null);
  return RELATIONS.filter((r) => {
    if (r !== 'father' && r !== 'mother') return true;
    const sex = r === 'father' ? 'M' : 'F';
    return !full && !known.some((p) => p.sex === sex);
  });
}

// The sex a new person of the relation starts with: a father's and a
// mother's are known, a spouse's is likely the other's.
export function startingSex(relation: Relation, personSex: string | null): Sex {
  if (relation === 'father') return 'M';
  if (relation === 'mother') return 'F';
  if (relation === 'spouse' && personSex === 'M') return 'F';
  if (relation === 'spouse' && personSex === 'F') return 'M';
  return 'U';
}

// The families a child of the person can go into, when there's a choice:
// each of theirs as a spouse, named by the other parent. Empty for one or
// none, where the server knows where the child goes.
export function childFamilies(
  personId: number,
  ix: FamilyIndices
): ChildFamily[] {
  const families = ix.spouseFamsByPerson.get(personId) ?? [];
  if (families.length < 2) return [];
  return families.map((f) => {
    const otherId = f.husband_id === personId ? f.wife_id : f.husband_id;
    const other = otherId === null ? undefined : ix.persons.get(otherId);
    return {
      familyId: f.id,
      label:
        other === undefined
          ? 'with no other parent'
          : `with ${formatName(other)}`
    };
  });
}
