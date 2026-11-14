// Deleting a person, imported or added (ADR-0021): their names, Facts,
// Citations, Tags and notes go with them, and their places in families
// (membership.ts says what becomes of each family). Their Reminders go
// too; their Changes stay, on nothing, naming them. Nothing that would cut
// the tree in two is done (tree-cut.ts), and the last person stays.

import type { Database } from 'bun:sqlite';

import { deleteCuts } from '@/common/tree-cut';

import type { NewChange } from '../changes/changes';
import { deletePersonHeld } from '../datasets/records';
import { createTree } from '../tree';
import { leaveFamily } from './membership';

export type DeleteAnswer = { id: number } | { rejected: string } | null;

export function createDeletion(
  db: Database,
  changed: (change: NewChange) => void
) {
  const tree = createTree(db);
  const count = db.prepare<{ n: number }, []>(
    'SELECT COUNT(*) AS n FROM persons'
  );
  const exists = db.prepare<{ id: number }, [number]>(
    'SELECT id FROM persons WHERE id = ?'
  );
  const deleteRow = db.prepare('DELETE FROM persons WHERE id = ?');

  // Why the person can't be deleted; null when they can.
  function refused(personId: number) {
    if (count.get()!.n <= 1) return "The last person can't be deleted.";
    if (deleteCuts(tree.families(), personId)) {
      return 'That would cut someone off from the tree.';
    }
    return null;
  }

  return {
    // Deletes the person: their id. Null when there's no such person.
    remove(personId: number): DeleteAnswer {
      if (exists.get(personId) === null) return null;
      const why = refused(personId);
      if (why !== null) return { rejected: why };
      db.transaction(() => {
        // Written while they're here, so it names them; it's left on
        // nothing as they go.
        changed({
          on: { personId },
          what: { kind: 'person', did: 'delete' }
        });
        const theirs = tree
          .families()
          .filter(
            (f) =>
              f.husband_id === personId ||
              f.wife_id === personId ||
              f.child_ids.includes(personId)
          );
        for (const f of theirs) leaveFamily(db, personId, f);
        deletePersonHeld(db, personId);
        deleteRow.run(personId);
      })();
      return { id: personId };
    }
  };
}
