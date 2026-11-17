// Schema 13 (ADR-0033): an Entry's place is one text, as its book writes
// it ("Pyhäjärvi 2"), not a village and a farm, which a book seldom gives
// apart. One kept before is the farm and village joined.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

function up(db: Database) {
  db.run('ALTER TABLE entries ADD COLUMN place TEXT');
  db.run(
    `UPDATE entries SET place = CASE
       WHEN farm IS NOT NULL AND village IS NOT NULL THEN farm || ', ' || village
       ELSE COALESCE(farm, village) END`
  );
  db.run('ALTER TABLE entries DROP COLUMN village');
  db.run('ALTER TABLE entries DROP COLUMN farm');
}

export const ENTRIES_SAY_ONE_PLACE: Migration = { to: 13, up };
