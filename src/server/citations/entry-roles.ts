// Who is who in a baptism Entry (ADR-0026), where its Citations don't say:
// those converted from references whose ROLE wasn't read, or made before
// Roles were asked. The tree tells: one whose parent is in it is its
// child, the husband and wife of a family whose child is in it its father
// and mother. A Citation with a Role of a baptism keeps it; one the tree
// doesn't place stays without.

import type { Database } from 'bun:sqlite';

import { bookKind } from '@/common/books';

const UNPLACED = `c.entry_id = $entry AND c.scope_type = 'person'
  AND (c.role IS NULL OR c.role NOT IN ('CHIL', 'FATH', 'MOTH'))`;

// Someone else citing the Entry.
const IN_ENTRY = `SELECT o.scope_id FROM citations o
  WHERE o.entry_id = $entry AND o.scope_type = 'person' AND o.id <> c.id`;

export function placeEntryRoles(db: Database) {
  const baptisms = db
    .query<{ id: number; volume: string }, []>('SELECT id, volume FROM entries')
    .all()
    .filter((e) => bookKind(e.volume) === 'kastetut');
  const child = db.prepare(
    `UPDATE citations AS c SET role = 'CHIL' WHERE ${UNPLACED}
       AND EXISTS (SELECT 1 FROM family_children fc
         JOIN families f ON f.id = fc.family_id
         WHERE fc.person_id = c.scope_id
           AND (f.husband_id IN (${IN_ENTRY}) OR f.wife_id IN (${IN_ENTRY})))`
  );
  function parent(column: string, role: string) {
    return db.prepare(
      `UPDATE citations AS c SET role = '${role}' WHERE ${UNPLACED}
         AND EXISTS (SELECT 1 FROM families f
           JOIN family_children fc ON fc.family_id = f.id
           WHERE f.${column} = c.scope_id AND fc.person_id IN (${IN_ENTRY}))`
    );
  }
  const father = parent('husband_id', 'FATH');
  const mother = parent('wife_id', 'MOTH');
  for (const { id } of baptisms) {
    for (const step of [child, father, mother]) step.run({ $entry: id });
  }
}
