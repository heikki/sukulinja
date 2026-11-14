// Putting someone in place as a person's relative, now that the tree is
// worked on in the app (ADR-0021): a new person, or someone already in the
// tree linked. They go into the family the relation says, made when there's
// none, so no one is added with no place in the tree. Each is a Change on
// the relative, and brings the records it touched up to now in their CHAN.

import type { Database } from 'bun:sqlite';

import type { NewRelative, Relation, RelativeWho } from '@/common/types';

import type { NewChange } from '../changes/changes';
import { touchRecord } from '../datasets/records';
import { joinAsChild } from './membership';
import { plainName, refusedName } from './names';
import { createRecords } from './records';

export type RelativeAnswer = { id: number } | { rejected: string } | null;

interface FamilyRecord {
  id: number;
  husband_id: number | null;
  wife_id: number | null;
}

// Where the relative goes as the relation of the person, worked out
// before anything is written: into a family the person has, in a parent's
// place or as a child, or into a new family, with the person in it as
// what.
type Plan =
  | { into: number; as: 'husband' | 'wife' | 'child' }
  | {
      husband: 'relative' | 'person' | null;
      wife: 'relative' | 'person' | null;
      children: Array<'relative' | 'person'>;
    };

type Placed = Plan | { rejected: string };

interface Person {
  id: number;
  sex: string | null;
}

function rejected(words: string) {
  return { rejected: words };
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
  const familyOf = db.prepare<FamilyRecord, [number]>(
    'SELECT id, husband_id, wife_id FROM families WHERE id = ?'
  );
  const setParent = {
    husband: db.prepare<null, [number, number]>(
      'UPDATE families SET husband_id = ? WHERE id = ?'
    ),
    wife: db.prepare<null, [number, number]>(
      'UPDATE families SET wife_id = ? WHERE id = ?'
    )
  };
  function addChild(familyId: number, personId: number) {
    joinAsChild(db, familyId, personId);
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
        ? { husband: null, wife: 'relative', children: ['person'] }
        : { husband: 'relative', wife: null, children: ['person'] };
    }
    const slot = parentSlot(parents, relation);
    if (slot === null) return rejected('They have two parents already.');
    return { into: parents.id, as: slot };
  }

  // A spouse starts a new family with the person, a woman in the wife's
  // place.
  function asSpouse(person: Person): Placed {
    return person.sex === 'F'
      ? { husband: 'relative', wife: 'person', children: [] }
      : { husband: 'person', wife: 'relative', children: [] };
  }

  // A sibling goes into the person's parents' family, or a new one with
  // no parents.
  function asSibling(person: Person): Placed {
    const parents = parentFamilyOf.get(person.id);
    return parents === null
      ? { husband: null, wife: null, children: ['person', 'relative'] }
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
      ? { husband: null, wife: 'person', children: ['relative'] }
      : { husband: 'person', wife: null, children: ['relative'] };
  }

  // The Plan for the relative, or why they can't go anywhere.
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

  // Carries out the plan for the relative: the family it put them in.
  function apply(p: Plan, personId: number, relativeId: number) {
    if ('into' in p) {
      if (p.as === 'child') addChild(p.into, relativeId);
      else setParent[p.as].run(relativeId, p.into);
      return p.into;
    }
    function idOf(who: 'relative' | 'person') {
      return who === 'relative' ? relativeId : personId;
    }
    const familyId = records.family(
      p.husband === null ? null : idOf(p.husband),
      p.wife === null ? null : idOf(p.wife)
    );
    for (const child of p.children) addChild(familyId, idOf(child));
    return familyId;
  }

  // Why someone already in the tree can't be put in the place the plan
  // says; null when they can. A child or sibling can have no other
  // parents, and no one is put where they already are.
  function refusedLink(
    person: Person,
    relativeId: number,
    relation: Relation,
    p: Plan
  ) {
    if ('into' in p && p.as !== 'child') {
      const parents = familyOf.get(p.into)!;
      if (parents.husband_id === relativeId || parents.wife_id === relativeId) {
        return rejected('They are a parent there already.');
      }
    }
    const goesAsChild =
      'into' in p ? p.as === 'child' : p.children.includes('relative');
    if (goesAsChild && parentFamilyOf.get(relativeId) !== null) {
      return rejected('They are a child in another family already.');
    }
    const spouses = spouseFamiliesOf.all(person.id);
    const married = spouses.some(
      (f) => f.husband_id === relativeId || f.wife_id === relativeId
    );
    return relation === 'spouse' && married
      ? rejected('They are spouses already.')
      : null;
  }

  // The Plan for the relative, a new person or `linked`, or why it can't
  // be carried out.
  function placing(
    person: Person,
    relative: NewRelative,
    linked: Person | undefined
  ): Placed {
    const { who } = relative;
    if (linked?.id === person.id) {
      return rejected("They can't be their own relative.");
    }
    const refusedNew = 'personId' in who ? null : refusedName(who);
    if (refusedNew !== null) return refusedNew;
    const placed = plan(person, relative);
    if ('rejected' in placed || linked === undefined) return placed;
    return refusedLink(person, linked.id, relative.relation, placed) ?? placed;
  }

  // The relative's id: one already in the tree, or a new person's.
  function idOfWho(who: RelativeWho) {
    if ('personId' in who) return who.personId;
    return records.person(
      { given: who.given.trim(), surname: who.surname.trim() },
      who.sex
    );
  }

  return {
    // Puts the relative in place as the relation of the person: the
    // relative's id, a new person's made here. Null when there's no such
    // person, or no such relative to link.
    add(personId: number, relative: NewRelative): RelativeAnswer {
      const person = personOf.get(personId);
      const { who } = relative;
      const linked = 'personId' in who ? personOf.get(who.personId) : undefined;
      if (person === null || linked === null) return null;
      const placed = placing(person, relative, linked);
      if ('rejected' in placed) return placed;
      const of = plainName(nameOf.get(personId)?.full_text ?? '');
      return db.transaction(() => {
        const relativeId = idOfWho(who);
        const familyId = apply(placed, personId, relativeId);
        touchRecord(db, { table: 'families', id: familyId });
        touchRecord(db, { table: 'persons', id: personId });
        touchRecord(db, { table: 'persons', id: relativeId });
        changed({
          on: { personId: relativeId },
          what: {
            kind: 'person',
            did: 'personId' in who ? 'link' : 'add',
            relation: relative.relation,
            of
          }
        });
        return { id: relativeId };
      })();
    }
  };
}

export type Relatives = ReturnType<typeof createRelatives>;
