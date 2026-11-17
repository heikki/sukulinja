// Migrating the Citations on Facts (ADR-0022): schemas 5 and 11, from a
// database of the oldest schema.

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb } from './db';
import { OLDEST_MIGRATED } from './migrations';

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

// A database the oldest schema migrated built.
function oldest() {
  const db = new Database(path, { create: true });
  db.run('PRAGMA foreign_keys = ON;');
  runAll(db, OLDEST_SQL);
  db.run(`PRAGMA user_version = ${OLDEST_MIGRATED};`);
  return db;
}

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
      { id: 4, scope_type: 'family', scope_id: 1, sort_order: 0 }
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

describe('schema 11', () => {
  test("drops a Citation left on a Fact that's gone, and 'fact' from the CHECK", () => {
    const db = oldest();
    runAll(
      db,
      `
      INSERT INTO persons (id, xref) VALUES (1, '@I1@');
      INSERT INTO sources (id, xref, title) VALUES (1, '@S1@', 'Juva');
      INSERT INTO media (id, file_path) VALUES (1, 'm/1.jpg');
      INSERT INTO citations (id, scope_type, scope_id, source_id, page)
        VALUES (1, 'person', 1, 1, 'p. 1'), (2, 'fact', 9, 1, 'p. 2');
      INSERT INTO notes (owner_type, owner_id, text)
        VALUES ('citation', 1, 'kept'), ('citation', 2, 'gone');
      INSERT INTO media_links (media_id, scope_type, scope_id)
        VALUES (1, 'citation', 1), (1, 'citation', 2);
      INSERT INTO changes (at, what, citation_id)
        VALUES ('t', '{"kind":"cited"}', 1), ('t', '{"kind":"cited"}', 2);
    `
    );
    db.close();
    const migrated = openDb(path);
    expect(migrated.query('SELECT id FROM citations').all()).toEqual([
      { id: 1 }
    ]);
    expect(migrated.query('SELECT text FROM notes').all()).toEqual([
      { text: 'kept' }
    ]);
    expect(migrated.query('SELECT scope_id FROM media_links').all()).toEqual([
      { scope_id: 1 }
    ]);
    expect(
      migrated.query('SELECT citation_id FROM changes ORDER BY id').all()
    ).toEqual([{ citation_id: 1 }, { citation_id: null }]);
    expect(() =>
      migrated.run(
        "INSERT INTO citations (scope_type, scope_id) VALUES ('fact', 1)"
      )
    ).toThrow();
    migrated.close();
  });
});
