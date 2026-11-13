import { expect, test } from 'bun:test';

import { mayBeLiving } from './living';

function person(born: number | null, died = false) {
  return { died, birth_year: born, death_year: null };
}

test('someone born within 110 years with no death recorded may be living', () => {
  expect(mayBeLiving(person(1950), 2026)).toBe(true);
  expect(mayBeLiving(person(1917), 2026)).toBe(true);
});

test('someone born longer ago is not', () => {
  expect(mayBeLiving(person(1916), 2026)).toBe(false);
  expect(mayBeLiving(person(1820), 2026)).toBe(false);
});

test('a recorded death settles it, dated or not', () => {
  expect(mayBeLiving(person(1990, true), 2026)).toBe(false);
  expect(
    mayBeLiving({ died: false, birth_year: 1990, death_year: 2020 }, 2026)
  ).toBe(false);
});

test('no birth year and no death leaves it open, so they may be', () => {
  expect(mayBeLiving(person(null), 2026)).toBe(true);
});
