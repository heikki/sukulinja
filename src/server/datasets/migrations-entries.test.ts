// Migrating a dataset's Citations to Entries (ADR-0026): schemas 6 and 7,
// from a database of the oldest schema.

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CITATIONS_READ } from '../citations';
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

describe('schema 6', () => {
  test("makes one Entry of the app's Citations alike, and leaves the rest", () => {
    const db = oldest();
    runAll(
      db,
      `
      INSERT INTO persons (id, xref) VALUES (1, '@I1@'), (2, '@I2@'), (3, '@I3@');
      INSERT INTO sources (id, xref, title) VALUES (1, '@S1@', 'Juva');
      INSERT INTO citations (id, scope_type, scope_id, source_id, page, text,
        link_volume_id, link_volume, link_image, link_file_id, link_box_left,
        link_box_top, link_box_width, link_box_height, link_by, added_in_app)
        VALUES (1, 'person', 1, 1, 'u', 'Kaste', 'v1', 'Kastetut', 12, 'f1',
            10, 20, 30, 40, 'hand', 1),
          (2, 'person', 2, 1, 'u', 'Kaste', 'v1', 'Kastetut', 12, 'f1',
            10, 20, 30, 40, 'hand', 1),
          (3, 'person', 3, 1, 'u', 'Kaste', 'v1', 'Kastetut', 12, 'f1',
            12, 20, 30, 40, 'hand', 1),
          (4, 'person', 3, 1, 'r', NULL, 'v1', 'Kastetut', 12, 'f1',
            10, 20, 30, 40, 'hand', 0);
    `
    );
    db.close();
    const migrated = openDb(path);
    expect(
      migrated
        .query(
          'SELECT id, entry_id, source_id, link_image FROM citations ORDER BY id'
        )
        .all()
    ).toEqual([
      { id: 1, entry_id: 1, source_id: null, link_image: null },
      { id: 2, entry_id: 1, source_id: null, link_image: null },
      // Its Box is all but the same: one entry.
      { id: 3, entry_id: 1, source_id: null, link_image: null },
      // A reference keeps its link on its citation.
      { id: 4, entry_id: null, source_id: 1, link_image: 12 }
    ]);
    expect(
      migrated
        .query('SELECT id, text, image, box_left FROM entries ORDER BY id')
        .all()
    ).toEqual([{ id: 1, text: 'Kaste', image: 12, box_left: 10 }]);
    expect(
      migrated
        .query(
          `SELECT id, source_id, link_by, link_box_left FROM ${CITATIONS_READ}
           WHERE id = 2`
        )
        .get()
    ).toEqual({ id: 2, source_id: 1, link_by: 'hand', link_box_left: 10 });
    migrated.close();
  });
});

describe('schema 7', () => {
  test('makes Entries of one entry one, each keeping words of its own', () => {
    const db = oldest();
    runAll(
      db,
      `
      INSERT INTO persons (id, xref) VALUES (1, '@I1@'), (2, '@I2@'), (3, '@I3@');
      INSERT INTO sources (id, xref, title) VALUES (1, '@S1@', 'Juva');
      INSERT INTO citations (id, scope_type, scope_id, source_id, page, text,
        link_volume_id, link_volume, link_image, link_file_id, link_box_left,
        link_box_top, link_box_width, link_box_height, link_by, added_in_app)
        VALUES (1, 'person', 1, 1, 'u', 'Matti, kaste', 'v1', 'Kastetut', 12,
            'f1', 10, 20, 300, 40, 'hand', 1),
          (2, 'person', 2, 1, 'u', 'Juho, kaste', 'v1', 'Kastetut', 12, 'f1',
            10, 20, 300, 40, 'hand', 1),
          (3, 'person', 3, 1, 'u', 'Liisa, kaste', 'v1', 'Kastetut', 12,
            'f1', 10, 70, 300, 40, 'hand', 1);
    `
    );
    db.close();
    const migrated = openDb(path);
    expect(
      migrated
        .query(`SELECT id, entry_id, text FROM ${CITATIONS_READ} ORDER BY id`)
        .all()
    ).toEqual([
      { id: 1, entry_id: 1, text: 'Matti, kaste' },
      { id: 2, entry_id: 1, text: 'Juho, kaste' },
      // Another entry, below.
      { id: 3, entry_id: 3, text: 'Liisa, kaste' }
    ]);
    expect(
      migrated.query('SELECT id, text FROM entries ORDER BY id').all()
    ).toEqual([
      { id: 1, text: 'Matti, kaste' },
      { id: 3, text: 'Liisa, kaste' }
    ]);
    expect(
      migrated.query('SELECT id, text FROM citations ORDER BY id').all()
    ).toEqual([
      { id: 1, text: null },
      { id: 2, text: 'Juho, kaste' },
      { id: 3, text: null }
    ]);
    migrated.close();
  });
});

describe('schema 8', () => {
  test("places a baptism's people in their Roles as the tree tells", () => {
    const db = oldest();
    runAll(
      db,
      `
      INSERT INTO persons (id, xref) VALUES (1, '@I1@'), (2, '@I2@'), (3, '@I3@'),
        (4, '@I4@');
      INSERT INTO families (id, xref, husband_id, wife_id) VALUES (1, '@F1@', 2, 3);
      INSERT INTO family_children (family_id, person_id) VALUES (1, 1);
      INSERT INTO sources (id, xref, title) VALUES (1, '@S1@', 'Juva');
      INSERT INTO citations (id, scope_type, scope_id, source_id, page, text,
        link_volume_id, link_volume, link_image, link_file_id, link_box_left,
        link_box_top, link_box_width, link_box_height, link_by, added_in_app)
        VALUES
          (1, 'person', 1, 1, 'u', 'Kaste', 'v1',
            'I C:1 Syntyneiden ja kastettujen luettelot', 12, 'f1',
            10, 20, 300, 40, 'hand', 1),
          (2, 'person', 2, 1, 'u', 'Kaste', 'v1',
            'I C:1 Syntyneiden ja kastettujen luettelot', 12, 'f1',
            10, 20, 300, 40, 'hand', 1),
          (3, 'person', 3, 1, 'u', 'Kaste', 'v1',
            'I C:1 Syntyneiden ja kastettujen luettelot', 12, 'f1',
            10, 20, 300, 40, 'hand', 1),
          (4, 'person', 4, 1, 'u', 'Kaste', 'v1',
            'I C:1 Syntyneiden ja kastettujen luettelot', 12, 'f1',
            10, 20, 300, 40, 'hand', 1);
    `
    );
    db.close();
    const migrated = openDb(path);
    expect(
      migrated
        .query('SELECT id, entry_id, role FROM citations ORDER BY id')
        .all()
    ).toEqual([
      { id: 1, entry_id: 1, role: 'CHIL' },
      { id: 2, entry_id: 1, role: 'FATH' },
      { id: 3, entry_id: 1, role: 'MOTH' },
      // The tree doesn't place them.
      { id: 4, entry_id: 1, role: null }
    ]);
    migrated.close();
  });
});
