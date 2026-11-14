import { beforeEach, expect, test } from 'bun:test';

import { treeSnapshot } from '../../../test/tree-snapshot';
import type { NewChange } from '../changes/changes';
import { openDb } from '../datasets/db';
import { exportGedcom } from '../export/gedcom';
import { parseGedcom } from '../gedcom/parser';
import { importGedcom } from '../import/gedcom';
import { createPersons } from './persons';

// Made-up people: Matti (1), whose name has its pieces and a suffix, and
// Liisa (2), with a second name.
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/ Jr.',
  '2 GIVN Matti',
  '2 SURN Esimerkki',
  '2 NICK Masa',
  '1 SEX M',
  '0 @I2@ INDI',
  '1 NAME Liisa /Malli/',
  '1 NAME Liisa /Esimerkki/',
  '2 TYPE MARRIED',
  '1 SEX F',
  ''
].join('\n');

let db = openDb(':memory:');
let changes: NewChange[] = [];
let persons = createPersons(db, () => undefined);

beforeEach(() => {
  db = openDb(':memory:');
  importGedcom(db, parseGedcom(GEDCOM), () => null);
  changes = [];
  persons = createPersons(db, (c) => {
    changes.push(c);
  });
});

function names(personId: number) {
  return db
    .query<Record<string, unknown>, [number]>(
      `SELECT full_text, given, surname FROM names
       WHERE person_id = ? ORDER BY sort_order`
    )
    .all(personId);
}

function pieces() {
  return db
    .query<{ tag: string; value: string }, []>(
      'SELECT tag, value FROM name_pieces ORDER BY sort_order'
    )
    .all();
}

test('changes the first name, keeping its suffix, and the pieces with it', () => {
  expect(
    persons.edit(1, { given: ' Matti Juho ', surname: 'Malli', sex: 'M' })
  ).toEqual({ id: 1 });
  expect(names(1)).toEqual([
    {
      full_text: 'Matti Juho /Malli/ Jr.',
      given: 'Matti Juho',
      surname: 'Malli'
    }
  ]);
  expect(pieces()).toEqual([
    { tag: 'GIVN', value: 'Matti Juho' },
    { tag: 'SURN', value: 'Malli' },
    { tag: 'NICK', value: 'Masa' }
  ]);
  persons.edit(1, { given: 'Matti Juho', surname: '', sex: 'M' });
  expect(pieces().map((p) => p.tag)).toEqual(['GIVN', 'NICK']);
});

test('changes only the first of several names, and the sex', () => {
  persons.edit(2, { given: 'Lisa', surname: 'Malli', sex: 'X' });
  expect(names(2)).toEqual([
    { full_text: 'Lisa /Malli/', given: 'Lisa', surname: 'Malli' },
    { full_text: 'Liisa /Esimerkki/', given: 'Liisa', surname: 'Esimerkki' }
  ]);
  expect(
    db
      .query(
        'SELECT sex, change_date IS NOT NULL AS changed FROM persons WHERE id = 2'
      )
      .get()
  ).toEqual({ sex: 'X', changed: 1 });
});

test('is a Change saying the name and sex before and after, unless nothing changed', () => {
  persons.edit(2, { given: 'Liisa', surname: 'Malli', sex: 'F' });
  expect(changes).toEqual([]);
  persons.edit(2, { given: 'Liisa', surname: 'Esimerkki', sex: 'U' });
  expect(changes).toEqual([
    {
      on: { personId: 2 },
      what: {
        kind: 'person',
        did: 'edit',
        was: 'Liisa Malli, female',
        now: 'Liisa Esimerkki'
      }
    }
  ]);
});

test('refuses what it can’t store, writing nothing', () => {
  const before = treeSnapshot(db);
  expect(persons.edit(99, { given: 'X', surname: '', sex: 'M' })).toBeNull();
  expect(persons.edit(1, { given: '', surname: ' ', sex: 'M' })).toEqual({
    rejected: 'Write a name.'
  });
  expect(persons.edit(1, { given: 'A/B', surname: '', sex: 'M' })).toEqual({
    rejected: "A name can't have a slash in it."
  });
  expect(treeSnapshot(db)).toEqual(before);
  expect(changes).toEqual([]);
});

test('the GEDZIP carries the changed name back', () => {
  persons.edit(1, { given: 'Matti', surname: 'Malli', sex: 'U' });
  const again = openDb(':memory:');
  importGedcom(again, parseGedcom(exportGedcom(db).text), () => null);
  expect(treeSnapshot(again)).toEqual(treeSnapshot(db));
});
