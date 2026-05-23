import { Database } from 'bun:sqlite';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS persons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    xref TEXT UNIQUE NOT NULL,
    sex TEXT
  );

  CREATE TABLE IF NOT EXISTS names (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    full_text TEXT NOT NULL,
    given TEXT,
    surname TEXT,
    suffix TEXT,
    name_type TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS names_person_idx ON names(person_id);
  CREATE INDEX IF NOT EXISTS names_surname_idx ON names(surname);

  CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    xref TEXT UNIQUE NOT NULL,
    husband_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
    wife_id INTEGER REFERENCES persons(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS family_children (
    family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (family_id, person_id)
  );
  CREATE INDEX IF NOT EXISTS family_children_person_idx ON family_children(person_id);

  CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('person','family')),
    scope_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    date_text TEXT,
    place TEXT,
    value TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS facts_scope_idx ON facts(scope_type, scope_id);
  CREATE INDEX IF NOT EXISTS facts_tag_idx ON facts(tag);

  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,
    format TEXT,
    original_path TEXT
  );

  CREATE TABLE IF NOT EXISTS media_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('person','family')),
    scope_id INTEGER NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    title TEXT,
    crop_top INTEGER,
    crop_left INTEGER,
    crop_width INTEGER,
    crop_height INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS media_links_scope_idx ON media_links(scope_type, scope_id);

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

function runScript(db: Database, sql: string): void {
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  for (const stmt of statements) db.run(stmt);
}

export function openDb(path: string): Database {
  const db = new Database(path, { create: true });
  db.run('PRAGMA foreign_keys = ON;');
  runScript(db, SCHEMA_SQL);
  return db;
}
