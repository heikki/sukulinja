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
    address TEXT,
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

  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    xref TEXT UNIQUE NOT NULL,
    title TEXT,
    publisher TEXT
  );

  CREATE TABLE IF NOT EXISTS citations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('person','family')),
    scope_id INTEGER NOT NULL,
    source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    page TEXT,
    quality INTEGER,
    text TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS citations_scope_idx ON citations(scope_type, scope_id);

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

// Columns added after datasets already existed; CREATE TABLE IF NOT EXISTS
// leaves an older table as it was.
const ADDED_COLUMNS = [{ table: 'facts', column: 'address', type: 'TEXT' }];

function addMissingColumns(db: Database) {
  for (const { table, column, type } of ADDED_COLUMNS) {
    const columns = db
      .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
      .all();
    if (!columns.some((c) => c.name === column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
}

export function openDb(path: string): Database {
  const db = new Database(path, { create: true });
  db.run('PRAGMA foreign_keys = ON;');
  for (const stmt of SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '')) {
    db.run(stmt);
  }
  addMissingColumns(db);
  return db;
}
