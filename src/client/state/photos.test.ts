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

function picture(name: string, type = 'image/jpeg') {
  return new File(['x'], name, { type });
}

test('adds pictures one after another, and lists them again', async () => {
  const api = memoryDatasetApi({ photos: { 12: LONE } });
  const photos = openPhotos(api);
  photos.load();
  await Bun.sleep(0);
  const going = photos.add([picture('a.jpg'), picture('b.jpg')]);
  expect(photos.adding.get()).toEqual({ done: 0, of: 2 });
  const first = await going;
  expect(first).toEqual({ id: 5001, path: 'a.jpg', people: [] });
  expect(photos.adding.get()).toBeNull();
  await Bun.sleep(0);
  expect(api.asked).toEqual([
    'photos',
    'add photo a.jpg',
    'add photo b.jpg',
    'photos'
  ]);
  expect(photos.all.get()).toHaveLength(3);
});

test("says why one wasn't added, and adds the rest", async () => {
  const photos = openPhotos(memoryDatasetApi({}));
  const first = await photos.add([
    picture('kirje.pdf', 'application/pdf'),
    picture('a.jpg')
  ]);
  expect(first?.path).toBe('a.jpg');
  expect(photos.refused.get()).toEqual(["kirje.pdf isn't a picture"]);
  photos.dismiss();
  expect(photos.refused.get()).toEqual([]);
});

test('one the dataset has already is the one answered', async () => {
  const photos = openPhotos(
    memoryDatasetApi({ photos: { 12: { ...LONE, path: 'c.jpg' } } })
  );
  expect(await photos.add([picture('c.jpg')])).toEqual(LONE);
});
