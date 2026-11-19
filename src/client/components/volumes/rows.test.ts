import { expect, test } from 'bun:test';

import type {
  ChurchBookVolume,
  InstalledBook,
  ListedBook
} from '@/common/types';

import { allRows, hasOthers, treeRows } from './rows';

function volume(id: string): ChurchBookVolume {
  return {
    id,
    label: `I Aa:${id} Rippikirja (1790-1796)`,
    kind: 'rippi',
    years: { from: 1790, to: 1796 },
    digitized: true,
    onDisk: { images: 10, cached: 10, bytes: 10 },
    download: null
  };
}

function listed(id: string, cited: number): ListedBook {
  return { ...volume(id), archiveId: '1', archive: 'A', cited, added: false };
}

function installed(id: string): InstalledBook {
  return {
    ...volume(id),
    archiveId: '1',
    archive: 'A',
    pages: 'checked',
    offloaded: null
  };
}

test("each table's rows carry what the other list knows", () => {
  const tree = [listed('1', 2), listed('2', 0)];
  const all = [installed('1'), installed('3')];
  expect(treeRows(tree, all).map((r) => [r.id, r.cited, r.pages])).toEqual([
    ['1', 2, 'checked'],
    ['2', 0, null]
  ]);
  expect(allRows(all, tree).map((r) => [r.id, r.cited, r.pages])).toEqual([
    ['1', 2, 'checked'],
    ['3', null, 'checked']
  ]);
});

test('all the books are offered apart only when some are off the list', () => {
  expect(hasOthers([listed('1', 1)], [installed('1')])).toBe(false);
  expect(hasOthers([listed('1', 1)], [installed('1'), installed('2')])).toBe(
    true
  );
});
