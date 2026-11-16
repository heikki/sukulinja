import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';

import { openAppState } from '.';

test("tells the pages the Volume's Page pins put on the Image shown", async () => {
  const pages = [
    { image: 1, pages: [7], by: 'vision' as const },
    { image: 2, pages: [8], by: null }
  ];
  const api = memoryDatasetApi({
    volumes: { '201': { images: 3, citations: [], pages } }
  });
  const viewer = openAppState(api).viewer;
  viewer.openImage({ volumeId: '201', volume: 'I Aa:201', image: 2 });
  await Bun.sleep(0);
  expect(viewer.pagesHere.get()).toEqual(pages[1]!);
  viewer.show(3);
  expect(viewer.pagesHere.get()).toBeNull();
});
