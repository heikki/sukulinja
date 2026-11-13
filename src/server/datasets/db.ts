import { Database } from 'bun:sqlite';

import {
  latestOf,
  migrate,
  MIGRATIONS,
  OLDEST_MIGRATED,
  versionOf
} from './migrations';

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
    sort_order INTEGER NOT NULL DEFAULT 0,
    -- A Tag: a person in a Photo with their Box, made in the app, which a
    -- re-import keeps (ADR-0017).
    added_in_app INTEGER NOT NULL DEFAULT 0,
    CHECK (added_in_app = 0 OR (
      scope_type = 'person' AND crop_top IS NOT NULL AND crop_left IS NOT NULL
      AND crop_width IS NOT NULL AND crop_height IS NOT NULL
    ))
  );
  CREATE INDEX IF NOT EXISTS media_links_scope_idx ON media_links(scope_type, scope_id);
  -- A person is tagged once in a Photo.
  CREATE UNIQUE INDEX IF NOT EXISTS media_links_tag_idx
    ON media_links(media_id, scope_id) WHERE added_in_app = 1;

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
    -- The Astia Image or Volume a Mark or Match links, with the
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
  -- The Facts a Citation supports: its person's, their marriages', or a
  -- family Citation's family's (ADR-0022). Nothing is written on a Fact.
  CREATE TABLE IF NOT EXISTS fact_citations (
    fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    citation_id INTEGER NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
    PRIMARY KEY (fact_id, citation_id)
  );
  CREATE INDEX IF NOT EXISTS fact_citations_citation_idx ON fact_citations(citation_id);
  -- Matches taken back by hand: the reference isn't on that Image.
  CREATE TABLE IF NOT EXISTS rejections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_url TEXT NOT NULL,
    volume_id TEXT NOT NULL,
    image INTEGER NOT NULL,
    file_id TEXT
  );
  CREATE INDEX IF NOT EXISTS rejections_url_idx ON rejections(reference_url);
  -- Reminders, on a person or an Image, one on an Image maybe about a
  -- person too. No export writes them.
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    person_id INTEGER REFERENCES persons(id) ON DELETE CASCADE,
    volume_id TEXT,
    volume TEXT,
    image INTEGER,
    file_id TEXT,
    created_at TEXT NOT NULL,
    done_at TEXT,
    CHECK (person_id IS NOT NULL OR volume_id IS NOT NULL),
    CHECK ((volume_id IS NULL) = (volume IS NULL)),
    CHECK ((volume_id IS NULL) = (image IS NULL)),
    CHECK ((volume_id IS NULL) = (file_id IS NULL))
  );

  -- The Changes: what was done in the app, oldest first. Its what is a
  -- ChangeWhat as JSON. What it was on is held as a Reminder's is, with
  -- who naming the person as they were then, and a Tag's media_id its
  -- Photo. A person or Citation gone leaves it on nothing, or on the
  -- Citation's person, and a Photo gone, on its person. No export writes them.
  CREATE TABLE IF NOT EXISTS changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    what TEXT NOT NULL,
    who TEXT,
    person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
    citation_id INTEGER REFERENCES citations(id) ON DELETE SET NULL,
    volume_id TEXT,
    volume TEXT,
    image INTEGER,
    file_id TEXT,
    media_id INTEGER REFERENCES media(id) ON DELETE SET NULL
  );

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

// The schema a new database is built with. A change to it is a step in
// MIGRATIONS too, which takes a database built before it there, ending in
// the same tables (ADR-0018). A column a step adds goes last in its table
// here, where ALTER TABLE puts it.
export const SCHEMA_VERSION = latestOf(MIGRATIONS);

// A dataset whose database is too old to migrate, or a newer app built.
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

// Where a database's copy from before its last migration is kept, beside
// it; none for one in memory.
function backupOf(path: string) {
  if (path === ':memory:' || path === '') return null;
  return `${path.replace(/\.sqlite$/u, '')}.before-migration.sqlite`;
}

// Opens a dataset's database, creating the schema in a new one and
// migrating an older one. Throws OutdatedDatasetError for one built before
// the oldest schema migrated, or by a newer app.
export function openDb(path: string): Database {
  const db = new Database(path, { create: true });
  db.run('PRAGMA foreign_keys = ON;');
  // The app and the vision pass write Marks at once, from two processes.
  db.run('PRAGMA busy_timeout = 5000;');
  if (hasTables(db)) {
    const version = versionOf(db);
    if (version < OLDEST_MIGRATED) {
      db.close();
      throw new OutdatedDatasetError(
        `made by an older version of the app, from before schema ${OLDEST_MIGRATED}`
      );
    }
    if (version > SCHEMA_VERSION) {
      db.close();
      throw new OutdatedDatasetError(
        `made by a newer version of the app (schema ${version}, now ${SCHEMA_VERSION})`
      );
    }
    if (version < SCHEMA_VERSION) {
      try {
        migrate(db, MIGRATIONS, backupOf(path));
      } catch (err) {
        db.close();
        throw err;
      }
    }
    return db;
  }
  for (const stmt of SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '')) {
    db.run(stmt);
  }
  db.run(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  return db;
}

// Reads an existing database whatever its schema, for what an import carries
// over from the dataset it replaces.
export function openAnyDb(path: string): Database {
  return new Database(path, { readonly: true });
}
