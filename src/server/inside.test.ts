import { expect, test } from 'bun:test';

import { isInside } from './inside';

test('takes a path in the folder or under it', () => {
  expect(isInside('/data/media', '/data/media')).toBe(true);
  expect(isInside('/data/media', '/data/media/a.jpg')).toBe(true);
  expect(isInside('/data/media', '/data/media/..a.jpg')).toBe(true);
});

test('refuses a path that climbs out of the folder', () => {
  expect(isInside('/data/media', '/data')).toBe(false);
  expect(isInside('/data/media', '/data/other/a.jpg')).toBe(false);
  expect(isInside('/data/media', '/etc/passwd')).toBe(false);
});
