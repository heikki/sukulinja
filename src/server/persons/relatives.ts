// Adding a person to the tree as someone's relative, now that the tree is
// worked on in the app (ADR-0021). The new person goes into the family
// the relation says, made when there's none, so no one is added with no
// place in the tree. Each is a Change on the new person, and brings the
// records it touched up to now in their CHAN.

import type { Database } from 'bun:sqlite';

import type { NewChange, NewRelative, Sex } from '@/common/types';

import { touchRecord } from '../datasets/records';
import { createRecords } from './records';

export type RelativeAnswer = { id: number } | { rejected: string } | null;

interface FamilyRecord {
  id: number;
  husband_id: number | null;
  wife_id: number | null;
}

const SEXES = new Set<Sex>(['M', 'F', 'X', 'U']);

// Where the new person goes as the relation of the person, worked out
// before anything is written: into a family the person has, in a parent's
// place or as a child, or into a new family, with the person in it as
// what.
type Plan =
  | { into: number; as: 'husband' | 'wife' | 'child' }
  | {
      husband: 'new' | 'person' | null;
      wife: 'new' | 'person' | null;
      children: Array<'new' | 'person'>;
    };

type Placed = Plan | { rejected: string };

interface Person {
  id: number;
  sex: string | null;
}

function rejected(words: string) {
  return { rejected: words };
}

// A name as it reads, without GEDCOM's slashes.
function plainName(fullText: string) {
  return fullText.replaceAll('/', ' ').replaceAll(/\s+/g, ' ').trim();
}

