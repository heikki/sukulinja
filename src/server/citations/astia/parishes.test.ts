import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { memoryParishes, openParishes, STARTING_PARISHES } from './parishes';

test('each archive is one parish', () => {
  const ids = STARTING_PARISHES.map((p) => p.archiveId);
  expect(new Set(ids).size).toBe(ids.length);
});

test('a parish is found by any of its spellings', () => {
  const parishes = memoryParishes();
  expect(parishes.archiveOf('Mikkeli')).toBe('1854401336');
  expect(parishes.archiveOf('Mikkeli Maaseurakunta')).toBe('1854401336');
  expect(parishes.archiveOf('Mikkelin maaseurakunta')).toBe('1854401336');
  expect(parishes.archiveOf('Pieksamaki')).toBe(
    parishes.archiveOf('Pieksämäki')
  );
  expect(parishes.archiveOf('Juva')).toBe('1212295491');
});

test('a spelling not known has no archive', () => {
  const parishes = memoryParishes();
  expect(parishes.archiveOf('Helsinki')).toBeNull();
  expect(parishes.archiveOf(null)).toBeNull();
});

test('archives rank by how often their spellings are given', () => {
  const parishes = memoryParishes();
  expect(
    parishes.ranked(['Juva', 'Pieksamaki', 'Pieksämäki', 'Helsinki', null])
  ).toEqual(['1225495701', '1212295491']);
});

test("a data folder's parishes.json is read over the starting ones", async () => {
  const folder = await mkdtemp(join(tmpdir(), 'parishes-'));
  try {
    expect(openParishes(folder).archiveOf('Juva')).toBe('1212295491');
    await Bun.write(
      join(folder, 'parishes.json'),
      JSON.stringify({
        parishes: [{ archiveId: '1', spellings: ['Puumala'] }]
      })
    );
    const parishes = openParishes(folder);
    expect(parishes.archiveOf('Puumala')).toBe('1');
    expect(parishes.archiveOf('Juva')).toBeNull();
    expect(parishes.archives()).toEqual(['1']);
  } finally {
    await rm(folder, { recursive: true });
  }
});

test('a spelling linked into an archive moves there from any other', async () => {
  const parishes = memoryParishes();
  const before = parishes.stamp();
  await parishes.link('Pieksamaki', '1');
  expect(parishes.archiveOf('Pieksamaki')).toBe('1');
  expect(parishes.archiveOf('Pieksämäki')).toBe('1225495701');
  expect(parishes.archives().at(-1)).toBe('1');
  expect(parishes.stamp()).not.toBe(before);

  await parishes.link('Pieksamaki', '1225495701');
  expect(parishes.archiveOf('Pieksamaki')).toBe('1225495701');
  expect(parishes.all().at(-1)).toEqual({ archiveId: '1', spellings: [] });
});

test('an archive added has no spelling, and is added once', async () => {
  const parishes = memoryParishes([]);
  await parishes.add('7');
  await parishes.add('7');
  expect(parishes.all()).toEqual([{ archiveId: '7', spellings: [] }]);
});

test('a change is saved in the data folder', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'parishes-'));
  try {
    await openParishes(folder).link('Puumala', '1227046432');
    const again = openParishes(folder);
    expect(again.archiveOf('Puumala')).toBe('1227046432');
    expect(again.archiveOf('Juva')).toBe('1212295491');
  } finally {
    await rm(folder, { recursive: true });
  }
});
