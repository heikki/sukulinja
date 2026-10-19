import { expect, test } from 'bun:test';

import { openDb } from './db';
import { importGedcom } from './gedcom-import';
import { parseGedcom } from './gedcom-parser';
import { createTree } from './tree';

const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Matti /esimerkki/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE ABT 1757',
  '1 DEAT',
  '2 DATE 12 MAR 1820',
  '1 OBJE',
  '2 FILE first.jpg',
  '1 OBJE',
  '2 FILE primary.jpg',
  '3 CROP',
  '4 TOP 1',
  '4 LEFT 2',
  '4 WIDTH 3',
  '4 HEIGHT 4',
  '2 _PRIM Y',
  '0 @I2@ INDI',
  '1 NAME Anna /Aho/',
  '1 SEX F',
  '1 OBJE',
  '2 FILE half-cropped.jpg',
  '3 CROP',
  '4 TOP 1',
  '4 LEFT 2',
  '1 OBJE',
  '2 FILE second.jpg',
  '0 @I3@ INDI',
  '1 NAME Liisa /Esimerkki/',
  '0 @I4@ INDI',
  '1 NAME Juho /Esimerkki/',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 CHIL @I4@',
  '1 CHIL @I3@'
].join('\n');

function tree() {
  const db = openDb(':memory:');
  importGedcom(db, parseGedcom(GEDCOM), (path) => path);
  return createTree(db);
}

test('lists persons by surname, then given name, ignoring case', () => {
  expect(
    tree()
      .persons()
      .map((p) => p.given)
  ).toEqual(['Anna', 'Juho', 'Liisa', 'Matti']);
});

test('reads the years from dates as written', () => {
  const people = tree().persons();
  const matti = people.find((p) => p.given === 'Matti')!;
  expect(matti).toMatchObject({
    birth_date: 'ABT 1757',
    birth_year: 1757,
    death_date: '12 MAR 1820',
    death_year: 1820
  });
  const liisa = people.find((p) => p.given === 'Liisa')!;
  expect(liisa).toMatchObject({ birth_year: null, death_year: null });
});

test('takes the photo marked primary, else the first, with its crop', () => {
  const people = tree().persons();
  expect(people.find((p) => p.given === 'Matti')).toMatchObject({
    photo_path: 'primary.jpg',
    crop: { top: 1, left: 2, width: 3, height: 4 }
  });
  // A crop without all four sides is none.
  expect(people.find((p) => p.given === 'Anna')).toMatchObject({
    photo_path: 'half-cropped.jpg',
    crop: null
  });
  expect(people.find((p) => p.given === 'Liisa')).toMatchObject({
    photo_path: null,
    crop: null
  });
});

test('lists each family with its children in GEDCOM order', () => {
  const t = tree();
  const idOf = new Map(t.persons().map((p) => [p.given, p.id]));
  expect(t.families()).toEqual([
    {
      id: expect.any(Number) as number,
      husband_id: idOf.get('Matti')!,
      wife_id: idOf.get('Anna')!,
      child_ids: [idOf.get('Juho')!, idOf.get('Liisa')!]
    }
  ]);
});
