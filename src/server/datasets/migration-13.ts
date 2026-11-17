// Schema 13 (ADR-0033): an Entry's place is one text, as its book writes
// it ("Pyhäjärvi 2"), not a village and a farm, which a book seldom gives
// apart. Schema 12 was out for an hour and no Entry kept either.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

function up(db: Database) {
  db.run('ALTER TABLE entries ADD COLUMN place TEXT');
  db.run('ALTER TABLE entries DROP COLUMN village');
  db.run('ALTER TABLE entries DROP COLUMN farm');
}

export const ENTRIES_SAY_ONE_PLACE: Migration = { to: 13, up };
