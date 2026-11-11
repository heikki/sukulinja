import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { PhotoRow } from '@/common/types';

import { openPhotos } from './photos';

const LONE: PhotoRow = { id: 12, path: 'c.jpg', people: [] };

test('asks for every Photo once shown, and again only once asked for', async () => {
  const api = memoryDatasetApi({ photos: { 12: LONE } });
  const photos = openPhotos(api);
  photos.refresh();
  expect(api.asked).toEqual([]);
  photos.load();
  photos.load();
  await Bun.sleep(0);
  expect(photos.all.get()).toEqual([LONE]);
  photos.refresh();
  expect(api.asked).toEqual(['photos', 'photos']);
});

test("one that can't be reached says so", async () => {
  const photos = openPhotos(memoryDatasetApi({}, { down: true }));
  photos.load();
  await Bun.sleep(0);
  expect(photos.all.get()).toBe('failed');
});
