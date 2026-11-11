import { expect, test } from 'bun:test';

import type { FamilyRow, PersonRow } from '@/common/types';

import { addableRelations, childFamilies, startingSex } from './relations';

function person(id: number, given: string, sex: string | null): PersonRow {
  return {
    id,
    given,
    surname: 'Esimerkki',
    sex,
    birth_year: null,
    death_year: null,
    birth_date: null,
    death_date: null,
    died: false,
    photo_path: null,
    crop: null
  };
}

// Matti (1) and Liisa (2) with their son Juho (3); Matti's second family
// has no other parent.
const PERSONS = [
  person(1, 'Matti', 'M'),
  person(2, 'Liisa', 'F'),
  person(3, 'Juho', 'M')
];
const FIRST: FamilyRow = { id: 1, husband_id: 1, wife_id: 2, child_ids: [3] };
const SECOND: FamilyRow = {
  id: 2,
  husband_id: 1,
  wife_id: null,
  child_ids: []
};

function indices(parentFams: Array<[number, FamilyRow]>) {
  return {
    persons: new Map(PERSONS.map((p) => [p.id, p])),
    parentFamByPerson: new Map(parentFams),
    spouseFamsByPerson: new Map([
      [1, [FIRST, SECOND]],
      [2, [FIRST]]
    ])
  };
}

test('offers a parent only while there is a place, and not one of a sex there is', () => {
  expect(addableRelations(1, indices([]))).toEqual([
    'father',
    'mother',
    'spouse',
    'child',
    'sibling'
  ]);
  expect(addableRelations(3, indices([[3, FIRST]]))).toEqual([
    'spouse',
    'child',
    'sibling'
  ]);
  const withFather = { ...FIRST, wife_id: null };
  expect(addableRelations(3, indices([[3, withFather]]))).toEqual([
    'mother',
    'spouse',
    'child',
    'sibling'
  ]);
});

test('a new parent’s sex is known, a spouse’s likely the other’s', () => {
  expect(startingSex('father', 'F')).toBe('M');
  expect(startingSex('mother', null)).toBe('F');
  expect(startingSex('spouse', 'M')).toBe('F');
  expect(startingSex('spouse', 'F')).toBe('M');
  expect(startingSex('spouse', 'U')).toBe('U');
  expect(startingSex('child', 'M')).toBe('U');
});

test('a child’s family is asked only of someone with more than one', () => {
  expect(childFamilies(2, indices([]))).toEqual([]);
  expect(childFamilies(1, indices([]))).toEqual([
    { familyId: 1, label: 'with Liisa Esimerkki' },
    { familyId: 2, label: 'with no other parent' }
  ]);
});
