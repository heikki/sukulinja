// Those an Entry names who aren't in the tree yet (ADR-0033): made with
// it, from their name, by the Tree context's own adding of a relative, so
// each goes into a family and has its Change. A baptism's new child goes
// into its named parents' family, a new one when they aren't a couple;
// its new parents go in with the child. A marriage's couple is a family
// once it's saved: theirs, or a new one of the two, a new spouse made
// into it. Someone it names must be in the tree already, so the tree
// stays one piece.

import type { Database } from 'bun:sqlite';

import type { EntryEvent } from '@/common/entry-events';
import type { InEntry, Newcomer } from '@/common/operations';
import type { Relation, Sex } from '@/common/types';

import type { Relatives } from '../../persons/relatives';

// A part refused while the Entry is saved: thrown inside its transaction,
// which undoes it, and given back as the save's refusal.
export class NewcomerRefused extends Error {}

const PARENTS: Partial<Record<string, Relation>> = {
  FATH: 'father',
  MOTH: 'mother'
};

// A parent's or a spouse's sex is their Role's.
const ROLE_SEX = { FATH: 'M', MOTH: 'F', HUSB: 'M', WIFE: 'F' } as const;

// The name of someone new in the Role, their sex the Role's where it has
// one.
function named(newcomer: Newcomer, role: string | null) {
  const sex = ROLE_SEX[role as keyof typeof ROLE_SEX] as Sex | undefined;
  return sex === undefined ? newcomer.name : { ...newcomer.name, sex };
}

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
  if (event !== 'CHR' && event !== 'MARR') {
    return 'Only a baptism or a marriage names someone new.';
  }
  if (people.every((p) => p.personId < 0)) return 'Name someone in the tree.';
  return null;
}

interface Placing {
  relatives: Relatives;
  // The family the two people are a couple in, if they are.
  coupleOf: (a: number, b: number) => number | null;
  // For an Entry edited, not made.
  editing: boolean;
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
  const child = people.find((p) => p.role === 'CHIL')?.personId ?? null;
  const fresh = child === null ? undefined : newcomer.get(child);
  const childId =
    fresh === undefined ? child : placeChild(placing, fresh, parents);
  if (fresh !== undefined) ids.set(fresh.personId, childId!);

  for (const p of parents.filter((q) => q.personId < 0)) {
    if (childId === null) {
      throw new NewcomerRefused('Name the child to make their parents.');
    }
    const made = added(
      placing.relatives.add(childId, {
        relation: PARENTS[p.role!]!,
        who: named(newcomer.get(p.personId)!, p.role),
        familyId: null
      })
    );
    ids.set(p.personId, made);
  }
  return ids;
}

// Makes a marriage's couple a family: theirs if they're one, else a new
// one of the two, a new spouse made into it. An edit makes a family only
// with a new spouse: one of two in the tree isn't made again (ADR-0037). The ids newcomers are made
// with, by the number that stood for them.
function placeMarriage(
  { relatives, coupleOf, editing }: Placing,
  people: InEntry[],
  newcomers: Newcomer[]
) {
  const ids = new Map<number, number>();
  const groom = people.find((p) => p.role === 'HUSB');
  const bride = people.find((p) => p.role === 'WIFE');
  if (groom === undefined || bride === undefined) return ids;
  const [known, other] = groom.personId > 0 ? [groom, bride] : [bride, groom];
  if (
    other.personId > 0 &&
    (editing || coupleOf(known.personId, other.personId) !== null)
  ) {
    return ids;
  }
  const fresh = newcomers.find((n) => n.personId === other.personId);
  const made = added(
    relatives.add(known.personId, {
      relation: 'spouse',
      who:
        fresh === undefined
          ? { personId: other.personId }
          : named(fresh, other.role),
      familyId: null
    })
  );
  if (fresh !== undefined) ids.set(fresh.personId, made);
  return ids;
}

// How each kind of Entry makes its people and family.
const PLACING: Partial<
  Record<
    string,
    (p: Placing, people: InEntry[], n: Newcomer[]) => Map<number, number>
  >
> = { CHR: placeBaptism, MARR: placeMarriage };

export function entryNewcomers(db: Database, relatives: Relatives) {
  const couple = db.prepare<{ id: number }, [number, number]>(
    `SELECT id FROM families
     WHERE (husband_id = ?1 AND wife_id = ?2) OR (husband_id = ?2 AND wife_id = ?1)
     ORDER BY id LIMIT 1`
  );
  function coupleOf(a: number, b: number) {
    return couple.get(a, b)?.id ?? null;
  }

  return {
    // Makes the newcomers the people name in an Entry of the Event, and a
    // marriage's couple a family, but in an edit (`placeMarriage`); gives
    // the people with the ids they were made with. Run inside the Entry's
    // transaction; throws NewcomerRefused.
    make(
      event: EntryEvent | null,
      people: InEntry[],
      newcomers: Newcomer[],
      editing = false
    ): InEntry[] {
      const place = PLACING[event ?? ''];
      const placing = { relatives, coupleOf, editing };
      const ids =
        place?.(placing, people, newcomers) ?? new Map<number, number>();
      return people.map((p) => ({
        ...p,
        personId: ids.get(p.personId) ?? p.personId
      }));
    }
  };
}
