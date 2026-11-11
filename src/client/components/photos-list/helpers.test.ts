import { expect, test } from 'bun:test';

import { peopleLine } from './helpers';

test('says how many people are on a Photo', () => {
  expect(peopleLine(0)).toBe('No one');
  expect(peopleLine(1)).toBe('1 person');
  expect(peopleLine(3)).toBe('3 people');
});