export function createRelatives(
  db: Database,
  changed: (change: NewChange) => void
) {
  const records = createRecords(db);
  const personOf = db.prepare<Person, [number]>(
    'SELECT id, sex FROM persons WHERE id = ?'
  );
  const nameOf = db.prepare<{ full_text: string }, [number]>(
    'SELECT full_text FROM names WHERE person_id = ? ORDER BY sort_order LIMIT 1'
  );
  // The family the person is a child in, as the chart draws it: of
  // several, the last.
  const parentFamilyOf = db.prepare<FamilyRecord, [number]>(
    `SELECT f.id, f.husband_id, f.wife_id FROM families f
     JOIN family_children fc ON fc.family_id = f.id
     WHERE fc.person_id = ? ORDER BY f.id DESC LIMIT 1`
  );
  const spouseFamiliesOf = db.prepare<FamilyRecord, [number]>(
    `SELECT id, husband_id, wife_id FROM families
     WHERE husband_id = ?1 OR wife_id = ?1 ORDER BY id`
  );
  const setParent = {
    husband: db.prepare<null, [number, number]>(
      'UPDATE families SET husband_id = ? WHERE id = ?'
    ),
    wife: db.prepare<null, [number, number]>(
      'UPDATE families SET wife_id = ? WHERE id = ?'
    )
  };
  const lastChild = db.prepare<{ last: number | null }, [number]>(
    'SELECT MAX(sort_order) AS last FROM family_children WHERE family_id = ?'
  );
  const insertChild = db.prepare<null, [number, number, number]>(
    `INSERT INTO family_children (family_id, person_id, sort_order)
     VALUES (?, ?, ?)`
  );

  function addChild(familyId: number, personId: number) {
    const order = (lastChild.get(familyId)?.last ?? -1) + 1;
    insertChild.run(familyId, personId, order);
  }

  // A family's first parent is its husband, the second its wife, whatever
  // their sex (GEDCOM 7 allows two of the same): a father takes the
  // husband's place when it's free, a mother the wife's, else whichever
  // is. Null when both are taken.
  function parentSlot(f: FamilyRecord, relation: 'father' | 'mother') {
    const preferred = relation === 'father' ? 'husband' : 'wife';
    const other = relation === 'father' ? 'wife' : 'husband';
    if (f[`${preferred}_id`] === null) return preferred;
    if (f[`${other}_id`] === null) return other;
    return null;
  }

  // A parent goes into the person's parents' family, in the place free,
  // or into a new one of only them.
  function asParent(person: Person, relation: 'father' | 'mother'): Placed {
    const parents = parentFamilyOf.get(person.id);
    if (parents === null) {
      return relation === 'mother'
        ? { husband: null, wife: 'new', children: ['person'] }
        : { husband: 'new', wife: null, children: ['person'] };
    }
    const slot = parentSlot(parents, relation);
    if (slot === null) return rejected('They have two parents already.');
    return { into: parents.id, as: slot };
  }

  // A spouse starts a new family with the person, a woman in the wife's
  // place.
  function asSpouse(person: Person): Placed {
    return person.sex === 'F'
      ? { husband: 'new', wife: 'person', children: [] }
      : { husband: 'person', wife: 'new', children: [] };
  }

  // A sibling goes into the person's parents' family, or a new one with
  // no parents.
  function asSibling(person: Person): Placed {
    const parents = parentFamilyOf.get(person.id);
    return parents === null
      ? { husband: null, wife: null, children: ['person', 'new'] }
      : { into: parents.id, as: 'child' };
  }

  // A child goes into the family picked, or the person's one family, or a
  // new one of only the person.
  function asChild(person: Person, familyId: number | null): Placed {
    const families = spouseFamiliesOf.all(person.id);
    if (familyId !== null) {
      return families.some((f) => f.id === familyId)
        ? { into: familyId, as: 'child' }
        : rejected("They aren't a parent in that family.");
    }
    if (families.length > 1) {
      return rejected('Say which of their families the child is in.');
    }
    if (families.length === 1) return { into: families[0]!.id, as: 'child' };
    return person.sex === 'F'
      ? { husband: null, wife: 'person', children: ['new'] }
      : { husband: 'person', wife: null, children: ['new'] };
  }

  // The Plan for the new person, or why they can't go anywhere.
  function plan(person: Person, relative: NewRelative): Placed {
    switch (relative.relation) {
      case 'father':
      case 'mother':
        return asParent(person, relative.relation);
      case 'spouse':
        return asSpouse(person);
      case 'sibling':
        return asSibling(person);
      case 'child':
        return asChild(person, relative.familyId);
    }
  }

  // Carries out the plan for the new person: the family it put them in.
  function apply(p: Plan, personId: number, newId: number) {
    if ('into' in p) {
      if (p.as === 'child') addChild(p.into, newId);
      else setParent[p.as].run(newId, p.into);
      return p.into;
    }
    function idOf(who: 'new' | 'person') {
      return who === 'new' ? newId : personId;
    }
    const familyId = records.family(
      p.husband === null ? null : idOf(p.husband),
      p.wife === null ? null : idOf(p.wife)
    );
    for (const child of p.children) addChild(familyId, idOf(child));
    return familyId;
  }

  return {
    // Adds the new person as the relation of the person: their id. Null
    // when there's no such person.
    add(personId: number, relative: NewRelative): RelativeAnswer {
      const person = personOf.get(personId);
      if (person === null) return null;
      const given = relative.given.trim();
      const surname = relative.surname.trim();
      if (given === '' && surname === '') return rejected('Write a name.');
      if (given.includes('/') || surname.includes('/')) {
        return rejected("A name can't have a slash in it.");
      }
      if (!SEXES.has(relative.sex)) return rejected('Say their sex.');
      const placed = plan(person, relative);
      if ('rejected' in placed) return placed;
      const of = plainName(nameOf.get(personId)?.full_text ?? '');
      return db.transaction(() => {
        const newId = records.person({ given, surname }, relative.sex);
        const familyId = apply(placed, personId, newId);
        touchRecord(db, { table: 'families', id: familyId });
        touchRecord(db, { table: 'persons', id: personId });
        changed({
          on: { personId: newId },
          what: { kind: 'person', did: 'add', relation: relative.relation, of }
        });
        return { id: newId };
      })();
    }
  };
}

export type Relatives = ReturnType<typeof createRelatives>;
