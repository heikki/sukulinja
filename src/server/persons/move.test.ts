import { beforeEach, expect, test } from 'bun:test';

import type { NewChange } from '@/common/types';

import { openDb } from '../datasets/db';
import { parseGedcom } from '../gedcom/parser';
import { importGedcom } from '../import/gedcom';
import { createMove } from './move';

// Made-up people: Matti (1) and Liisa (2) with Juho (3, 1780) and Anna (4,
// 1790); Juho and Maria (5) with Kalle (6), born 1785, linked there by
// mistake: he is Matti and Liisa's son.
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/',
  '1 SEX M',
  '0 @I2@ INDI',
  '1 NAME Liisa /Malli/',
  '1 SEX F',
  '0 @I3@ INDI',
  '1 NAME Juho /Esimerkki/',
  '1 BIRT',
  '2 DATE 1780',
  '0 @I4@ INDI',
  '1 NAME Anna /Esimerkki/',
  '1 BIRT',
  '2 DATE 1790',
  '0 @I5@ INDI',
  '1 NAME Maria /Muu/',
  '1 SEX F',
  '0 @I6@ INDI',
  '1 NAME Kalle /Esimerkki/',
  '1 BIRT',
  '2 DATE 1785',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 CHIL @I3@',
  '1 CHIL @I4@',
  '0 @F2@ FAM',
  '1 HUSB @I3@',
  '1 WIFE @I5@',
  '1 CHIL @I6@',
  ''
].join('\n');

let db = openDb(':memory:');
let changes: NewChange[] = [];
let moving = createMove(db, () => undefined);

beforeEach(() => {
  db = openDb(':memory:');
  importGedcom(db, parseGedcom(GEDCOM), () => null);
  changes = [];
  moving = createMove(db, (c) => {
    changes.push(c);
  });
});

function children(familyId: number) {
  return db
    .query<{ person_id: number }, [number]>(
      'SELECT person_id FROM family_children WHERE family_id = ? ORDER BY sort_order'
    )
    .all(familyId)
    .map((r) => r.person_id);
}

function families() {
  return db
    .query('SELECT id, husband_id, wife_id FROM families ORDER BY id')
    .all();
}

test('a child moved to other parents goes in birth order, in one go', () => {
  expect(moving.move(6, 2, { familyId: 1 })).toEqual({ id: 6 });
  expect(children(1)).toEqual([3, 6, 4]);
  expect(children(2)).toEqual([]);
  expect(changes).toEqual([
    {
      on: { personId: 6 },
      what: {
        kind: 'person',
        did: 'move',
        relation: 'child',
        of: 'Matti Esimerkki and Liisa Malli'
      }
    }
  ]);
});

test('a spouse moved to someone else starts a family with them', () => {
  db.run('DELETE FROM family_children WHERE person_id = 6');
  expect(moving.move(5, 2, { personId: 4 })).toEqual({ id: 5 });
  expect(families()).toEqual([
    { id: 1, husband_id: 1, wife_id: 2 },
    { id: 2, husband_id: 3, wife_id: null },
    { id: 3, husband_id: 4, wife_id: 5 }
  ]);
  expect(changes[0]!.what).toMatchObject({ did: 'move', of: 'Anna Esimerkki' });
});

test('an emptied family goes', () => {
  // Kalle also alone in a family of no parents.
  db.run("INSERT INTO families (id, xref, uid) VALUES (3, '@F3@', 'x')");
  db.run('INSERT INTO family_children (family_id, person_id) VALUES (3, 6)');
  expect(moving.move(6, 3, { familyId: 1 })).toEqual({ id: 6 });
  expect(families()).toHaveLength(2);
  expect(children(1)).toEqual([3, 6, 4]);
});

test('refuses what would make someone their own ancestor, or put them where they are', () => {
  expect(moving.move(3, 1, { familyId: 2 })).toEqual({
    rejected: 'They are in that family already.'
  });
  expect(moving.move(3, 1, { personId: 6 })).toEqual({
    rejected: "They can't be a child of their own descendant."
  });
  expect(moving.move(1, 1, { familyId: 2 })).toEqual({
    rejected: 'That family has two parents already.'
  });
  expect(moving.move(6, 1, { familyId: 2 })).toBeNull();
  expect(changes).toEqual([]);
});
