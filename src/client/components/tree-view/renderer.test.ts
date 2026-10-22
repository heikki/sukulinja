import { expect, test } from 'bun:test';

import type { PersonRow } from '@/common/types';

import { CROSS, formatDates } from './renderer';

function person(
  birth: number | null,
  death: number | null,
  died: boolean
): PersonRow {
  return {
    id: 1,
    given: 'Matti',
    surname: null,
    sex: 'M',
    birth_year: birth,
    death_year: death,
    birth_date: null,
    death_date: null,
    died,
    photo_path: null,
    crop: null
  };
}

test('shows birth and death years, just the birth for the living', () => {
  expect(formatDates(person(1890, 1943, true))).toBe('1890 – 1943');
  expect(formatDates(person(1990, null, false))).toBe('1990');
});

test('a death without a year is a cross', () => {
  expect(formatDates(person(1890, null, true))).toBe(`1890 – ${CROSS}`);
});

test('an unknown birth beside a death year is left out', () => {
  expect(formatDates(person(null, 1943, true))).toBe('– 1943');
});

test('a death with neither year is "Deceased"', () => {
  expect(formatDates(person(null, null, true))).toBe('Deceased');
});

test('nothing when no year is known and no death recorded', () => {
  expect(formatDates(person(null, null, false))).toBe('');
});
