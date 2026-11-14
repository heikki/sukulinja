import type { InEntry } from '@/client/dataset-api';
import { bookKind, entryRoles } from '@/common/books';
import type { Relation } from '@/common/types';

import type { FamilyIndices } from '../person-panel/family';
import { choiceOf, familyChoices } from '../person-search/choices';
import type { PersonChoice } from '../person-search/choices';

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

// Whom a baptism's Role may name once its child or a parent is named
// (ADR-0026): the tree says who they are. The child's father or mother in
// the tree, or the named parents' children; whom to make one anew
// (`newAs`, of `relativesOf`); and no one else, by search. Null when it
// isn't a baptism's or no one it hangs on is named yet: then anyone.
export interface RoleChoices {
  choices: PersonChoice[];
  relativesOf: number;
  newAs: Relation;
}

const PARENT_ROLES: Partial<Record<string, Relation>> = {
  FATH: 'father',
  MOTH: 'mother'
};

export function roleChoices(
  volume: string,
  role: string | null,
  named: InEntry[],
  ix: FamilyIndices
): RoleChoices | null {
  if (bookKind(volume) !== 'kastetut' || role === null) return null;
  const parent = PARENT_ROLES[role];
  if (parent !== undefined) {
    const child = named.find((p) => p.role === 'CHIL');
    if (child === undefined) return null;
    const theirs = parentsOf(child.personId, ix).filter((p) => p.role === role);
    return {
      choices: theirs.flatMap(({ personId }) => {
        const p = ix.persons.get(personId);
        return p === undefined ? [] : [choiceOf(p, null)];
      }),
      relativesOf: child.personId,
      newAs: parent
    };
  }
  if (role !== 'CHIL') return null;
  const parents = named.filter((p) => p.role === 'FATH' || p.role === 'MOTH');
  const [first] = parents;
  if (first === undefined) return null;
  const ids = parents.map((p) => p.personId);
  // The families with each named parent in it.
  const families = (ix.spouseFamsByPerson.get(first.personId) ?? []).filter(
    (f) => ids.every((id) => f.husband_id === id || f.wife_id === id)
  );
  const children = families.flatMap((f) => f.child_ids);
  return {
    choices: children.flatMap((id) => {
      const p = ix.persons.get(id);
      return p === undefined ? [] : [choiceOf(p, null)];
    }),
    relativesOf: first.personId,
    newAs: 'child'
  };
}

// What the picker offers for the Role of the pending entry: whom the tree
// says (roleChoices), or the Selected person's family and the search.
// Those in `left` are left out.
export function pickFor(
  entry: { volume: string; role: string | null; named: InEntry[] },
  ix: FamilyIndices,
  selected: number | null,
  left: Set<number>
) {
  const tree = roleChoices(entry.volume, entry.role, entry.named, ix);
  if (tree !== null) {
    return {
      ...tree,
      choices: tree.choices.filter((c) => !left.has(c.personId)),
      search: false
    };
  }
  return {
    choices: selected === null ? [] : familyChoices(selected, ix, left),
    relativesOf: selected,
    newAs: null,
    search: true
  };
}

// A parent's row in a baptism's card (ADR-0026): the child's father or
// mother in the tree, and whether the entry names them. A parent the
// entry names who isn't the tree's shows too, named. `personId` null when
// the tree has none, to make one.
export interface ParentRow {
  role: 'FATH' | 'MOTH';
  personId: number | null;
  named: boolean;
}

export function parentRows(named: InEntry[], ix: FamilyIndices): ParentRow[] {
  const child = named.find((p) => p.role === 'CHIL');
  const tree = child === undefined ? [] : parentsOf(child.personId, ix);
  return (['FATH', 'MOTH'] as const).map((role) => {
    const inEntry = named.find((p) => p.role === role);
    const theirs = tree.find((p) => p.role === role);
    const personId = inEntry?.personId ?? theirs?.personId ?? null;
    return { role, personId, named: inEntry !== undefined };
  });
}

// The entry's people once the child is the one named: the parents named
// before give way to the child's in the tree.
export function withChild(
  named: InEntry[],
  childId: number,
  ix: FamilyIndices
): InEntry[] {
  const parents = parentsOf(childId, ix);
  const placed = new Set([childId, ...parents.map((p) => p.personId)]);
  const others = named.filter(
    (p) =>
      !placed.has(p.personId) &&
      p.role !== 'CHIL' &&
      p.role !== 'FATH' &&
      p.role !== 'MOTH'
  );
  return [{ personId: childId, role: 'CHIL' }, ...others, ...parents];
}
