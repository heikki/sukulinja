import { expect, test } from 'bun:test';

import type {
  ChurchBookVolume,
  ListedBook,
  StorageSteps,
  VolumeOnDisk
} from '@/common/types';

import { AstiaError } from './astia/astia';
import type { HereBook } from './astia/church-books';
import { volumesView } from './volumes-view';

const NOTHING = { images: 4, cached: 0, bytes: 0 };
const SOME = { images: 4, cached: 2, bytes: 20 };
const STORAGE = { cap: 100, used: 20, kept: 0, caps: [100] };

function volume(
  id: string,
  onDisk: VolumeOnDisk,
  next: StorageSteps = { move: 'start', trash: null }
): ChurchBookVolume {
  return {
    id,
    label: `I Aa:${id}`,
    kind: 'rippi',
    years: null,
    digitized: true,
    onDisk,
    download: null,
    offloaded: null,
    next
  };
}

function listed(
  v: ChurchBookVolume,
  { cited = 0, added = false } = {}
): ListedBook {
  return { ...v, archiveId: '1', archive: 'Juva', cited, added };
}

function here(v: ChurchBookVolume): HereBook {
  return { ...v, archiveId: '1', archive: 'Juva' };
}

async function view(
  list: ListedBook[] | 'down',
  others: HereBook[],
  elsewhere: ListedBook[][] = []
) {
  return await volumesView({
    listed: async () => {
      if (list === 'down') throw new AstiaError('down');
      return await Promise.resolve(list);
    },
    elsewhere: async () => await Promise.resolve(elsewhere),
    here: async () => await Promise.resolve(others),
    pagesOf: async (id) =>
      await Promise.resolve(id === '1' ? 'read' : 'counted'),
    storage: async () => await Promise.resolve(STORAGE)
  });
}

test("the Book list's Volumes come first, then the others on this computer", async () => {
  const one = volume('1', SOME);
  const two = volume('2', SOME);
  const {
    rows,
    listed: told,
    storage
  } = await view([listed(one, { cited: 3 })], [here(two), here(one)]);
  expect(rows.map((r) => [r.id, r.onList, r.cited])).toEqual([
    ['1', true, 3],
    ['2', false, 0]
  ]);
  expect(told).toBe(true);
  expect(storage).toEqual(STORAGE);
});

test("another dataset's Book list comes after this one's, before the rest, each Volume once", async () => {
  const one = volume('1', SOME);
  const two = volume('2', NOTHING);
  const three = volume('3', SOME);
  const { rows } = await view(
    [listed(one, { cited: 3 })],
    [here(three), here(one)],
    [[listed(one, { cited: 2 }), listed(two, { cited: 4, added: true })]]
  );
  expect(rows.map((r) => [r.id, r.onList, r.cited, r.citedAll])).toEqual([
    ['1', true, 3, 5],
    ['2', false, 0, 4],
    ['3', false, 0, 0]
  ]);
});

test("one only on another dataset's list is not taken off this one's", async () => {
  const { rows } = await view(
    [],
    [],
    [[listed(volume('2', NOTHING), { added: true })]]
  );
  expect(rows.map((r) => [r.added, r.steps.trash])).toEqual([[false, null]]);
});

test("with this one's list not told, no other's is counted either", async () => {
  const { rows } = await view(
    'down',
    [here(volume('1', SOME))],
    [[listed(volume('1', SOME), { cited: 2 }), listed(volume('2', NOTHING))]]
  );
  expect(rows.map((r) => [r.id, r.citedAll])).toEqual([['1', 0]]);
});

test('every row has its page numbers, one with nothing on disk too', async () => {
  const { rows } = await view([listed(volume('1', NOTHING))], []);
  expect(rows[0]?.pages).toBe('read');
});

test("the trash step is Storage's, else taking one added and cited nowhere off the list", async () => {
  const removable = volume('1', SOME, { move: null, trash: 'remove' });
  const gone = volume('2', NOTHING);
  const { rows } = await view(
    [
      listed(removable, { added: true }),
      listed(gone, { added: true }),
      listed(volume('3', NOTHING), { added: true, cited: 1 }),
      listed(volume('4', NOTHING))
    ],
    [here(removable)]
  );
  expect(rows.map((r) => r.steps.trash)).toEqual([
    'remove',
    'unlist',
    null,
    null
  ]);
  expect(rows[1]?.steps.move).toBe('start');
});

test('with something of it here, one added is not taken off the list, as with the folder away', async () => {
  const { rows } = await view([listed(volume('1', SOME), { added: true })], []);
  expect(rows[0]?.steps.trash).toBeNull();
});

test("with Astia down, what's on this computer is still shown", async () => {
  const { rows, listed: told } = await view('down', [here(volume('2', SOME))]);
  expect(told).toBe(false);
  expect(rows.map((r) => r.id)).toEqual(['2']);
});
