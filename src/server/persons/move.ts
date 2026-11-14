// Moving a person from a family to another, as a child to other parents or
// as a parent to another spouse, in one go: a child linked to the wrong
// parents is put right without cutting the tree on the way. Judged on the
// result (tree-cut.ts); the family left is dealt with as membership.ts
// says. A Change on the person, and both families' CHAN brought up to now.

import type { Database } from 'bun:sqlite';

import { descendantsOf, membersOf, moveCuts } from '@/common/tree-cut';
import type { MoveTarget } from '@/common/tree-cut';
import type { FamilyRow } from '@/common/types';

import type { NewChange } from '../changes/changes';
import { touchRecord } from '../datasets/records';
import { createTree } from '../tree';
import { joinAsChild, leaveFamily } from './membership';
import { plainName } from './names';
import { createRecords } from './records';

export type MoveAnswer = { id: number } | { rejected: string } | null;

function rejected(words: string) {
  return { rejected: words };
}

// The place free for a parent: the husband's, else the wife's; null when
// both are taken.
function freeSlot(f: FamilyRow) {
  if (f.husband_id === null) return 'husband_id' as const;
  if (f.wife_id === null) return 'wife_id' as const;
  return null;
}

// Why the person can't go into the family there is as a child, or as a
// parent; null when they can.
function refusedFamily(
  families: readonly FamilyRow[],
  personId: number,
  to: FamilyRow,
  asParent: boolean
) {
  if (membersOf(to).includes(personId)) {
    return 'They are in that family already.';
  }
  if (asParent) {
    return freeSlot(to) === null
      ? 'That family has two parents already.'
      : null;
  }
  const below = descendantsOf(families, personId);
  const parents = [to.husband_id, to.wife_id];
  return parents.some((id) => id !== null && below.has(id))
    ? "They can't be a child of their own descendant."
    : null;
}

// Why the person can't go into a new family with `otherId`; null when
// they can.
function refusedPerson(
  families: readonly FamilyRow[],
  personId: number,
  otherId: number,
  asParent: boolean
) {
  if (otherId === personId) return "They can't be their own relative.";
  if (asParent) return null;
  return descendantsOf(families, personId).has(otherId)
    ? "They can't be a child of their own descendant."
    : null;
}

export function createMove(db: Database, changed: (change: NewChange) => void) {
  const tree = createTree(db);
  const records = createRecords(db);
  const personOf = db.prepare<{ id: number; sex: string | null }, [number]>(
    'SELECT id, sex FROM persons WHERE id = ?'
  );
  const nameOf = db.prepare<{ full_text: string }, [number]>(
    'SELECT full_text FROM names WHERE person_id = ? ORDER BY sort_order LIMIT 1'
  );

  function namesOf(ids: Array<number | null>) {
    return ids
      .flatMap((id) => {
        const row = id === null ? null : nameOf.get(id);
        return row === null ? [] : [plainName(row.full_text)];
      })
      .join(' and ');
  }

  // Why the move can't be made; null when it can.
  function refused(
    families: readonly FamilyRow[],
    personId: number,
    to: MoveTarget,
    asParent: boolean
  ) {
    if ('personId' in to) {
      if (personOf.get(to.personId) === null) return 'There is no such person.';
      return refusedPerson(families, personId, to.personId, asParent);
    }
    const target = families.find((f) => f.id === to.familyId);
    if (target === undefined) return 'There is no such family.';
    return refusedFamily(families, personId, target, asParent);
  }

  // A new family with `otherId` as a parent, a woman in the wife's place:
  // with the person as the other parent, or as its child.
  function newFamily(personId: number, otherId: number, asParent: boolean) {
    const otherIsWife = personOf.get(otherId)?.sex === 'F';
    const partner = asParent ? personId : null;
    return otherIsWife
      ? records.family(partner, otherId)
      : records.family(otherId, partner);
  }

  // Puts the person in the target, as a child or a parent: the family.
  function join(
    families: readonly FamilyRow[],
    personId: number,
    to: MoveTarget,
    asParent: boolean
  ) {
    if ('personId' in to) {
      const id = newFamily(personId, to.personId, asParent);
      if (!asParent) joinAsChild(db, id, personId);
      return id;
    }
    if (asParent) {
      const slot = freeSlot(families.find((f) => f.id === to.familyId)!)!;
      db.run(`UPDATE families SET ${slot} = ? WHERE id = ?`, [
        personId,
        to.familyId
      ]);
    } else joinAsChild(db, to.familyId, personId);
    return to.familyId;
  }

  return {
    // Moves the person out of the family `from` to `to`, as what they were
    // in `from`: their id. Null when they aren't in `from`.
    move(personId: number, from: number, to: MoveTarget): MoveAnswer {
      const families = tree.families();
      const old = families.find((f) => f.id === from);
      if (old === undefined || !membersOf(old).includes(personId)) return null;
      const asParent = old.husband_id === personId || old.wife_id === personId;
      const why = refused(families, personId, to, asParent);
      if (why !== null) return rejected(why);
      if (moveCuts(families, personId, from, to)) {
        return rejected('That would cut someone off from the tree.');
      }
      db.transaction(() => {
        leaveFamily(db, personId, old);
        const familyId = join(families, personId, to, asParent);
        const joined = tree.families().find((f) => f.id === familyId)!;
        touchRecord(db, { table: 'families', id: familyId });
        touchRecord(db, { table: 'persons', id: personId });
        const parents = [joined.husband_id, joined.wife_id];
        changed({
          on: { personId },
          what: {
            kind: 'person',
            did: 'move',
            relation: asParent ? 'spouse' : 'child',
            of: namesOf(parents.filter((id) => id !== personId))
          }
        });
      })();
      return { id: personId };
    }
  };
}

export type Move = ReturnType<typeof createMove>;
