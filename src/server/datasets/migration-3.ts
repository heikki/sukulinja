// Schema 3: a Change names the Photo a Tag was made, moved or taken back
// in, so picking it opens the Photo. Changes from before name none, and
// lead to their person as they did.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

function up(db: Database) {
  db.run(
    `ALTER TABLE changes
     ADD COLUMN media_id INTEGER REFERENCES media(id) ON DELETE SET NULL`
  );
}

export const CHANGES_NAME_THEIR_PHOTO: Migration = { to: 3, up };
