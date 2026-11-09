import { expect, test } from 'bun:test';

import { parishArchive, PARISHES } from './archives';

test('each archive is one parish', () => {
  const ids = PARISHES.map((p) => p.archiveId);
  expect(new Set(ids).size).toBe(ids.length);
});

test('a parish is found by its name or any of its spellings', () => {
  expect(parishArchive('Mikkeli')).toBe('1854401336');
  expect(parishArchive('Mikkeli Maaseurakunta')).toBe('1854401336');
  expect(parishArchive('Mikkelin maaseurakunta')).toBe('1854401336');
  expect(parishArchive('Pieksamaki')).toBe(parishArchive('Pieksämäki'));
  expect(parishArchive('Juva')).toBe('1212295491');
});

test('one not looked up has no archive', () => {
  expect(parishArchive('Helsinki')).toBeNull();
  expect(parishArchive(null)).toBeNull();
});
