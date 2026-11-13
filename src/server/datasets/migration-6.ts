// Schema 6 (ADR-0026): an Entry is one Box, cited by everyone it names.
// The app's Citations of an Image alike in source, page, Event, text,
// Image and Box become Citations of one Entry, which holds those for them.

import type { Database } from 'bun:sqlite';

import { gatherEntries } from '../citations';
import type { Migration } from './migrations';

function up(db: Database) {
  db.run(
    `CREATE TABLE entries (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
       page TEXT,
       event TEXT,
       text TEXT,
       volume_id TEXT NOT NULL,
       volume TEXT NOT NULL,
       image INTEGER NOT NULL,
       file_id TEXT NOT NULL,
       box_left INTEGER NOT NULL,
       box_top INTEGER NOT NULL,
       box_width INTEGER NOT NULL,
       box_height INTEGER NOT NULL
     )`
  );
  db.run(
    'ALTER TABLE citations ADD COLUMN entry_id INTEGER REFERENCES entries(id)'
  );
  db.run('CREATE INDEX citations_entry_idx ON citations(entry_id)');
  gatherEntries(db);
}

export const ENTRIES_HOLD_THE_BOX: Migration = { to: 6, up };
