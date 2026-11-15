import { expect, test } from 'bun:test';

import { fitted, readSize } from './size';

test('reads a kept size, and nothing else', () => {
  expect(readSize('600x700')).toEqual({ width: 600, height: 700 });
  expect(readSize('600')).toBeNull();
  expect(readSize(undefined)).toBeNull();
});

test('fits the size between the smallest and what the window has room for', () => {
  const room = { width: 1000, height: 800 };
  expect(fitted({ width: 100, height: 100 }, room)).toEqual({
    width: 320,
    height: 280
  });
  expect(fitted({ width: 2000, height: 2000 }, room)).toEqual({
    width: 968,
    height: 720
  });
});
