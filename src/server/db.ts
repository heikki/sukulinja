import { Database } from 'bun:sqlite';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS persons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    xref TEXT UNIQUE NOT NULL,
    uid TEXT,
    sex TEXT,
    change_date TEXT,
    change_time TEXT
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
  CREATE TABLE IF NOT EXISTS name_pieces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_id INTEGER NOT NULL REFERENCES names(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    value TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS name_pieces_name_idx ON name_pieces(name_id);
  CREATE INDEX IF NOT EXISTS names_surname_idx ON names(surname);

  CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    xref TEXT UNIQUE NOT NULL,
    uid TEXT,
    husband_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
    wife_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
    change_date TEXT,
    change_time TEXT
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
    type TEXT,
    date_text TEXT,
    place TEXT,
    latitude TEXT,
    longitude TEXT,
    address TEXT,
    age TEXT,
    cause TEXT,
    agency TEXT,
    value TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS facts_scope_idx ON facts(scope_type, scope_id);
  CREATE INDEX IF NOT EXISTS facts_tag_idx ON facts(tag);
  CREATE TABLE IF NOT EXISTS addresses (
    owner_type TEXT NOT NULL
      CHECK (owner_type IN ('fact','repository','submitter')),
    owner_id INTEGER NOT NULL,
    text TEXT,
    line1 TEXT,
    line2 TEXT,
    line3 TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT,
    PRIMARY KEY (owner_type, owner_id)
  );
  CREATE TABLE IF NOT EXISTS associations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    associate_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    relation TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,
    format TEXT,
    original_path TEXT
  );

  CREATE TABLE IF NOT EXISTS media_links (
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
  );
  CREATE INDEX IF NOT EXISTS media_links_scope_idx ON media_links(scope_type, scope_id);

  CREATE TABLE IF NOT EXISTS repositories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    xref TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT,
    change_date TEXT,
    change_time TEXT
  );
  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    xref TEXT UNIQUE NOT NULL,
    title TEXT,
    author TEXT,
    publisher TEXT,
    text TEXT,
    data_events TEXT,
    change_date TEXT,
    change_time TEXT
  );
  CREATE TABLE IF NOT EXISTS source_repositories (
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS citations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_type TEXT NOT NULL CHECK (
      scope_type IN ('person','family','fact','name','note','shared_note')
    ),
    scope_id INTEGER NOT NULL,
    source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    page TEXT,
    event TEXT,
    role TEXT,
    quality INTEGER,
    data_date TEXT,
    text TEXT,
    -- A hand Mark's citation cites the Astia Image: page is its address,
    -- and the page it had before, its original page, is kept here.
    original_page TEXT,
    -- The Astia Image or Volume a Mark or Vision match links, with the
    -- entry's Box in pixels of the full-size Image.
    link_volume_id TEXT,
    link_volume TEXT,
    link_image INTEGER,
    link_file_id TEXT,
    link_box_left INTEGER,
    link_box_top INTEGER,
    link_box_width INTEGER,
    link_box_height INTEGER,
    link_by TEXT CHECK (link_by IN ('hand','vision')),
    -- Made in the app, not by an import: a re-import keeps it.
    added_in_app INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CHECK ((link_volume_id IS NULL) = (link_by IS NULL))
  );
  CREATE INDEX IF NOT EXISTS citations_scope_idx ON citations(scope_type, scope_id);
  -- Vision matches taken back by hand: the reference isn't on that Image.
  CREATE TABLE IF NOT EXISTS rejections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_url TEXT NOT NULL,
    volume_id TEXT NOT NULL,
    image INTEGER NOT NULL,
    file_id TEXT
  );
  CREATE INDEX IF NOT EXISTS rejections_url_idx ON rejections(reference_url);

  CREATE TABLE IF NOT EXISTS shared_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    xref TEXT UNIQUE NOT NULL,
    text TEXT NOT NULL,
    change_date TEXT,
    change_time TEXT
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_type TEXT NOT NULL CHECK (owner_type IN (
      'person','family','fact','place','name','source','citation',
      'media_link','association'
    )),
    owner_id INTEGER NOT NULL,
    -- Written out, or a pointer to a shared note.
    text TEXT,
    shared_note_id INTEGER REFERENCES shared_notes(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CHECK ((text IS NULL) <> (shared_note_id IS NULL))
  );
  CREATE INDEX IF NOT EXISTS notes_owner_idx ON notes(owner_type, owner_id);
  CREATE TABLE IF NOT EXISTS submitters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    xref TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    change_date TEXT,
    change_time TEXT
  );
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

// Raised whenever the schema changes. A dataset's database holds the whole
// tree and the file it came from isn't kept, so an older database can't be
// upgraded: the dataset is imported again (ADR-0013).
export const SCHEMA_VERSION = 6;

// A dataset whose database an older version of the app built.
export class OutdatedDatasetError extends Error {}

function hasTables(db: Database) {
  return (
    db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'"
      )
      .get()!.n > 0
  );
}

function schemaVersion(db: Database) {
  const hasMeta = db
    .query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
    .get();
  if (hasMeta === null) return null;
  const row = db
    .query<{ value: string }, []>(
      "SELECT value FROM meta WHERE key = 'schema_version'"
    )
    .get();
  return row === null ? null : Number(row.value);
}

// Opens a dataset's database, creating the schema in a new one. Throws
// OutdatedDatasetError for one built with another schema.
export function openDb(path: string): Database {
  const db = new Database(path, { create: true });
  db.run('PRAGMA foreign_keys = ON;');
  // The app and the vision pass write Marks at once, from two processes.
  db.run('PRAGMA busy_timeout = 5000;');
  if (hasTables(db)) {
    const version = schemaVersion(db);
    if (version !== SCHEMA_VERSION) {
      db.close();
      throw new OutdatedDatasetError(
        `made by an older version of the app (schema ${version ?? 1}, now ${SCHEMA_VERSION})`
      );
    }
    return db;
  }
  for (const stmt of SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '')) {
    db.run(stmt);
  }
  db.run("INSERT INTO meta (key, value) VALUES ('schema_version', ?)", [
    String(SCHEMA_VERSION)
  ]);
  return db;
}

// Reads an existing database whatever its schema, for what an import carries
// over from the dataset it replaces.
export function openAnyDb(path: string): Database {
  return new Database(path, { readonly: true });
}
