// Migrating a dataset's database as it's opened (ADR-0018): a database of
// the oldest schema migrated ends with the tables a new one has and the
// rows it had, and a step that fails leaves it as it was.

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CITATIONS_READ } from '../citations';
import { openDb, OutdatedDatasetError, SCHEMA_VERSION } from './db';
import { migrate, OLDEST_MIGRATED, versionOf } from './migrations';
import type { Migration } from './migrations';

const OLDEST_SQL = readFileSync(
  join(import.meta.dir, `schema-${OLDEST_MIGRATED}.sql`),
  'utf8'
);

let dir = '';
let path = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'migrations-'));
  path = join(dir, 'db.sqlite');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Runs each statement of the SQL.
function runAll(db: Database, sql: string) {
  for (const stmt of sql.split(';').map((s) => s.trim())) {
    if (stmt !== '') db.run(stmt);
  }
}

// A database the oldest schema migrated built, at `version`.
function oldest(version = OLDEST_MIGRATED) {
  const db = new Database(path, { create: true });
  db.run('PRAGMA foreign_keys = ON;');
  runAll(db, OLDEST_SQL);
  db.run(`PRAGMA user_version = ${version};`);
  return db;
}

// What the app made in a dataset, and a bit of the tree it's on.
function fill(db: Database) {
  runAll(
    db,
    `
    INSERT INTO meta (key, value) VALUES ('display_name', 'Ylöset');
    INSERT INTO persons (id, xref, uid) VALUES (1, '@I1@', 'u1'), (2, '@I2@', 'u2');
    INSERT INTO names (person_id, full_text, given, surname)
      VALUES (1, 'Liisa /Esimerkki/', 'Liisa', 'Esimerkki');
    INSERT INTO sources (id, xref, title) VALUES (1, '@S1@', 'Juva rippikirja');
    INSERT INTO citations (id, scope_type, scope_id, source_id, page,
      original_page, link_volume_id, link_volume, link_image, link_file_id,
      link_box_left, link_box_top, link_box_width, link_box_height, link_by,
      added_in_app)
      VALUES (1, 'person', 1, 1, 'https://astia.fi/x', NULL, 'v1', 'Rippikirja',
        12, 'f1', 10, 20, 30, 40, 'hand', 1);
    INSERT INTO media (id, file_path, format, original_path)
      VALUES (1, 'media/a.jpg', 'image/jpeg', 'a.jpg');
    INSERT INTO media_links (media_id, scope_type, scope_id, crop_top,
      crop_left, crop_width, crop_height, added_in_app)
      VALUES (1, 'person', 2, 1, 2, 3, 4, 1);
    INSERT INTO reminders (text, person_id, created_at)
      VALUES ('Etsi kuolinpäivä', 1, '2026-11-11');
    INSERT INTO changes (at, what, who, person_id, citation_id)
      VALUES ('2026-11-11', '{"kind":"cited"}', 'Liisa Esimerkki', 1, 1);
  `
  );
}

