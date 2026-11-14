// Taking a person out of a family, as a child or as a parent, they
// themself staying in the tree (membership.ts says what becomes of the
// family). Nothing that would cut the tree in two is
// done (tree-cut.ts). A Change on the person, and the family's CHAN
// brought up to now.

import type { Database } from 'bun:sqlite';

import { unlinkCuts } from '@/common/tree-cut';

import type { NewChange } from '../changes/changes';
import { touchRecord } from '../datasets/records';
import { createTree } from '../tree';
import { leaveFamily } from './membership';
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
      db.transaction(() => {
        leaveFamily(db, personId, family);
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
