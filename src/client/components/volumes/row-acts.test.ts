import { expect, test } from 'bun:test';

import { trashStep } from './row-acts';
import type { VolumeRow } from './rows';

function row(over: Partial<VolumeRow> = {}): VolumeRow {
  return {
    id: '1',
    label: 'I Aa:1',
    kind: null,
    years: null,
    digitized: true,
    onDisk: { images: 4, cached: 0, bytes: 0 },
    download: null,
    archiveId: 'a',
    archive: 'Juva',
    cited: 0,
    added: true,
    pages: null,
    offloaded: null,
    next: { download: null, trash: null },
    ...over
  };
}

test("the trash button takes Storage's step first", () => {
  const next = { download: null, trash: 'offload' as const };
  expect(trashStep(row({ next }))).toBe('offload');
});

test('with none left in Storage, it takes one added by hand off the list', () => {
  expect(trashStep(row())).toBe('unlist');
  expect(trashStep(row({ cited: null }))).toBe('unlist');
});

test('with Images on disk it takes none off the list, as with the folder away', () => {
  expect(
    trashStep(row({ onDisk: { images: 4, cached: 2, bytes: 20 } }))
  ).toBeNull();
});

test('with nothing to do, it has no step', () => {
  expect(trashStep(row({ cited: 2 }))).toBeNull();
  expect(trashStep(row({ added: false }))).toBeNull();
});
