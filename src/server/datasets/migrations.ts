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

// Schema 16: what the app made is told by what it holds, not a flag. A
// Citation made in the app is one of an Entry (ADR-0026), and a person's
// media link with a Box is their Tag (ADR-0020), so `added_in_app` goes
// from both. Nothing reads it for anything else, and nothing re-imports.
function noAddedInApp(db: Database) {
  db.run('ALTER TABLE citations DROP COLUMN added_in_app');
  db.run(`
    CREATE TABLE new_media_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      scope_type TEXT NOT NULL
        CHECK (scope_type IN ('person','family','fact','citation')),
      scope_id INTEGER NOT NULL,
      object_order INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      crop_top INTEGER,
      crop_left INTEGER,
      crop_width INTEGER,
      crop_height INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  const columns = `id, media_id, scope_type, scope_id, object_order, title,
    crop_top, crop_left, crop_width, crop_height, sort_order`;
  db.run(
    `INSERT INTO new_media_links (${columns})
     SELECT ${columns} FROM media_links`
  );
  db.run("DELETE FROM sqlite_sequence WHERE name = 'new_media_links'");
  db.run(`
    INSERT INTO sqlite_sequence (name, seq)
    SELECT 'new_media_links', seq FROM sqlite_sequence
    WHERE name = 'media_links'
  `);
  db.run('DROP TABLE media_links');
  db.run('ALTER TABLE new_media_links RENAME TO media_links');
  db.run(
    'CREATE INDEX media_links_scope_idx ON media_links(scope_type, scope_id)'
  );
  db.run(`
    CREATE UNIQUE INDEX media_links_tag_idx ON media_links(media_id, scope_id)
    WHERE scope_type = 'person' AND crop_top IS NOT NULL
  `);
}

// The page number a converted MyHeritage rippikirja reference's text
// gives ("Sivu: 12", or "Sivu12" double-escaped), as its parser read it.
function rippiPageOf(text: string) {
  const found = /Sivu:?[ \t]*(?<n>\d+)/u.exec(text);
  return found === null ? null : Number(found.groups!.n);
}

const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');
const FINNISH_MONTHS = [
  'tammi',
  'helmi',
  'maalis',
  'huhti',
  'touko',
  'kesä',
  'heinä',
  'elo',
  'syys',
  'loka',
  'marras',
  'joulu'
];

// The date of the event a converted MyHeritage index reference's text
// names, its baptism or marriage ("Ristiäiset: 29. Marras 1829 - Mikkeli,
// …"), as a GEDCOM date: "29 NOV 1829", "NOV 1829" or "1829", a day the
// month doesn't have left out.
function indexDateOf(text: string) {
  const event =
    /(?:Ristiäiset|Kaste|Avioliitto)\s*:\s*(?<date>[^\n]*?)\s+-\s+[^,\n]+/u.exec(
      text
    )?.groups?.date;
  const m =
    event === undefined
      ? undefined
      : /(?:(?<day>\d{1,2})\.\s*)?(?:(?<month>\p{L}+)\s+)?(?<year>1[5-9]\d\d)/u.exec(
          event
        )?.groups;
  if (m === undefined) return null;
  const word = m.month?.toLowerCase();
  const month = FINNISH_MONTHS.findIndex(
    (name) => word?.startsWith(name) === true
  );
  if (month < 0) return m.year!;
  return withDay(m.day, month, m.year!);
}

// "<day> <MON> <year>", the day left out where the month hasn't it.
function withDay(dayText: string | undefined, month: number, year: string) {
  const ym = `${MONTHS[month]} ${year}`;
  if (dayText === undefined) return ym;
  const days = new Date(Date.UTC(Number(year), month + 1, 0)).getUTCDate();
  const day = Number(dayText);
  return day < 1 || day > days ? ym : `${day} ${ym}`;
}

// Schema 17: what a converted reference said of where in its book it is
// (ADR-0039) is kept where it belongs, read once here from the text it
// was converted with, on its Entry: the page number the book writes, from
// a rippikirja reference, and the date of its Event an index gives, where
// the Entry says none. Nothing then needs the page a hand Mark
// moved aside: a reference's page is its own again, and `original_page`
// goes.
function convertedSays(db: Database) {
  db.run('ALTER TABLE entries ADD COLUMN book_page INTEGER');
  const converted = db
    .query<{ entryId: number; page: string; text: string | null }, []>(
      `SELECT c.entry_id AS entryId, c.original_page AS page,
         COALESCE(c.text, e.text) AS text
       FROM citations c JOIN entries e ON e.id = c.entry_id
       WHERE c.original_page LIKE '%/collection-%'
       ORDER BY c.id`
    )
    .all();
  const putPage = db.prepare(
    'UPDATE entries SET book_page = ? WHERE id = ? AND book_page IS NULL'
  );
  const putDate = db.prepare(
    'UPDATE entries SET date = ? WHERE id = ? AND date IS NULL'
  );
  for (const { entryId, page, text } of converted) {
    if (page.includes('/collection-10509/')) {
      const bookPage = rippiPageOf(text ?? '');
      if (bookPage !== null) putPage.run(bookPage, entryId);
    } else {
      const date = indexDateOf(text ?? '');
      if (date !== null) putDate.run(date, entryId);
    }
  }
  db.run(
    `UPDATE citations SET page = original_page
     WHERE entry_id IS NULL AND original_page IS NOT NULL`
  );
  db.run('ALTER TABLE citations DROP COLUMN original_page');
}

export const MIGRATIONS: Migration[] = [
  { to: 15, up: remindersOnNothing },
  { to: 16, up: noAddedInApp },
  { to: 17, up: convertedSays }
];

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
