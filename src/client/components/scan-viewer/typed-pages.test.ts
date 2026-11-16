import { expect, test } from 'bun:test';

import { typedPages } from './typed-pages';

test("a page typed is one, or a spread's two following each other", () => {
  expect(typedPages('12')).toEqual([12]);
  expect(typedPages(' 4-5 ')).toEqual([4, 5]);
  expect(typedPages('4 – 5')).toEqual([4, 5]);
  expect(typedPages('4 5')).toEqual([4, 5]);
  expect(typedPages('4-6')).toBeNull();
  expect(typedPages('')).toBeNull();
  expect(typedPages('0')).toBeNull();
  expect(typedPages('x')).toBeNull();
});
