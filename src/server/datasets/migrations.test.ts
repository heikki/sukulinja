// Migrating a dataset's database as it's opened (ADR-0018): a database of
// the oldest schema migrated ends with the tables a new one has and the
// rows it had, and a step that fails leaves it as it was.

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    INSERT INTO entries (id, source_id, page, event, volume_id, volume,
      image, file_id, box_left, box_top, box_width, box_height, date)
      VALUES (1, 1, 'https://astia.fi/x', 'BAPM', 'v1', 'Rippikirja', 12,
        'f1', 10, 20, 30, 40, '3 MAR 1850');
    INSERT INTO citations (id, scope_type, scope_id, link_by, added_in_app,
      entry_id)
      VALUES (1, 'person', 1, NULL, 1, 1);
    INSERT INTO facts (id, scope_type, scope_id, tag)
      VALUES (1, 'person', 1, 'BIRT');
    INSERT INTO fact_citations (fact_id, citation_id) VALUES (1, 1);
    INSERT INTO listed_books (volume_id, archive_id) VALUES ('v2', 'a1');
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

// A row with only the columns still there.
function only(row: object, kept: Set<string>) {
  return Object.fromEntries(Object.entries(row).filter(([n]) => kept.has(n)));
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
    // Only the columns both have: a step may add some, or drop one that
    // says what the others do.
    for (const { table, rows } of had) {
      const kept = new Set(
        migrated
          .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
          .all()
          .map((c) => c.name)
      );
      const names = Object.keys(rows[0] ?? {}).filter((n) => kept.has(n));
      const columns = names.length === 0 ? '*' : names.join(', ');
      const now = migrated
        .query(`SELECT ${columns} FROM ${table} ORDER BY rowid`)
        .all();
      const was = rows.map((row) => only(row as object, kept));
      expect({ table, rows: now }).toEqual({ table, rows: was });
    }
    expect(versionOf(migrated)).toBe(SCHEMA_VERSION);
    migrated.close();
  });
});

describe('schema 15', () => {
  test("lets a Reminder be on nothing, and hands out no deleted one's id", () => {
    const before = oldest();
    fill(before);
    before.run(
      "INSERT INTO reminders (id, text, person_id, created_at) VALUES (7, 'Pois', 1, '2026-11-12')"
    );
    before.run('DELETE FROM reminders WHERE id = 7');
    before.close();
    const migrated = openDb(path);
    const { id } = migrated
      .query<{ id: number }, []>(
        "INSERT INTO reminders (text, created_at) VALUES ('Muista', '2026-11-25') RETURNING id"
      )
      .get()!;
    expect(id).toBe(8);
    migrated.close();
  });
});

describe('schema 16', () => {
  test("keeps a Tag a Tag by its Box, and hands out no deleted link's id", () => {
    const before = oldest();
    fill(before);
    before.run(
      "INSERT INTO media_links (id, media_id, scope_type, scope_id) VALUES (9, 1, 'person', 1)"
    );
    before.run('DELETE FROM media_links WHERE id = 9');
    before.close();
    const migrated = openDb(path);
    // Person 2's Box is still their one Tag in the Photo.
    expect(() =>
      migrated.run(
        "INSERT INTO media_links (media_id, scope_type, scope_id, crop_top, crop_left, crop_width, crop_height) VALUES (1, 'person', 2, 5, 6, 7, 8)"
      )
    ).toThrow(/UNIQUE/u);
    const { id } = migrated
      .query<{ id: number }, []>(
        "INSERT INTO media_links (media_id, scope_type, scope_id) VALUES (1, 'person', 2) RETURNING id"
      )
      .get()!;
    expect(id).toBe(10);
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

describe('a step', () => {
  const ALLOWED = new Set(['bun:sqlite', './migrations']);

  // A step that used the app's code would change with it, or fail on a
  // database older than that code expects.
  test("is frozen: it imports none of the app's code", () => {
    const steps = readdirSync(import.meta.dir).filter((f) =>
      /^migration-\d+\.ts$/u.test(f)
    );
    for (const step of steps) {
      const source = readFileSync(join(import.meta.dir, step), 'utf8');
      const outside = [...source.matchAll(/from '(?<from>[^']+)'/gu)]
        .map((m) => m.groups!.from!)
        .filter((from) => !ALLOWED.has(from));
      expect({ step, outside }).toEqual({ step, outside: [] });
    }
  });
});