function tablesOf(db: Database) {
  return db
    .query<{ name: string }, []>(
      `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    .all()
    .map((t) => t.name);
}

// SQL as written, without comments, IF NOT EXISTS and spacing.
function normalized(sql: string) {
  return sql
    .replace(/--[^\n]*/gu, '')
    .replace(/IF NOT EXISTS/giu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\s*(?<mark>[(),])\s*/gu, '$<mark>')
    .trim();
}

// A table's CHECKs, which no PRAGMA gives.
function checksOf(sql: string) {
  const s = normalized(sql);
  const out: string[] = [];
  for (
    let at = s.indexOf('CHECK(');
    at !== -1;
    at = s.indexOf('CHECK(', at + 1)
  ) {
    let depth = 0;
    let end = at + 'CHECK'.length;
    for (; end < s.length; end++) {
      if (s[end] === '(') depth++;
      if (s[end] === ')' && --depth === 0) break;
    }
    out.push(s.slice(at, end + 1));
  }
  return out.sort();
}

// The tables, columns, keys, indexes and CHECKs, as SQLite reads them.
function shapeOf(db: Database) {
  function sqlOf(name: string) {
    return db
      .query<{ sql: string | null }, [string]>(
        'SELECT sql FROM sqlite_master WHERE name = ?'
      )
      .get(name)!.sql;
  }
  return tablesOf(db).map((table) => ({
    table,
    columns: db.query(`PRAGMA table_info(${table})`).all(),
    foreignKeys: db.query(`PRAGMA foreign_key_list(${table})`).all(),
    indexes: db
      .query<{ name: string }, []>(`PRAGMA index_list(${table})`)
      .all()
      .map((i) => ({
        ...i,
        columns: db.query(`PRAGMA index_xinfo(${i.name})`).all(),
        sql: normalized(sqlOf(i.name) ?? '')
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    checks: checksOf(sqlOf(table) ?? '')
  }));
}

function rowsOf(db: Database, table: string) {
  return db.query(`SELECT * FROM ${table} ORDER BY rowid`).all();
}

describe('a database of the oldest schema migrated', () => {
  test('has the tables a new one has', () => {
    oldest().close();
    const migrated = openDb(path);
    const fresh = openDb(':memory:');
    expect(shapeOf(migrated)).toEqual(shapeOf(fresh));
    migrated.close();
    fresh.close();
  });

  test('keeps every row, and what the app made', () => {
    const before = oldest();
    fill(before);
    const had = tablesOf(before).map((table) => ({
      table,
      rows: rowsOf(before, table)
    }));
    before.close();
    const migrated = openDb(path);
    // Only the columns it had: a step may add some.
    for (const { table, rows } of had) {
      const names = Object.keys(rows[0] ?? {});
      const columns = names.length === 0 ? '*' : names.join(', ');
      // A Citation reads as it did once its Entry holds its link.
      const read = table === 'citations';
      const now = migrated
        .query(
          `SELECT ${columns} FROM ${read ? CITATIONS_READ : table}
           ORDER BY ${read ? 'id' : 'rowid'}`
        )
        .all();
      expect({ table, rows: now }).toEqual({ table, rows });
    }
    expect(versionOf(migrated)).toBe(SCHEMA_VERSION);
    migrated.close();
  });
});

describe('schema 2', () => {
  test("makes each person's Box from the import their Tag", () => {
    const db = oldest();
    runAll(
      db,
      `
      INSERT INTO persons (id, xref) VALUES (1, '@I1@'), (2, '@I2@');
      INSERT INTO media (id, file_path) VALUES (1, 'a.jpg'), (2, 'b.jpg');
      INSERT INTO media_links (media_id, scope_type, scope_id, object_order,
        crop_top, crop_left, crop_width, crop_height, sort_order, added_in_app)
        VALUES (1, 'person', 1, 0, 1, 2, 3, 4, 0, 0),
          (2, 'person', 1, 1, NULL, NULL, NULL, NULL, 1, 0),
          (1, 'person', 2, 0, 1, 2, 3, 4, 0, 0),
          (1, 'person', 2, 1, 5, 6, 7, 8, 1, 1),
          (1, 'family', 1, 0, 1, 2, 3, 4, 0, 0);
    `
    );
    db.close();
    const migrated = openDb(path);
    expect(
      migrated
        .query(
          `SELECT media_id, scope_type, scope_id, object_order, crop_top,
             sort_order, added_in_app
           FROM media_links ORDER BY id`
        )
        .all()
    ).toEqual([
      {
        media_id: 1,
        scope_type: 'person',
        scope_id: 1,
        object_order: 0,
        crop_top: null,
        sort_order: 0,
        added_in_app: 0
      },
      {
        media_id: 2,
        scope_type: 'person',
        scope_id: 1,
        object_order: 1,
        crop_top: null,
        sort_order: 1,
        added_in_app: 0
      },
      {
        media_id: 1,
        scope_type: 'person',
        scope_id: 2,
        object_order: 0,
        crop_top: null,
        sort_order: 0,
        added_in_app: 0
      },
      {
        media_id: 1,
        scope_type: 'person',
        scope_id: 2,
        object_order: 1,
        crop_top: 5,
        sort_order: 1,
        added_in_app: 1
      },
      {
        media_id: 1,
        scope_type: 'family',
        scope_id: 1,
        object_order: 0,
        crop_top: 1,
        sort_order: 0,
        added_in_app: 0
      },
      {
        media_id: 1,
        scope_type: 'person',
        scope_id: 1,
        object_order: 2,
        crop_top: 1,
        sort_order: 0,
        added_in_app: 1
      }
    ]);
    migrated.close();
  });
});

describe('schema 5', () => {
  test("moves a Fact's Citations to its owner, to support it", () => {
    const db = oldest();
    runAll(
      db,
      `
      INSERT INTO persons (id, xref) VALUES (1, '@I1@');
      INSERT INTO families (id, xref, husband_id) VALUES (1, '@F1@', 1);
      INSERT INTO facts (id, scope_type, scope_id, tag)
        VALUES (1, 'person', 1, 'BIRT'), (2, 'family', 1, 'MARR');
      INSERT INTO sources (id, xref, title) VALUES (1, '@S1@', 'Juva');
      INSERT INTO citations (id, scope_type, scope_id, source_id, page, sort_order)
        VALUES (1, 'person', 1, 1, 'p. 1', 0),
          (2, 'fact', 1, 1, 'p. 1', 0),
          (3, 'fact', 1, 1, 'p. 2', 1),
          (4, 'fact', 2, 1, 'p. 3', 0),
          (5, 'fact', 9, 1, 'p. 4', 0);
      INSERT INTO changes (at, what, citation_id)
        VALUES ('2026-11-13', '{"kind":"cited"}', 2);
    `
    );
    db.close();
    const migrated = openDb(path);
    expect(
      migrated
        .query(
          'SELECT id, scope_type, scope_id, sort_order FROM citations ORDER BY id'
        )
        .all()
    ).toEqual([
      { id: 1, scope_type: 'person', scope_id: 1, sort_order: 0 },
      { id: 3, scope_type: 'person', scope_id: 1, sort_order: 1 },
      { id: 4, scope_type: 'family', scope_id: 1, sort_order: 0 },
      { id: 5, scope_type: 'fact', scope_id: 9, sort_order: 0 }
    ]);
    expect(
      migrated
        .query(
          'SELECT fact_id, citation_id FROM fact_citations ORDER BY fact_id, citation_id'
        )
        .all()
    ).toEqual([
      { fact_id: 1, citation_id: 1 },
      { fact_id: 1, citation_id: 3 },
      { fact_id: 2, citation_id: 4 }
    ]);
    expect(migrated.query('SELECT citation_id FROM changes').all()).toEqual([
      { citation_id: 1 }
    ]);
    migrated.close();
  });
});

describe('opening a database', () => {
  test('older than the oldest schema migrated, it has to be imported again', () => {
    oldest(OLDEST_MIGRATED - 1).close();
    expect(() => openDb(path)).toThrow(OutdatedDatasetError);
  });

  test('a newer app built, it is left alone', () => {
    oldest(SCHEMA_VERSION + 1).close();
    expect(() => openDb(path)).toThrow(/newer version/u);
  });
});

describe('migrate', () => {
  const steps: Migration[] = [
    {
      to: OLDEST_MIGRATED + 1,
      up: (db) => {
        db.run('ALTER TABLE reminders ADD COLUMN due TEXT');
      }
    },
    {
      to: OLDEST_MIGRATED + 2,
      up: (db) => {
        db.run("UPDATE reminders SET due = 'soon'");
      }
    }
  ];
  function backup() {
    return join(dir, 'db.before-migration.sqlite');
  }

  test('runs the steps after its version, and keeps a copy from before', () => {
    const db = oldest(OLDEST_MIGRATED + 1);
    db.run('ALTER TABLE reminders ADD COLUMN due TEXT');
    fill(db);
    migrate(db, steps, backup());
    expect(versionOf(db)).toBe(OLDEST_MIGRATED + 2);
    expect(db.query('SELECT due FROM reminders').all()).toEqual([
      { due: 'soon' }
    ]);
    db.close();
    const copy = new Database(backup(), { readonly: true });
    expect(versionOf(copy)).toBe(OLDEST_MIGRATED + 1);
    expect(copy.query('SELECT due FROM reminders').all()).toEqual([
      { due: null }
    ]);
    copy.close();
  });

  test('does nothing to a database already migrated', () => {
    const db = oldest(OLDEST_MIGRATED + 2);
    migrate(db, steps, backup());
    expect(versionOf(db)).toBe(OLDEST_MIGRATED + 2);
    expect(existsSync(backup())).toBe(false);
    db.close();
  });

  test('a step that fails leaves the database as it was', () => {
    const db = oldest();
    fill(db);
    const failing: Migration[] = [
      ...steps,
      {
        to: OLDEST_MIGRATED + 3,
        up: () => {
          throw new Error('broken step');
        }
      }
    ];
    expect(() => {
      migrate(db, failing, null);
    }).toThrow('broken step');
    expect(versionOf(db)).toBe(OLDEST_MIGRATED);
    const columns = db
      .query<{ name: string }, []>('PRAGMA table_info(reminders)')
      .all()
      .map((c) => c.name);
    expect(columns).not.toContain('due');
    db.close();
  });

  test('a step that breaks a foreign key is undone', () => {
    const db = oldest();
    fill(db);
    const breaking: Migration[] = [
      {
        to: OLDEST_MIGRATED + 1,
        up: (d) => {
          d.run('DELETE FROM persons WHERE id = 1');
        }
      }
    ];
    expect(() => {
      migrate(db, breaking, null);
    }).toThrow(/foreign keys/u);
    expect(db.query('SELECT COUNT(*) AS n FROM persons').get()).toEqual({
      n: 2
    });
    expect(db.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    db.close();
  });
});

describe('schema 4', () => {
  test('names the Photo of a tag Change from before, by its file name', () => {
    const db = oldest(3);
    db.run(
      'ALTER TABLE changes ADD COLUMN media_id INTEGER REFERENCES media(id) ON DELETE SET NULL'
    );
    runAll(
      db,
      `
      INSERT INTO persons (id, xref) VALUES (1, '@I1@'), (2, '@I2@');
      INSERT INTO media (id, file_path, original_path)
        VALUES (1, 'm/1.jpg', 'photos/Kes%C3%A4.jpg'),
          (2, 'm/2.jpg', 'a/Talvi.jpg'), (3, 'm/3.jpg', 'b/Talvi.jpg');
      INSERT INTO media_links (media_id, scope_type, scope_id)
        VALUES (3, 'person', 1);
      INSERT INTO changes (at, what, person_id) VALUES
        ('t', '{"kind":"tag","photo":"Kesä.jpg","moved":false}', 2),
        ('t', '{"kind":"untag","photo":"Talvi.jpg"}', 1),
        ('t', '{"kind":"portrait","photo":"Talvi.jpg"}', 2),
        ('t', '{"kind":"tag","photo":"Poissa.jpg","moved":false}', 1),
        ('t', '{"kind":"uncite","cited":"Kesä.jpg"}', 1);
    `
    );
    db.close();
    const migrated = openDb(path);
    expect(
      migrated.query('SELECT media_id FROM changes ORDER BY id').all()
    ).toEqual([
      { media_id: 1 },
      { media_id: 3 },
      { media_id: null },
      { media_id: null },
      { media_id: null }
    ]);
    migrated.close();
  });
});
