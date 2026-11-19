// Schema 14: the Book list, the Volumes added to the dataset's list of
// church books beside those its Citations link into, with the parish
// archive each is in. No export writes it.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

function up(db: Database) {
  db.run(`CREATE TABLE listed_books (
    volume_id TEXT PRIMARY KEY,
    archive_id TEXT NOT NULL
  )`);
}

export const BOOKS_ARE_LISTED: Migration = { to: 14, up };
