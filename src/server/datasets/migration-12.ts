// Schema 12 (ADR-0033): an Entry keeps its own dates and place, as its
// book writes them. The columns start empty: an Entry made before keeps
// none until it's edited, as a Fact's date is a conclusion, not evidence.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

function up(db: Database) {
  for (const column of ['date', 'life_date', 'village', 'farm']) {
    db.run(`ALTER TABLE entries ADD COLUMN ${column} TEXT`);
  }
}

export const ENTRIES_SAY_THEIR_DATES: Migration = { to: 12, up };
