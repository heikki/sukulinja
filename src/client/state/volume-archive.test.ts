import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';

import { openVolumeArchive } from './volume-archive';

const JUVA = 'Juvan seurakunnan arkisto';

function api() {
  return memoryDatasetApi({
    volumes: {
      '201': { images: 3, citations: [], archive: JUVA },
      '202': { images: 3, citations: [], archive: JUVA }
    }
  });
}

test('keeps the archive named while the next Volume is asked about', async () => {
  const archive = openVolumeArchive(api());
  await archive.show('201');
  const next = archive.show('202');
  expect(archive.title.get()).toBe(JUVA);
  await next;
  expect(archive.title.get()).toBe(JUVA);
  archive.forget();
  expect(archive.title.get()).toBeNull();
});

test('names a Volume shown before without asking again', async () => {
  const asking = api();
  const archive = openVolumeArchive(asking);
  await archive.show('201');
  await archive.show('202');
  await archive.show('201');
  expect(asking.asked).toEqual(['archive 201', 'archive 202']);
  expect(archive.title.get()).toBe(JUVA);
});
