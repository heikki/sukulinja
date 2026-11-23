import { describe, expect, test } from 'bun:test';

import type {
  ChurchBookVolume,
  DownloadStatus,
  ListedBook,
  VolumeOnDisk
} from '@/common/types';

import {
  busy,
  diskCell,
  diskLine,
  groupByArchive,
  listSummary,
  matches,
  othersOf,
  volumeCode,
  yearsText
} from './helpers';

const MB = 1024 ** 2;

function volume(
  download: Partial<DownloadStatus> | null,
  onDisk: VolumeOnDisk = { images: 180, cached: 0, bytes: 0 },
  digitized = true
): ChurchBookVolume {
  return {
    id: '1',
    label: 'I Ab:5 Pää- ja rippikirjat (1790-1796)',
    kind: 'rippi',
    years: { from: 1790, to: 1796 },
    digitized,
    onDisk,
    download:
      download === null
        ? null
        : { volumeId: '1', state: 'stopped', error: null, ...download },
    offloaded: null,
    next: { download: null, trash: null }
  };
}

const PART = { images: 180, cached: 42, bytes: 105 * MB };
const WHOLE = { images: 3, cached: 3, bytes: 3 * MB };

describe('diskLine', () => {
  test('says what is on disk', () => {
    expect(diskLine(volume(null))).toBe('Not on disk');
    expect(diskLine(volume(null, PART))).toBe(
      '42 of 180 Images on disk · 105 MB'
    );
    expect(diskLine(volume(null, WHOLE))).toBe('On disk · 3 MB');
    expect(diskLine(volume(null, undefined, false))).toBe('Not digitized');
  });

  test('says where a download is, and why it stopped', () => {
    expect(diskLine(volume({ state: 'downloading' }, PART))).toBe(
      'Downloading 42 of 180 · 105 MB'
    );
    expect(diskLine(volume({ state: 'queued' }, PART))).toBe(
      'Waiting to download · 105 MB'
    );
    expect(diskLine(volume({ state: 'stopped' }, PART))).toBe(
      'Stopped at 42 of 180 · 105 MB'
    );
    expect(
      diskLine(volume({ state: 'stopped', error: 'unreachable' }, PART))
    ).toBe("Stopped at 42 of 180: Astia couldn't be reached · 105 MB");
    expect(
      diskLine(volume({ state: 'stopped', error: 'no-image' }, PART))
    ).toBe('Stopped at 42 of 180: Astia gave no image · 105 MB');
  });

  test('offloaded, with what it took off the disk when that was kept', () => {
    function offloaded(images: number, bytes: number) {
      return { ...volume(null, WHOLE), offloaded: { images, bytes } };
    }
    expect(diskLine(offloaded(19, 3 * MB))).toBe('Offloaded: 19 Images, 3 MB');
    expect(diskLine(offloaded(0, 0))).toBe('Offloaded');
  });
});

test('busy while any is downloading or waiting to', () => {
  expect(busy([volume(null), volume({ state: 'stopped' })])).toBe(false);
  expect(busy([volume(null), volume({ state: 'queued' })])).toBe(true);
});

test("the install's other parishes leave out the dataset's own", () => {
  const juva = { archiveId: '1', title: 'Juvan seurakunnan arkisto' };
  const puumala = { archiveId: '2', title: 'Puumalan seurakunnan arkisto' };
  expect(othersOf([juva], [juva, puumala])).toEqual([puumala]);
});

function listed(
  id: string,
  archiveId: string,
  label: string,
  more: Partial<ListedBook> = {}
): ListedBook {
  return {
    ...volume(null),
    id,
    label,
    archiveId,
    archive: `Archive ${archiveId}`,
    cited: 0,
    added: false,
    ...more
  };
}

test('groups the Book list by archive, each by series and years', () => {
  const books = [
    listed('b', 'A', 'I C:1 Syntyneiden ja kastettujen luettelot (1790-1810)', {
      kind: 'kastetut',
      years: { from: 1790, to: 1810 }
    }),
    listed('c', 'B', 'I Aa:1 Pää- ja rippikirjat (1790-1796)'),
    listed('a2', 'A', 'I Aa:2 Pää- ja rippikirjat (1797-1803)', {
      years: { from: 1797, to: 1803 }
    }),
    listed('a1', 'A', 'I Aa:1 Pää- ja rippikirjat (1790-1796)')
  ];
  expect(
    groupByArchive(books).map((g) => [g.archiveId, g.books.map((b) => b.id)])
  ).toEqual([
    ['A', ['a1', 'a2', 'b']],
    ['B', ['c']]
  ]);
});

