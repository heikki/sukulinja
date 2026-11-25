// A dataset's database is taken to the app's schema as it's opened, a step
// at a time (ADR-0018). Each step takes it from the version before to `to`
// and keeps everything the app made: Citations, Tags, Reminders, the
// Changes.
//
// A step runs with foreign keys off, so it can rebuild a table the way
// SQLite's ALTER TABLE page describes: create `new_<table>` as the schema
// now has it, copy the rows across, drop the old one and rename the new one
// into its place. The keys are checked before it's committed.
//
// A step is frozen: it does what it did when it was written, whatever the
// app does now. It holds its own SQL and helpers, and imports no code of
// the app's but this file (migrations.test.ts checks), so a change to the
// app's tables or rules can't change it.

import type { Database } from 'bun:sqlite';
import { copyFileSync } from 'node:fs';

export interface Migration {
  to: number;
  up: (db: Database) => void;
}

// The oldest schema a database is taken from. One older is imported again.
export const OLDEST_MIGRATED = 14;

// Schema 15: a Reminder can be on nothing, so the CHECK that it's on a
// person or an Image goes.
function remindersOnNothing(db: Database) {
  db.run(`
    CREATE TABLE new_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      person_id INTEGER REFERENCES persons(id) ON DELETE CASCADE,
      volume_id TEXT,
      volume TEXT,
      image INTEGER,
      file_id TEXT,
      created_at TEXT NOT NULL,
      done_at TEXT,
      CHECK ((volume_id IS NULL) = (volume IS NULL)),
      CHECK ((volume_id IS NULL) = (image IS NULL)),
      CHECK ((volume_id IS NULL) = (file_id IS NULL))
    )
  `);
  const columns =
    'id, text, person_id, volume_id, volume, image, file_id, created_at, done_at';
  db.run(
    `INSERT INTO new_reminders (${columns}) SELECT ${columns} FROM reminders`
  );
  // The ids handed out so far, so a deleted Reminder's isn't handed out
  // again.
  db.run("DELETE FROM sqlite_sequence WHERE name = 'new_reminders'");
  db.run(`
    INSERT INTO sqlite_sequence (name, seq)
    SELECT 'new_reminders', seq FROM sqlite_sequence WHERE name = 'reminders'
  `);
  db.run('DROP TABLE reminders');
  db.run('ALTER TABLE new_reminders RENAME TO reminders');
}

export const MIGRATIONS: Migration[] = [{ to: 15, up: remindersOnNothing }];

// The version the steps take a database to.
export function latestOf(steps: Migration[]) {
  return steps.at(-1)?.to ?? OLDEST_MIGRATED;
}

// The schema version, kept in SQLite's own header field; 0 in a database
// from before versions started at 1.
export function versionOf(db: Database) {
  return db.query<{ user_version: number }, []>('PRAGMA user_version').get()!
    .user_version;
}

// Takes the database from its version through the steps, in one
// transaction. Two processes may open it at once: the first to lock it
// migrates, and the other finds it done. With `backup`, the
// database's file as it was is copied there first: with the write lock
// held and no write-ahead log, the file alone is the whole database.
export function migrate(
  db: Database,
  steps: Migration[],
  backup: string | null
) {
  const latest = latestOf(steps);
  db.run('PRAGMA foreign_keys = OFF;');
  db.run('BEGIN IMMEDIATE;');
  try {
    const from = versionOf(db);
    if (from < latest) {
      if (backup !== null) copyFileSync(db.filename, backup);
      for (const step of steps) {
        if (step.to > from) step.up(db);
      }
      const broken = db.query('PRAGMA foreign_key_check').all();
      if (broken.length > 0) {
        throw new Error(
          `migrating from schema ${from} broke ${broken.length} foreign keys`
        );
      }
      db.run(`PRAGMA user_version = ${latest};`);
    }
    db.run('COMMIT;');
  } catch (err) {
    db.run('ROLLBACK;');
    throw err;
  } finally {
    db.run('PRAGMA foreign_keys = ON;');
  }
}
