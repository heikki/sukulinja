import { expect, test } from 'bun:test';

import { neighbours } from './helpers';

test('prefetches the Image ahead first', () => {
  expect(neighbours(5, 10, 1)).toEqual([6, 4]);
  expect(neighbours(5, 10, -1)).toEqual([4, 6]);
  expect(neighbours(1, 10, 1)).toEqual([2]);
  expect(neighbours(10, 10, 1)).toEqual([9]);
  expect(neighbours(10, null, 1)).toEqual([11, 9]);
});
