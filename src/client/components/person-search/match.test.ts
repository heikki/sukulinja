import { expect, test } from 'bun:test';

import type { PersonRow } from '@/common/types';

import { alikePersons, matchPersons } from './match';

function person(id: number, given: string, surname: string): PersonRow {
  return {
    id,
    given,
    surname,
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

const PERSONS = [
  person(1, 'Matti', 'Esimerkki'),
  person(2, 'Matti Juhonpoika', 'Malli'),
  person(3, 'Liisa', 'Esimerkki')
];

test('matches the name holding the query, case aside, up to the most asked', () => {
  expect(matchPersons(PERSONS, 'matti', 5).map((p) => p.id)).toEqual([1, 2]);
  expect(matchPersons(PERSONS, ' Matti Esim ', 5).map((p) => p.id)).toEqual([
    1
  ]);
  expect(matchPersons(PERSONS, 'esimerkki', 1).map((p) => p.id)).toEqual([1]);
  expect(matchPersons(PERSONS, 'm', 5)).toEqual([]);
});

test('a name alike starts a word of theirs with each word typed', () => {
  expect(alikePersons(PERSONS, 'Matti', 5).map((p) => p.id)).toEqual([1, 2]);
  expect(alikePersons(PERSONS, 'juho mall', 5).map((p) => p.id)).toEqual([2]);
  expect(alikePersons(PERSONS, 'atti', 5)).toEqual([]);
  expect(alikePersons(PERSONS, ' e ', 5)).toEqual([]);
});
