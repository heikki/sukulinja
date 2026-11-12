// Taking a person out of a family, as a child or as a parent, they
// themself staying in the tree. A family left with no one in it goes, one
// left with one person stays. Nothing that would cut the tree in two is
// done (tree-cut.ts). A Change on the person, and the family's CHAN
// brought up to now.

import type { Database } from 'bun:sqlite';

import { unlinkCuts } from '@/common/tree-cut';
import type { NewChange } from '@/common/types';

import { deleteFamily, touchRecord } from '../datasets/records';
import { createTree } from '../tree';
import { plainName } from './names';

export type UnlinkAnswer = { id: number } | { rejected: string } | null;

export function createUnlink(
  db: Database,
  changed: (change: NewChange) => void
) {
  const tree = createTree(db);
  const nameOf = db.prepare<{ full_text: string }, [number]>(
    'SELECT full_text FROM names WHERE person_id = ? ORDER BY sort_order LIMIT 1'
  );
  const clearParent = db.prepare<null, [number, number]>(
    `UPDATE families SET
       husband_id = CASE WHEN husband_id = ?1 THEN NULL ELSE husband_id END,
       wife_id = CASE WHEN wife_id = ?1 THEN NULL ELSE wife_id END
     WHERE id = ?2`
  );
  const dropChild = db.prepare<null, [number, number]>(
    'DELETE FROM family_children WHERE person_id = ? AND family_id = ?'
  );

  function nameIn(id: number | null) {
    if (id === null) return [];
    const row = nameOf.get(id);
    return row === null ? [] : [plainName(row.full_text)];
  }

  return {
    // Takes the person out of the family: their id. Null when they aren't
    // in it.
    unlink(personId: number, familyId: number): UnlinkAnswer {
      const families = tree.families();
      const family = families.find((f) => f.id === familyId);
      if (family === undefined) return null;
      const asParent =
        family.husband_id === personId || family.wife_id === personId;
      if (!asParent && !family.child_ids.includes(personId)) return null;
      if (unlinkCuts(families, personId, familyId)) {
        return { rejected: 'That would cut someone off from the tree.' };
      }
      const others = asParent
        ? [family.husband_id, family.wife_id].filter((id) => id !== personId)
        : [family.husband_id, family.wife_id];
      const of = others.flatMap(nameIn).join(' and ');
      const parents = [family.husband_id, family.wife_id].filter(
        (id) => id !== null
      );
      const left = parents.length + family.child_ids.length - 1;
      db.transaction(() => {
        if (asParent) clearParent.run(personId, familyId);
        else dropChild.run(personId, familyId);
        if (left === 0) deleteFamily(db, familyId);
        else touchRecord(db, { table: 'families', id: familyId });
        touchRecord(db, { table: 'persons', id: personId });
        changed({
          on: { personId },
          what: {
            kind: 'person',
            did: 'unlink',
            relation: asParent ? 'spouse' : 'child',
            of
          }
        });
      })();
      return { id: personId };
    }
  };
}

export type Unlink = ReturnType<typeof createUnlink>;
