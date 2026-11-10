import { expect, test } from 'bun:test';

import { capDrop, clearDrop, formatBytes } from './helpers';

const GB = 1024 ** 3;

test('says a size in MB, then GB', () => {
  expect(formatBytes(0)).toBe('0 MB');
  expect(formatBytes(520 * 1024 ** 2)).toBe('520 MB');
  expect(formatBytes(1024 ** 3)).toBe('1 GB');
  expect(formatBytes(1.46 * 1024 ** 3)).toBe('1.5 GB');
  expect(formatBytes(10 * 1024 ** 3)).toBe('10 GB');
});

test('Clear drops everything, an empty cache nothing', () => {
  expect(clearDrop(12 * GB)).toEqual({ kind: 'clear', bytes: 12 * GB });
  expect(clearDrop(0)).toBeNull();
});

test('a cap below the space used drops the difference', () => {
  expect(capDrop(32 * GB, 5 * GB)).toEqual({
    kind: 'cap',
    cap: 5 * GB,
    bytes: 27 * GB
  });
  expect(capDrop(3 * GB, 5 * GB)).toBeNull();
  expect(capDrop(5 * GB, 5 * GB)).toBeNull();
});
