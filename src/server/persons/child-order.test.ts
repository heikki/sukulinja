import { beforeEach, expect, test } from 'bun:test';

import { openDb } from '../datasets/db';
import { createFacts } from '../facts/facts';
import { parseGedcom } from '../gedcom/parser';
import { importGedcom } from '../import/gedcom';
import { createRelatives } from './relatives';

// Made-up people: Matti (1) and Liisa (2), with Juho (3), born 1780, Anna
// (4), with no date, and Kalle (5), baptised 1790, in the order an import
// gave.
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/',
  '0 @I2@ INDI',
  '1 NAME Liisa /Malli/',
  '0 @I3@ INDI',
  '1 NAME Juho /Esimerkki/',
  '1 BIRT',
  '2 DATE 3 MAR 1780',
  '0 @I4@ INDI',
  '1 NAME Anna /Esimerkki/',
  '0 @I5@ INDI',
  '1 NAME Kalle /Esimerkki/',
  '1 CHR',
  '2 DATE 1790',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 CHIL @I3@',
  '1 CHIL @I4@',
  '1 CHIL @I5@',
  ''
].join('\n');

const LIISA = 2;
const JUHO = 3;
const ANNA = 4;
const KALLE = 5;

const BLANK = { date: '', place: '', value: '', type: '' };

let db = openDb(':memory:');

beforeEach(() => {
  db = openDb(':memory:');
  importGedcom(db, parseGedcom(GEDCOM), () => null);
});

function children() {
  return db
    .query<{ person_id: number }, []>(
      'SELECT person_id FROM family_children WHERE family_id = 1 ORDER BY sort_order'
    )
    .all()
    .map((r) => r.person_id);
}

function relatives() {
  return createRelatives(db, () => undefined);
}

function facts() {
  return createFacts(db, () => undefined);
}

// A new child of Liisa, born on `date` when it's given.
function addChild(date?: string) {
  const answer = relatives().add(LIISA, {
    relation: 'child',
    who: { given: 'Uusi', surname: 'Esimerkki', sex: 'U' },
    familyId: 1
  });
  if (answer === null || 'rejected' in answer) throw new Error('not added');
  if (date !== undefined) {
    facts().add(answer.id, { ...BLANK, tag: 'BIRT', date, familyId: null });
  }
  return answer.id;
}

test('a child with no date goes last, the imported order kept', () => {
  const child = addChild();
  expect(children()).toEqual([JUHO, ANNA, KALLE, child]);
});

test('a child born earlier goes before those born later', () => {
  const child = addChild('1.1.1785');
  expect(children()).toEqual([JUHO, ANNA, child, KALLE]);
  const first = addChild('1770');
  expect(children()).toEqual([first, JUHO, ANNA, child, KALLE]);
});

test('changing or deleting a birth or baptism date moves the child', () => {
  const [birth] = db
    .query<{ id: number }, []>(
      "SELECT id FROM facts WHERE tag = 'BIRT' AND scope_id = 3"
    )
    .all();
  facts().edit(JUHO, birth!.id, { ...BLANK, date: '1795' });
  expect(children()).toEqual([ANNA, KALLE, JUHO]);
  facts().add(ANNA, { ...BLANK, tag: 'CHR', date: '1791', familyId: null });
  expect(children()).toEqual([KALLE, ANNA, JUHO]);
  facts().remove(JUHO, birth!.id);
  expect(children()).toEqual([KALLE, ANNA, JUHO]);
  facts().add(JUHO, { ...BLANK, tag: 'BIRT', date: '1700', familyId: null });
  expect(children()).toEqual([JUHO, KALLE, ANNA]);
});
