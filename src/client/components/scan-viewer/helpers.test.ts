import { expect, test } from 'bun:test';

import { clampImage, neighbours } from './helpers';

test('keeps an image number inside the Volume', () => {
  expect(clampImage(0, 354)).toBe(1);
  expect(clampImage(355, 354)).toBe(354);
  expect(clampImage(107.4, 354)).toBe(107);
  expect(clampImage(9999, null)).toBe(9999);
  expect(clampImage(-3, null)).toBe(1);
});

test('prefetches the Image ahead first', () => {
  expect(neighbours(5, 10, 1)).toEqual([6, 4]);
  expect(neighbours(5, 10, -1)).toEqual([4, 6]);
  expect(neighbours(1, 10, 1)).toEqual([2]);
  expect(neighbours(10, 10, 1)).toEqual([9]);
  expect(neighbours(10, null, 1)).toEqual([11, 9]);
});
