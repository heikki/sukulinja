// Those an Entry names who aren't in the tree yet (ADR-0033): made with
// it, from their name, by the Tree context's own adding of a relative, so
// each goes into a family and has its Change. A baptism's new child goes
// into its named parents' family, a new one when they aren't a couple;
// its new parents go in with the child. Someone it names must be in the
// tree already, so the tree stays one piece.

import type { Database } from 'bun:sqlite';

import type { EntryEvent } from '@/common/entry-events';
import type { InEntry, Newcomer } from '@/common/operations';
import type { Relation } from '@/common/types';

import type { Relatives } from '../../persons/relatives';

// A part refused while the Entry is saved: thrown inside its transaction,
// which undoes it, and given back as the save's refusal.
export class NewcomerRefused extends Error {}

const PARENTS: Partial<Record<string, Relation>> = {
  FATH: 'father',
  MOTH: 'mother'
};

// A parent's sex is their Role's.
const PARENT_SEX = { FATH: 'M', MOTH: 'F' } as const;

// Why the newcomers can't be made with the Entry of the Event naming the
// people; null when they can. Each one named once, every one named, none
// named who isn't one, and someone in the tree named too.
export function newcomersRefusal(
  event: EntryEvent | null,
  people: InEntry[],
  newcomers: Newcomer[]
) {
  const named = people.filter((p) => p.personId < 0).map((p) => p.personId);
  const made = newcomers.map((n) => n.personId);
  const same =
    named.length === made.length &&
    new Set(made).size === made.length &&
    named.every((id) => made.includes(id));
  if (!same) return 'Someone new is named twice, or not at all.';
  if (made.length === 0) return null;
  if (event !== 'CHR') return 'Only a baptism names someone new yet.';
  if (people.every((p) => p.personId < 0)) return 'Name someone in the tree.';
  return null;
}

interface Placing {
  relatives: Relatives;
  // The family the two people are a couple in, if they are.
  coupleOf: (a: number, b: number) => number | null;
}

// The id of the person put in place, or the refusal thrown.
function added(answer: ReturnType<Relatives['add']>) {
  if (answer === null) throw new NewcomerRefused('No such person.');
  if ('rejected' in answer) throw new NewcomerRefused(answer.rejected);
  return answer.id;
}

// A baptism's new child, made into its named parents' family: theirs
// when the two in the tree are a couple or one is named alone, else a new
// one of the first, the other in the tree joining it. Their id as made.
function placeChild(
  { relatives, coupleOf }: Placing,
  child: Newcomer,
  parents: InEntry[]
) {
  const [first, second] = parents.filter((p) => p.personId > 0);
  if (first === undefined) {
    throw new NewcomerRefused('Name a parent in the tree, or the child.');
  }
  const couple =
    second === undefined ? null : coupleOf(first.personId, second.personId);
  const alone = parents.length > 1 && couple === null;
  const childId = added(
    relatives.add(first.personId, {
      relation: 'child',
      who: child.name,
      familyId: couple ?? (alone ? 'new' : null)
    })
  );
  if (second !== undefined && couple === null) {
    added(
      relatives.add(childId, {
        relation: PARENTS[second.role!]!,
        who: { personId: second.personId },
        familyId: null
      })
    );
  }
  return childId;
}

// Makes a baptism's newcomers, its child first: the ids they're made
// with, by the number that stood for them. Run inside the Entry's
// transaction; throws NewcomerRefused.
function placeBaptism(
  placing: Placing,
  people: InEntry[],
  newcomers: Newcomer[]
) {
  const ids = new Map<number, number>();
  const newcomer = new Map(newcomers.map((n) => [n.personId, n]));
  const parents = people.filter((p) => PARENTS[p.role ?? ''] !== undefined);
  const named = people.find((p) => p.role === 'CHIL')?.personId ?? null;
  const fresh = named === null ? undefined : newcomer.get(named);
  const childId =
    fresh === undefined ? named : placeChild(placing, fresh, parents);
  if (fresh !== undefined) ids.set(fresh.personId, childId!);

  for (const p of parents.filter((q) => q.personId < 0)) {
    if (childId === null) {
      throw new NewcomerRefused('Name the child to make their parents.');
    }
    const role = p.role as 'FATH' | 'MOTH';
    const { given, surname } = newcomer.get(p.personId)!.name;
    const made = added(
      placing.relatives.add(childId, {
        relation: PARENTS[role]!,
        who: { given, surname, sex: PARENT_SEX[role] },
        familyId: null
      })
    );
    ids.set(p.personId, made);
  }
  return ids;
}

export function entryNewcomers(db: Database, relatives: Relatives) {
  const couple = db.prepare<{ id: number }, [number, number]>(
    `SELECT id FROM families
     WHERE (husband_id = ?1 AND wife_id = ?2) OR (husband_id = ?2 AND wife_id = ?1)
     ORDER BY id LIMIT 1`
  );
  const placing: Placing = {
    relatives,
    coupleOf: (a, b) => couple.get(a, b)?.id ?? null
  };

  return {
    // Makes the newcomers the people name, and gives the people with the
    // ids they were made with. Run inside the Entry's transaction; throws
    // NewcomerRefused.
    make(people: InEntry[], newcomers: Newcomer[]): InEntry[] {
      if (newcomers.length === 0) return people;
      const ids = placeBaptism(placing, people, newcomers);
      return people.map((p) => ({
        ...p,
        personId: ids.get(p.personId) ?? p.personId
      }));
    }
  };
}
