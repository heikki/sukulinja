// A person leaving a family, as a parent or a child: a family left with no
// one in it goes, with what it held; one left with someone stays, its
// CHAN brought up to now.

import type { Database } from 'bun:sqlite';

import type { FamilyRow } from '@/common/types';

import { deleteFamily, touchRecord } from '../datasets/records';

export function leaveFamily(db: Database, personId: number, f: FamilyRow) {
  const asParent = f.husband_id === personId || f.wife_id === personId;
  if (asParent) {
    db.run(
      `UPDATE families SET
         husband_id = CASE WHEN husband_id = ?1 THEN NULL ELSE husband_id END,
         wife_id = CASE WHEN wife_id = ?1 THEN NULL ELSE wife_id END
       WHERE id = ?2`,
      [personId, f.id]
    );
  } else {
    db.run(
      'DELETE FROM family_children WHERE person_id = ? AND family_id = ?',
      [personId, f.id]
    );
  }
  const parents = [f.husband_id, f.wife_id].filter((id) => id !== null);
  if (parents.length + f.child_ids.length <= 1) deleteFamily(db, f.id);
  else touchRecord(db, { table: 'families', id: f.id });
}
