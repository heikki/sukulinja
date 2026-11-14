// Schema 6 (ADR-0026): an Entry is one Box, cited by everyone it names.
// The app's Citations of an Image alike in source, page, Event, text,
// Image and Box become Citations of one Entry, which holds those for them.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

// A Citation's columns the Entry holds, by the Entry's name for each, as
// schema 6 made them.
const HELD = [
  ['source_id', 'source_id'],
  ['page', 'page'],
  ['event', 'event'],
  ['text', 'text'],
  ['link_volume_id', 'volume_id'],
  ['link_volume', 'volume'],
  ['link_image', 'image'],
  ['link_file_id', 'file_id'],
  ['link_box_left', 'box_left'],
  ['link_box_top', 'box_top'],
  ['link_box_width', 'box_width'],
  ['link_box_height', 'box_height']
] as const;

// The app's Citations of an Image: by hand, with a Box.
const LOOSE = `added_in_app = 1 AND entry_id IS NULL AND link_by = 'hand'
  AND link_image IS NOT NULL AND link_file_id IS NOT NULL
  AND link_box_left IS NOT NULL`;

const ALIKE = HELD.map(([own, held]) => `e.${held} IS c.${own}`).join(' AND ');

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
  // One Entry for each group alike, each Citation citing its group's, and
  // the Entry's columns emptied on them.
  db.run(
    `INSERT INTO entries (${HELD.map(([, held]) => held).join(', ')})
     SELECT DISTINCT ${HELD.map(([own]) => own).join(', ')}
     FROM citations c WHERE ${LOOSE}`
  );
  db.run(
    `UPDATE citations AS c SET entry_id =
       (SELECT MIN(e.id) FROM entries e WHERE ${ALIKE})
     WHERE ${LOOSE}`
  );
  db.run(
    `UPDATE citations SET ${HELD.map(([own]) => `${own} = NULL`).join(', ')},
       link_by = NULL
     WHERE entry_id IS NOT NULL`
  );
}

export const ENTRIES_HOLD_THE_BOX: Migration = { to: 6, up };
