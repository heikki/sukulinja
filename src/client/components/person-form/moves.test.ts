import { expect, test } from 'bun:test';

import type { FamilyRow, PersonRow } from '@/common/types';

import { moveChoices, movings } from './moves';

function person(id: number, given: string): PersonRow {
  return {
    id,
    given,
    surname: 'Esimerkki',
    sex: null,
    birth_year: null,
    death_year: null,
    birth_date: null,
    death_date: null,
    died: false,
    photo_path: null,
    crop: null
  };
}

const PERSONS = new Map(
  [
    person(1, 'Matti'),
    person(2, 'Liisa'),
    person(3, 'Juho'),
    person(4, 'Anna')
  ].map((p) => [p.id, p])
);

// Matti (1) and Liisa (2) with Juho (3); Juho and Anna (4); Matti alone in
// a second family.
const FAMILIES: FamilyRow[] = [
  { id: 1, husband_id: 1, wife_id: 2, child_ids: [3] },
  { id: 2, husband_id: 3, wife_id: 4, child_ids: [] },
  { id: 3, husband_id: 1, wife_id: null, child_ids: [] }
];
const TREE = { persons: PERSONS, families: FAMILIES };

test('offers moving out of each family they are in', () => {
  expect(movings(3, TREE)).toEqual([
    { from: 1, asParent: false, label: 'Move to other parents…' },
    { from: 2, asParent: true, label: 'Move to another spouse…' }
  ]);
  expect(movings(1, TREE).map((m) => m.label)).toEqual([
    'Move from Liisa Esimerkki to another spouse…',
    'Move to another spouse…'
  ]);
});

test('a child can go into any family of the one picked, a parent where there is a place', () => {
  const asChild = { from: 2, asParent: false, label: '' };
  expect(moveChoices(1, asChild, TREE)).toEqual([
    { to: { familyId: 1 }, label: 'With Liisa Esimerkki' },
    { to: { familyId: 3 }, label: 'With no other parent' },
    { to: { personId: 1 }, label: 'A new family of theirs' }
  ]);
  const asParent = { from: 2, asParent: true, label: '' };
  expect(moveChoices(1, asParent, TREE)).toEqual([
    { to: { familyId: 3 }, label: 'With no other parent' },
    { to: { personId: 1 }, label: 'A new family with them' }
  ]);
});
