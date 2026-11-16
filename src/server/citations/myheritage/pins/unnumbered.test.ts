import { expect, test } from 'bun:test';

import { skipping } from './unnumbered';

test('Images without a page number are left out of the counting', () => {
  const s = skipping(
    [
      { image: 2, pages: [] },
      { image: 5, pages: [3] },
      { image: 3, pages: [] }
    ],
    10
  );
  expect(s.skipped).toEqual([2, 3]);
  expect(s.pins).toEqual([{ image: 3, pages: [3] }]);
  expect(s.images).toBe(8);
  expect([1, 2, 3, 4].map((i) => s.image(i))).toEqual([1, 4, 5, 6]);
});
