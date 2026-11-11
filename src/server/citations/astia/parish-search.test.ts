import { expect, test } from 'bun:test';

import { memoryAstia } from './memory-astia';
import { findParishArchives } from './parish-search';

const ASTIA = memoryAstia({
  1: {
    title: 'Pieksämäen seurakunnan arkisto ( Pieksämäen seurakunta )',
    volumes: []
  },
  2: {
    title: 'Pieksämäen maalaiskunnan arkisto ( Pieksämäen maalaiskunta )',
    volumes: []
  },
  3: {
    title: 'Pielaveden seurakunnan arkisto ( Pielaveden seurakunta )',
    volumes: []
  },
  4: {
    title: 'Puumalan seurakunnan arkisto ( Puumalan seurakunta )',
    volumes: []
  },
  5: {
    title: 'Äänekosken seurakunnan arkisto ( Äänekosken seurakunta )',
    volumes: []
  }
});

test("a parish's archive is found by its name in the nominative", async () => {
  expect(await findParishArchives(ASTIA, 'Puumala')).toEqual([
    { archiveId: '4', title: 'Puumalan seurakunnan arkisto' }
  ]);
});

test('archives sharing more of the start come first; only parishes are found', async () => {
  expect(await findParishArchives(ASTIA, 'Pieksamaki')).toEqual([
    { archiveId: '1', title: 'Pieksämäen seurakunnan arkisto' }
  ]);
  expect(await findParishArchives(ASTIA, 'Pie')).toEqual([
    { archiveId: '1', title: 'Pieksämäen seurakunnan arkisto' },
    { archiveId: '3', title: 'Pielaveden seurakunnan arkisto' }
  ]);
});

test('a name spelled without its marks is looked for under both letters', async () => {
  expect(await findParishArchives(ASTIA, 'Aanekoski')).toEqual([
    { archiveId: '5', title: 'Äänekosken seurakunnan arkisto' }
  ]);
  expect(await findParishArchives(ASTIA, '  ')).toEqual([]);
});
