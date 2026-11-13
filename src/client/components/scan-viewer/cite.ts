import type { InEntry } from '@/client/dataset-api';
import { bookKind, entryRoles } from '@/common/books';
import type { VolumeCitation } from '@/common/types';

import type { FamilyIndices } from '../person-panel/family';
import { imageOf } from './citations';

// The people listed beside the scan: their Citations link the Image shown,
// Marked, Match or Estimate. An entry isn't cited for them again.
export function citingImage(rows: VolumeCitation[], image: number) {
  return new Set(
    rows.filter((r) => imageOf(r) === image).map((r) => r.personId)
  );
}

// The person's father and mother in the tree, as a baptism names them.
function parentsOf(personId: number, ix: FamilyIndices): InEntry[] {
  const family = ix.parentFamByPerson.get(personId);
  if (family === undefined) return [];
  const parents: InEntry[] = [];
  if (family.husband_id !== null) {
    parents.push({ personId: family.husband_id, role: 'FATH' });
  }
  if (family.wife_id !== null) {
    parents.push({ personId: family.wife_id, role: 'MOTH' });
  }
  return parents;
}

// Who the person is in a marriage, by their sex, if it says.
function spouseRole(sex: string | null) {
  if (sex === 'M') return 'HUSB';
  return sex === 'F' ? 'WIFE' : null;
}

// Whom a new entry in the Volume names to start with (ADR-0026): in a
// baptism, the Selected person as its child and their parents as father
// and mother; in a marriage, them as groom or bride by their sex; in
// another book, them. Those in `citing` are left out.
export function startingPeople(
  volume: string,
  selectedId: number | null,
  ix: FamilyIndices,
  citing: Set<number>
): InEntry[] {
  const self = selectedId === null ? undefined : ix.persons.get(selectedId);
  if (self === undefined) return [];
  const kind = bookKind(volume);
  const people: InEntry[] =
    kind === 'kastetut'
      ? [{ personId: self.id, role: 'CHIL' }, ...parentsOf(self.id, ix)]
      : [
          {
            personId: self.id,
            role: kind === 'vihityt' ? spouseRole(self.sex) : null
          }
        ];
  return people.filter((p) => !citing.has(p.personId));
}

// What a person is chosen as in a new entry of the Volume: their Role's
// label, or "Add person" in a Book with none.
export function roleLabel(volume: string, role: string | null) {
  const found = entryRoles(volume).find((r) => r.role === role);
  return found === undefined ? 'Add person' : found.label;
}
