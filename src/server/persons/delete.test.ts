import { beforeEach, expect, test } from 'bun:test';

import type { NewChange } from '@/common/types';

import { openDb } from '../datasets/db';
import { parseGedcom } from '../gedcom/parser';
import { importGedcom } from '../import/gedcom';
import { createDeletion } from './delete';

// Made-up people in a chain: Matti (1) and Liisa (2) with Juho (3), who
// married Anna (4) and had Kalle (5). Kalle holds a bit of everything.
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/',
  '0 @I2@ INDI',
  '1 NAME Liisa /Malli/',
  '0 @I3@ INDI',
  '1 NAME Juho /Esimerkki/',
  '0 @I4@ INDI',
  '1 NAME Anna /Muu/',
  '0 @I5@ INDI',
  '1 NAME Kalle /Esimerkki/',
  '2 SOUR Kastettujen luettelo',
  '2 NOTE Nimi kastekirjasta',
  '1 BIRT',
  '2 DATE 1800',
  '2 SOUR Kirkonkirja',
  '3 NOTE Sivu 12',
  '2 NOTE Syntyi kotona',
  '1 SOUR Rippikirja',
  '1 NOTE Torppari',
  '2 SOUR Muistiinpano',
  '1 ASSO @I1@',
  '2 ROLE GODP',
  '2 NOTE Kummi',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 CHIL @I3@',
  '0 @F2@ FAM',
  '1 HUSB @I3@',
  '1 WIFE @I4@',
  '1 CHIL @I5@',
  ''
].join('\n');

const JUHO = 3;
const KALLE = 5;

let db = openDb(':memory:');
let changes: NewChange[] = [];
let deletion = createDeletion(db, () => undefined);

beforeEach(() => {
  db = openDb(':memory:');
  importGedcom(db, parseGedcom(GEDCOM), () => null);
  changes = [];
  deletion = createDeletion(db, (c) => {
    changes.push(c);
  });
});

function rows(table: string) {
  return db.query(`SELECT * FROM ${table}`).all();
}

test('someone in the middle of a chain can’t go, writing nothing', () => {
  expect(deletion.remove(JUHO)).toEqual({
    rejected: 'That would cut someone off from the tree.'
  });
  expect(deletion.remove(99)).toBeNull();
  expect(rows('persons')).toHaveLength(5);
  expect(changes).toEqual([]);
});

test('one at the end goes, with everything they held', () => {
  const tables = [
    'names',
    'name_pieces',
    'facts',
    'citations',
    'notes',
    'associations',
    'media_links'
  ];
  db.run("INSERT INTO media (file_path) VALUES ('kuva.jpg'), ('muu.jpg')");
  db.run(
    `INSERT INTO media_links (media_id, scope_type, scope_id, crop_top,
       crop_left, crop_width, crop_height, added_in_app)
     VALUES (1, 'person', ${KALLE}, 0, 0, 10, 10, 1), (2, 'person', 1, 0, 0, 10, 10, 1)`
  );
  const kept = new Map(tables.map((t) => [t, rows(t).length]));
  expect(deletion.remove(KALLE)).toEqual({ id: KALLE });
  expect(rows('persons')).toHaveLength(4);
  expect(rows('names')).toHaveLength(4);
  expect(rows('facts')).toEqual([]);
  expect(rows('citations')).toEqual([]);
  expect(rows('notes')).toEqual([]);
  expect(rows('associations')).toEqual([]);
  expect(rows('media_links')).toHaveLength(1);
  expect(kept.get('citations')).toBeGreaterThan(0);
  expect(db.query('SELECT person_id FROM family_children').all()).toEqual([
    { person_id: JUHO }
  ]);
  expect(changes).toEqual([
    { on: { personId: KALLE }, what: { kind: 'person', did: 'delete' } }
  ]);
});

test('an emptied family goes, one with someone left stays; the last person stays', () => {
  deletion.remove(KALLE);
  deletion.remove(4);
  expect(rows('families')).toHaveLength(2);
  deletion.remove(JUHO);
  expect(rows('families')).toHaveLength(1);
  deletion.remove(2);
  expect(rows('families')).toMatchObject([{ husband_id: 1, wife_id: null }]);
  expect(deletion.remove(1)).toEqual({
    rejected: "The last person can't be deleted."
  });
});
