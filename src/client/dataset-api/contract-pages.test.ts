// The memory fake counts a Volume's pages as the server does: the same
// calls answer the same against both.

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { IMAGES, juvaAstia, VOLUMES } from '@/server/citations/testing';

import { ApiError } from './';
import type { DatasetApi } from './';
import { memoryDatasetApi } from './memory';
import { servedDataset } from './served';

// Under an id like Astia's own: the app's routes take only those.
const VOLUME = '201';

let served: Awaited<ReturnType<typeof servedDataset>> | null = null;
let api: DatasetApi | null = null;

beforeEach(async () => {
  const astia = juvaAstia(undefined, { [VOLUME]: VOLUMES['juva-1'] });
  served = await servedDataset(
    '0 @I1@ INDI\n1 NAME Matti /Esimerkki/\n',
    astia
  );
  ({ api } = served);
});

afterEach(async () => {
  await served?.close();
});

test("a Volume's pages, set by hand and cleared, as the memory fake counts them", async () => {
  const fake = memoryDatasetApi({
    volumes: { [VOLUME]: { images: IMAGES, citations: [] } }
  });
  const at = { volumeId: VOLUME, volume: VOLUMES['juva-1'] };
  const counted = await api!.volumePages(at);
  expect(counted.images.slice(0, 2)).toEqual([
    { image: 1, pages: [1], by: null },
    { image: 2, pages: [2], by: null }
  ]);
  expect(await fake.volumePages(at)).toEqual(counted);
  const set = { ...at, image: 5 };
  const served = await api!.setImagePage(set, [40]);
  expect(served.images.slice(3, 7)).toEqual([
    { image: 4, pages: [39], by: null },
    { image: 5, pages: [40], by: 'hand' },
    { image: 6, pages: [41], by: null },
    { image: 7, pages: [42], by: null }
  ]);
  expect(await fake.setImagePage(set, [40])).toEqual(served);
  expect(await fake.setImagePage({ ...set, image: 7 }, [])).toEqual(
    await api!.setImagePage({ ...set, image: 7 }, [])
  );
  const cleared = await api!.clearVolumePages(at);
  expect(cleared.images[4]).toEqual({ image: 5, pages: [5], by: null });
  expect(await fake.clearVolumePages(at)).toEqual(cleared);
});

test("one page typed stays one, though the Volume's other pins are a spread's two, as the memory fake sets it", async () => {
  const fake = memoryDatasetApi({
    volumes: { [VOLUME]: { images: IMAGES, citations: [] } }
  });
  const at = { volumeId: VOLUME, volume: VOLUMES['juva-1'] };
  const spread = { ...at, image: 3 };
  await api!.setImagePage(spread, [4, 5]);
  await fake.setImagePage(spread, [4, 5]);
  const served = await api!.setImagePage({ ...at, image: 10 }, [12]);
  expect(served.images[9]).toEqual({ image: 10, pages: [12], by: 'hand' });
  expect(await fake.setImagePage({ ...at, image: 10 }, [12])).toEqual(served);
});

test("a Volume's page numbers marked, and locked, as the memory fake marks them", async () => {
  const fake = memoryDatasetApi({
    volumes: { [VOLUME]: { images: IMAGES, citations: [] } }
  });
  const at = { volumeId: VOLUME, volume: VOLUMES['juva-1'] };
  expect(await api!.markPages(at, 'none')).toBe('none');
  expect(await fake.markPages(at, 'none')).toBe('none');
  const none = await api!.volumePages(at);
  expect(none.images[0]).toEqual({ image: 1, pages: [], by: null });
  expect(await fake.volumePages(at)).toEqual(none);
  const set = { ...at, image: 5 };
  expect(api!.setImagePage(set, [40])).rejects.toThrow(ApiError);
  expect(fake.setImagePage(set, [40])).rejects.toThrow(ApiError);
  expect(await fake.markPages(at, null)).toEqual(
    await api!.markPages(at, null)
  );
});

test('two Images set to have no page skip those between, a page set there splitting the run, as the memory fake skips them', async () => {
  const fake = memoryDatasetApi({
    volumes: { [VOLUME]: { images: IMAGES, citations: [] } }
  });
  const at = { volumeId: VOLUME, volume: VOLUMES['juva-1'] };
  async function both(image: number, pages: number[] | null) {
    const served = await api!.setImagePage({ ...at, image }, pages);
    expect(await fake.setImagePage({ ...at, image }, pages)).toEqual(served);
    return served.images.filter((p) => p.image >= 2 && p.image <= 10);
  }
  await both(3, []);
  const run = { from: 3, to: 9 };
  expect(await both(9, [])).toEqual([
    { image: 2, pages: [2], by: null },
    { image: 3, pages: [], by: 'hand', skipped: run },
    ...[4, 5, 6, 7, 8].map((image) => ({
      image,
      pages: [],
      by: null,
      skipped: run
    })),
    { image: 9, pages: [], by: 'hand', skipped: run },
    { image: 10, pages: [3], by: null }
  ]);
  const split = await both(6, [40]);
  expect(split.map((p) => [p.image, p.pages, p.by, p.skipped])).toEqual([
    [2, [39], null, undefined],
    [3, [], 'hand', { from: 3, to: 5 }],
    [4, [], null, { from: 3, to: 5 }],
    [5, [], 'hand', { from: 3, to: 5 }],
    [6, [40], 'hand', undefined],
    [7, [], 'hand', { from: 7, to: 9 }],
    [8, [], null, { from: 7, to: 9 }],
    [9, [], 'hand', { from: 7, to: 9 }],
    [10, [41], null, undefined]
  ]);
});
