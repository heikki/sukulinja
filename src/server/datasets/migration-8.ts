// Schema 8 (ADR-0026): a baptism Entry's people in their Roles, where
// their Citations didn't say, as the tree tells: one whose parent is in it
// is its child, the husband and wife of a family whose child is in it its
// father and mother. A Citation with a Role of a baptism keeps it; one the
// tree doesn't place stays without.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

// A baptism book's Volume, by its label, as schema 8 told it.
function isBaptisms(volume: string) {
  return (
    !/lasten/i.test(volume) &&
    !/ripp|pääkirj|kirkonkirj|historiakirj/i.test(volume) &&
    /synty|kastet/i.test(volume)
  );
}

const UNPLACED = `c.entry_id = $entry AND c.scope_type = 'person'
  AND (c.role IS NULL OR c.role NOT IN ('CHIL', 'FATH', 'MOTH'))`;

// Someone else citing the Entry.
const IN_ENTRY = `SELECT o.scope_id FROM citations o
  WHERE o.entry_id = $entry AND o.scope_type = 'person' AND o.id <> c.id`;

function up(db: Database) {
  const baptisms = db
    .query<{ id: number; volume: string }, []>('SELECT id, volume FROM entries')
    .all()
    .filter((e) => isBaptisms(e.volume));
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

export const BAPTISM_ROLES_FROM_THE_TREE: Migration = { to: 8, up };
