import { expect, test } from 'bun:test';

import { bookLabel } from './books';

test('a church book by its name, years and page', () => {
  const years = { from: 1790, to: 1796 };
  expect(bookLabel({ kind: 'rippi', years }, 18)).toBe(
    'Pää- ja rippikirjat 1790–1796 · p. 18'
  );
  const year = { from: 1798, to: 1798 };
  expect(bookLabel({ kind: 'kastetut', years: year }, null)).toBe(
    'Syntyneiden ja kastettujen luettelot 1798'
  );
  expect(bookLabel({ kind: null, years: null }, 3)).toBe('p. 3');
  expect(bookLabel({ kind: null, years: null }, null)).toBeNull();
});