test('puts the archives in alphabetical order, those of none last', () => {
  const books = [
    { ...listed('n', 'N', 'I Aa:1'), archiveId: null, archive: null },
    listed('c', 'C', 'I Aa:1'),
    listed('a', 'A', 'I Aa:1')
  ];
  expect(groupByArchive(books).map((g) => g.archiveId)).toEqual([
    'A',
    'C',
    null
  ]);
});

test('filters by a year a Volume covers, or words in it', () => {
  const book = listed('a', 'A', 'I Aa:1 Pää- ja rippikirjat (1790-1796)');
  expect(matches(book, '')).toBe(true);
  expect(matches(book, '1793')).toBe(true);
  expect(matches(book, '1800')).toBe(false);
  expect(matches(book, 'rippi')).toBe(true);
  expect(matches(book, 'archive a')).toBe(true);
  expect(matches(book, 'kastet')).toBe(false);
});

test("says a Volume's code, years and disk in a table's cells", () => {
  expect(volumeCode('I Aa:10 Pää- ja rippikirjat (1790-1796)')).toBe('I Aa:10');
  expect(volumeCode('I Aa: 3 Pää- ja rippikirjat (1790-1796)')).toBe('I Aa: 3');
  expect(volumeCode('IAa:12b Pää- ja rippikirjat')).toBe('IAa:12b');
  expect(volumeCode('Ca:4 Syntyneiden ja kastettujen luettelot')).toBe('Ca:4');
  // Without one, what the series and years beside it leave.
  expect(volumeCode('Rippikirja (1800-1810)')).toBe('–');
  expect(volumeCode('Rippikirja, 1801-1803, 1806-1810 (1801-1810)')).toBe('–');
  expect(volumeCode('Pää- ja rippikirjat, Hankamäki - Orala (1790-1796)')).toBe(
    'Hankamäki - Orala'
  );
  expect(volumeCode('Pää- ja rippikirjat 1790-1796')).toBe('–');
  expect(yearsText({ from: 1790, to: 1796 })).toBe('1790–1796');
  expect(yearsText({ from: 1790, to: 1790 })).toBe('1790');
  expect(yearsText(null)).toBe('');
  expect(diskCell(volume(null))).toBe('—');
  expect(diskCell(volume(null, WHOLE))).toBe('100%');
  expect(diskCell(volume(null, PART))).toBe('23%');
  expect(diskCell(volume({ state: 'downloading' }, PART))).toBe(
    'Downloading 23%'
  );
  expect(diskCell(volume({ state: 'queued' }, PART))).toBe('Waiting');
  expect(diskCell(volume({ state: 'stopped' }, PART))).toBe('23%');
  expect(
    diskCell(volume({ state: 'stopped', error: 'unreachable' }, PART))
  ).toBe('Stopped at 23%');
  expect(diskCell(volume({ state: 'stopped', error: 'rescanned' }, PART))).toBe(
    'Re-scanned'
  );
  expect(diskCell(volume(null, { images: 1000, cached: 1, bytes: 0 }))).toBe(
    '<1%'
  );
  expect(diskCell(volume(null, { images: 1000, cached: 999, bytes: 0 }))).toBe(
    '99%'
  );
});

test('an offloaded Volume shows how much of it is left, all of it too', () => {
  function offloaded(cached: number) {
    return {
      ...volume(null, { images: 100, cached, bytes: 0 }),
      offloaded: { images: 98, bytes: 0 }
    };
  }
  expect(diskCell(offloaded(40))).toBe('40%');
  expect(diskCell(offloaded(100))).toBe('100%');
});

test('sums the Book list up in a line', () => {
  expect(
    listSummary([
      listed('a', 'A', 'x', { cited: 2, onDisk: WHOLE }),
      listed('b', 'A', 'y')
    ])
  ).toBe('2 volumes · 1 cited · 1 downloaded');
});
