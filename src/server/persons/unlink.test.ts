import { beforeEach, expect, test } from 'bun:test';

import type { NewChange } from '@/common/types';

import { openDb } from '../datasets/db';
import { parseGedcom } from '../gedcom/parser';
import { importGedcom } from '../import/gedcom';
import { createUnlink } from './unlink';

// Made-up people: Matti (1) and Liisa (2) with Juho (3), who married
// Liisa's sister Anna (4) in a family with a marriage; Liisa is also
// alone in a family of her own (F3).
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/',
  '0 @I2@ INDI',
  '1 NAME Liisa /Malli/',
  '0 @I3@ INDI',
  '1 NAME Juho /Esimerkki/',
  '0 @I4@ INDI',
  '1 NAME Anna /Malli/',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 CHIL @I3@',
  '0 @F2@ FAM',
  '1 HUSB @I3@',
  '1 WIFE @I4@',
  '0 @F3@ FAM',
  '1 WIFE @I2@',
  '1 MARR',
  '2 DATE 1780',
  '2 SOUR Kirkonkirja',
  '1 NOTE Toinen avioliitto',
  ''
].join('\n');

let db = openDb(':memory:');
let changes: NewChange[] = [];
let unlinking = createUnlink(db, () => undefined);

beforeEach(() => {
  db = openDb(':memory:');
  importGedcom(db, parseGedcom(GEDCOM), () => null);
  changes = [];
  unlinking = createUnlink(db, (c) => {
    changes.push(c);
  });
});

function count(sql: string) {
  return db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${sql}`).get()!
    .n;
}

test('refuses what would cut someone off, writing nothing', () => {
  expect(unlinking.unlink(3, 1)).toEqual({
    rejected: 'That would cut someone off from the tree.'
  });
  expect(unlinking.unlink(4, 2)).toEqual({
    rejected: 'That would cut someone off from the tree.'
  });
  expect(unlinking.unlink(4, 1)).toBeNull();
  expect(unlinking.unlink(3, 99)).toBeNull();
  expect(changes).toEqual([]);
});

test('a family left with no one goes, with what it held', () => {
  expect(unlinking.unlink(2, 3)).toEqual({ id: 2 });
  expect(count('families WHERE id = 3')).toBe(0);
  expect(count('facts')).toBe(0);
  expect(count('citations')).toBe(0);
  expect(count("notes WHERE owner_type = 'family'")).toBe(0);
  expect(count('persons')).toBe(4);
  expect(changes).toEqual([
    {
      on: { personId: 2 },
      what: { kind: 'person', did: 'unlink', relation: 'spouse', of: '' }
    }
  ]);
});

test('with another way round, they leave the family, which stays', () => {
  // Juho's wife Anna a daughter of Matti and Liisa too.
  db.run('INSERT INTO family_children (family_id, person_id) VALUES (1, 4)');
  expect(unlinking.unlink(3, 1)).toEqual({ id: 3 });
  expect(count('family_children WHERE family_id = 1')).toBe(1);
  expect(
    db
      .query('SELECT change_date IS NOT NULL AS c FROM families WHERE id = 1')
      .get()
  ).toEqual({ c: 1 });
  expect(changes[0]!.what).toEqual({
    kind: 'person',
    did: 'unlink',
    relation: 'child',
    of: 'Matti Esimerkki and Liisa Malli'
  });
  expect(unlinking.unlink(4, 2)).toEqual({
    rejected: 'That would cut someone off from the tree.'
  });
});

test('a spouse leaves a family that stays with the other in it', () => {
  db.run('INSERT INTO family_children (family_id, person_id) VALUES (1, 4)');
  expect(unlinking.unlink(4, 2)).toEqual({ id: 4 });
  expect(
    db.query('SELECT husband_id, wife_id FROM families WHERE id = 2').get()
  ).toEqual({ husband_id: 3, wife_id: null });
});
