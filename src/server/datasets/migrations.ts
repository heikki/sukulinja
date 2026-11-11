// A dataset's database is taken to the app's schema as it's opened, a step
// at a time (ADR-0018). Each step takes it from the version before to `to`
// and keeps everything the app made: Citations, Tags, Reminders, the
// Changes.
//
// A step runs with foreign keys off, so it can rebuild a table the way
// SQLite's ALTER TABLE page describes: create `new_<table>` as the schema
// now has it, copy the rows across, drop the old one and rename the new one
// into its place. The keys are checked before it's committed.

import type { Database } from 'bun:sqlite';
import { copyFileSync } from 'node:fs';

import { BOXES_BECOME_TAGS } from './migration-2';

export interface Migration {
  to: number;
  up: (db: Database) => void;
}

// The oldest schema a database is taken from. One older is imported again.
export const OLDEST_MIGRATED = 1;

export const MIGRATIONS: Migration[] = [BOXES_BECOME_TAGS];

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
// transaction. The app and the vision pass may open it at once: the first
// to lock it migrates, and the other finds it done. With `backup`, the
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
