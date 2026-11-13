// Migrating a dataset's places (ADR-0023, ADR-0024): schemas 6 to 8 move
// an address standing alone to the place, and write places one way.

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

function runAll(db: Database, sql: string) {
  for (const stmt of sql.split(';').map((s) => s.trim())) {
    if (stmt !== '') db.run(stmt);
  }
}

// A database of the oldest schema migrated.
function oldest() {
  const db = new Database(path, { create: true });
  runAll(db, OLDEST_SQL);
  db.run(`PRAGMA user_version = ${OLDEST_MIGRATED};`);
  return db;
}

describe('schema 6', () => {
  test('makes an address standing alone the place, and says so once', () => {
    const db = oldest();
    runAll(
      db,
      `
      INSERT INTO persons (id, xref) VALUES (1, '@I1@');
      INSERT INTO facts (id, scope_type, scope_id, tag, place, address)
        VALUES (1, 'person', 1, 'RESI', NULL, 'Laukola, Haukivuori, Suomi'),
          (2, 'person', 1, 'RESI', NULL, 'Mannerheimintie 1, 00100 Helsinki'),
          (3, 'person', 1, 'RESI', 'Helsinki', 'Kaisaniemi');
      INSERT INTO addresses (owner_type, owner_id, line1)
        VALUES ('fact', 1, 'Laukola, Haukivuori, Suomi'),
          ('fact', 2, 'Mannerheimintie 1, 00100 Helsinki');
    `
    );
    db.close();
    const migrated = openDb(path);
    expect(
      migrated.query('SELECT id, place, address FROM facts ORDER BY id').all()
    ).toEqual([
      { id: 1, place: 'Laukola, Haukivuori, Suomi', address: null },
      { id: 2, place: null, address: 'Mannerheimintie 1, 00100 Helsinki' },
      { id: 3, place: 'Helsinki', address: 'Kaisaniemi' }
    ]);
    expect(migrated.query('SELECT owner_id FROM addresses').all()).toEqual([
      { owner_id: 2 }
    ]);
    expect(migrated.query('SELECT what, person_id FROM changes').all()).toEqual(
      [{ what: '{"kind":"addresses-to-places","facts":1}', person_id: null }]
    );
    migrated.close();
  });
});

describe('schema 7', () => {
  test("writes a place in Finland one way, keeping where it's on the map", () => {
    const db = oldest();
    runAll(
      db,
      `
      INSERT INTO persons (id, xref) VALUES (1, '@I1@');
      INSERT INTO facts (id, scope_type, scope_id, tag, place, latitude)
        VALUES (1, 'person', 1, 'CHR', 'Juva, Mikkeli, Finland', 'N61.9'),
          (2, 'person', 1, 'RESI', 'Juva, Suomi', NULL),
          (3, 'person', 1, 'DEAT', 'Portland, Oregon, USA', NULL);
    `
    );
    db.close();
    const migrated = openDb(path);
    expect(
      migrated.query('SELECT id, place, latitude FROM facts ORDER BY id').all()
    ).toEqual([
      { id: 1, place: 'Juva, Suomi', latitude: 'N61.9' },
      { id: 2, place: 'Juva, Suomi', latitude: null },
      { id: 3, place: 'Portland, Oregon, USA', latitude: null }
    ]);
    expect(migrated.query('SELECT what FROM changes').all()).toEqual([
      { what: '{"kind":"places-tidied","facts":1}' }
    ]);
    migrated.close();
  });
});

describe('schema 8', () => {
  test('names a village named as its parish once, after schema 7', () => {
    const db = oldest();
    runAll(
      db,
      `
      INSERT INTO persons (id, xref) VALUES (1, '@I1@');
      INSERT INTO facts (id, scope_type, scope_id, tag, place)
        VALUES (1, 'person', 1, 'RESI', 'Laukola, Haukivuori, Haukivuori, Suomi');
    `
    );
    db.run('PRAGMA user_version = 7;');
    db.close();
    const migrated = openDb(path);
    expect(migrated.query('SELECT place FROM facts').all()).toEqual([
      { place: 'Laukola, Haukivuori, Suomi' }
    ]);
    migrated.close();
  });
});
