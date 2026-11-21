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
    onDisk: { images: 4, cached: 4, bytes: 100 },
    download: null,
    archiveId: 'a',
    archive: 'Juva',
    cited: 0,
    added: true,
    pages: null,
    offloaded: null,
    ...over
  };
}

test('the trash button offloads into a chosen folder, else removes from disk', () => {
  expect(trashStep(row(), true)).toBe('offload');
  expect(trashStep(row(), false)).toBe('remove');
});

test('offloaded, or kept only in the folder, it removes it for good', () => {
  const offloaded = row({ offloaded: { images: 3, bytes: 90 } });
  expect(trashStep(offloaded, true)).toBe('purge');
  const inFolder = row({ onDisk: { images: 4, cached: 4, bytes: 0 } });
  expect(trashStep(inFolder, true)).toBe('purge');
  // With the folder since cleared, what it kept is removed from disk.
  expect(trashStep(offloaded, false)).toBe('remove');
});

test('with nothing left, it takes one added by hand off the list', () => {
  const gone = { images: 4, cached: 0, bytes: 0 };
  expect(trashStep(row({ onDisk: gone }), true)).toBe('unlist');
  expect(trashStep(row({ onDisk: gone }), false)).toBe('unlist');
});

test('with nothing to do, it has no step', () => {
  const gone = { images: 4, cached: 0, bytes: 0 };
  expect(trashStep(row({ onDisk: gone, cited: 2 }), true)).toBeNull();
  expect(trashStep(row({ onDisk: gone, added: false }), true)).toBeNull();
  expect(trashStep(row({ onDisk: gone, cited: null }), true)).toBe('unlist');
});
