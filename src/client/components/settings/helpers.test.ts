import { expect, test } from 'bun:test';

import { formatBytes } from './helpers';

test('says a size in MB, then GB', () => {
  expect(formatBytes(0)).toBe('0 MB');
  expect(formatBytes(520 * 1024 ** 2)).toBe('520 MB');
  expect(formatBytes(1024 ** 3)).toBe('1 GB');
  expect(formatBytes(1.46 * 1024 ** 3)).toBe('1.5 GB');
  expect(formatBytes(10 * 1024 ** 3)).toBe('10 GB');
});
