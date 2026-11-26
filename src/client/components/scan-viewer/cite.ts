import type { InEntry } from '@/client/dataset-api';
import { eventRoles } from '@/common/entry-events';
import type { EntryEvent } from '@/common/entry-events';
import type { Sex } from '@/common/types';

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

// Whom an entry of the Event names, starting from the person (ADR-0026):
// in a baptism, them as its child and their parents as father and
// mother; in a marriage, them as groom or bride by their sex; else them.
function startingFrom(
  event: EntryEvent | null,
  personId: number,
  ix: FamilyIndices
): InEntry[] {
  if (event === 'CHR') {
    return [{ personId, role: 'CHIL' }, ...parentsOf(personId, ix)];
  }
  const sex = ix.persons.get(personId)?.sex ?? null;
  return [{ personId, role: event === 'MARR' ? spouseRole(sex) : null }];
}

// Whom a Church-book reference's entry names once its Box is placed:
// everyone citing its record. In a baptism, one whose parent cites it too
// is its child and those parents its father and mother, as the tree says;
// else they're placed as for an Event chosen anew (withEvent), with
// parents it brings in from the tree but in `citing` left out, as for a
// new entry.
export function placingPeople(
  event: EntryEvent | null,
  citers: number[],
  ix: FamilyIndices,
  citing: Set<number>
): InEntry[] {
  const named = citers.map((personId) => ({ personId, role: null }));
  if (event === null) return named;
  // One with a parent citing it who is no parent of another citing it:
  // a grandparent standing godparent leaves the child its child.
  const parents = new Set(
    citers.flatMap((id) => parentsOf(id, ix)).map((p) => p.personId)
  );
  const child = citers.find(
    (id) =>
      !parents.has(id) &&
      parentsOf(id, ix).some((p) => citers.includes(p.personId))
  );
  if (event === 'CHR' && child !== undefined) {
    const placed: InEntry[] = [
      { personId: child, role: 'CHIL' },
      ...parentsOf(child, ix).filter((p) => citers.includes(p.personId))
    ];
    const others = named.filter(
      (p) => !placed.some((q) => q.personId === p.personId)
    );
    return [...placed, ...others];
  }
  return withEvent(named, event, ix).filter(
    (p) => citers.includes(p.personId) || !citing.has(p.personId)
  );
}

// Whom a new entry of the Event names to start with: from the Selected
// person (startingFrom). Those in `citing` are left out.
export function startingPeople(
  event: EntryEvent | null,
  selectedId: number | null,
  ix: FamilyIndices,
  citing: Set<number>
): InEntry[] {
  if (selectedId === null || !ix.persons.has(selectedId)) return [];
  return startingFrom(event, selectedId, ix).filter(
    (p) => !citing.has(p.personId)
  );
}

// Whom the entry names once its Event is chosen anew (ADR-0033): one
// named in a Role of the new Event keeps it. With no Roles, everyone keeps
// their place, in none. One named in none gets a Role where it fits: the
// only one named as a baptism's child, with their parents in the tree;
// in a marriage, as groom or bride by their sex, where that's free.
export function withEvent(
  named: InEntry[],
  event: EntryEvent,
  ix: FamilyIndices
): InEntry[] {
  const roles = eventRoles(event).map((r) => r.role);
  if (roles.length === 0) return named.map((p) => ({ ...p, role: null }));
  const kept = named.map((p) => ({
    ...p,
    role: p.role !== null && roles.includes(p.role) ? p.role : null
  }));
  if (event === 'CHR') {
    const [only, ...more] = kept;
    return only?.role === null && more.length === 0
      ? startingFrom(event, only.personId, ix)
      : kept;
  }
  return kept.map((p) => {
    if (p.role !== null) return p;
    const role = spouseRole(ix.persons.get(p.personId)?.sex ?? null);
    const free = role !== null && !kept.some((o) => o.role === role);
    return free ? { ...p, role } : p;
  });
}

// What a person is chosen as in a new entry of the Event: their Role's
// label, or "Person" in one with none.
export function rolePickLabel(event: EntryEvent | null, role: string | null) {
  const found = eventRoles(event).find((r) => r.role === role);
  return found === undefined ? 'Person' : found.label;
}

// Whom a baptism's Role may name once its child or a parent is named
// (ADR-0026): the tree says who they are. The child's father or mother in
// the tree, or the named parents' children; and no one else, by search,
// but someone new. Null when it isn't a baptism's or no one it hangs on
// is named yet: then anyone.
export interface RoleChoices {
  choices: PersonChoice[];
}

// Someone new the Role can name, made with the Entry (ADR-0033): who
// they are in it ("father"), and their sex, a parent's by the Role, a
// child's asked (null).
export interface NewOne {
  label: string;
  sex: Sex | null;
}

const NEW_ONES: Partial<Record<string, Partial<Record<string, NewOne>>>> = {
  CHR: {
    CHIL: { label: 'child', sex: null },
    FATH: { label: 'father', sex: 'M' },
    MOTH: { label: 'mother', sex: 'F' }
  },
  MARR: {
    HUSB: { label: 'groom', sex: 'M' },
    WIFE: { label: 'bride', sex: 'F' }
  }
};

// Whom the Role can name anew: a baptism's child or parent, a marriage's
// groom or bride; null for any other.
export function newOneFor(event: EntryEvent | null, role: string | null) {
  return NEW_ONES[event ?? '']?.[role ?? ''] ?? null;
}

export function roleChoices(
  event: EntryEvent | null,
  role: string | null,
  named: InEntry[],
  ix: FamilyIndices
): RoleChoices | null {
  if (event !== 'CHR' || role === null) return null;
  if (role === 'FATH' || role === 'MOTH') {
    const child = named.find((p) => p.role === 'CHIL');
    if (child === undefined) return null;
    const theirs = parentsOf(child.personId, ix).filter((p) => p.role === role);
    return {
      choices: theirs.flatMap(({ personId }) => {
        const p = ix.persons.get(personId);
        return p === undefined ? [] : [choiceOf(p, null)];
      })
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
    })
  };
}

// What the picker offers for the Role of the pending entry: whom the tree
// says (roleChoices), or the Selected person's family and the search; and
// someone new where the Role can name them. Those in `left` are left out.
export function pickFor(
  entry: { event: EntryEvent | null; role: string | null; named: InEntry[] },
  ix: FamilyIndices,
  selected: number | null,
  left: Set<number>
) {
  const newOne = newOneFor(entry.event, entry.role);
  const tree = roleChoices(entry.event, entry.role, entry.named, ix);
  if (tree !== null) {
    return {
      choices: tree.choices.filter((c) => !left.has(c.personId)),
      newOne,
      search: false
    };
  }
  return {
    choices: selected === null ? [] : familyChoices(selected, ix, left),
    newOne,
    search: true
  };
}

// A parent's row in a baptism's Entry pane (ADR-0026): the child's father or
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
// before give way to the child's in the tree. A new child, with none in
// the tree, keeps them.
export function withChild(
  named: InEntry[],
  childId: number,
  ix: FamilyIndices
): InEntry[] {
  const parents =
    childId < 0
      ? named.filter((p) => p.role === 'FATH' || p.role === 'MOTH')
      : parentsOf(childId, ix);
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
