// The memory fake counts a Volume's pages as the server does: the same
// calls answer the same against both.

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { IMAGES, juvaAstia, VOLUMES } from '@/server/citations/testing';

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
  expect(counted.slice(0, 2)).toEqual([
    { image: 1, pages: [1], by: null },
    { image: 2, pages: [2], by: null }
  ]);
  expect(await fake.volumePages(at)).toEqual(counted);
  const set = { ...at, image: 5 };
  const served = await api!.setImagePage(set, [40]);
  expect(served.slice(3, 7)).toEqual([
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
  expect(cleared[4]).toEqual({ image: 5, pages: [5], by: null });
  expect(await fake.clearVolumePages(at)).toEqual(cleared);
});
