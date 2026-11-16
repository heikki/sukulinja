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
  expect(viewer.pages.here.get()).toEqual(pages[1]!);
  viewer.show(3);
  expect(viewer.pages.here.get()).toBeNull();
});

test("a page set by hand on the Image shown is told, and the Volume's citations reloaded", async () => {
  const pages = [{ image: 2, pages: [8], by: null }];
  const api = memoryDatasetApi({
    volumes: { '201': { images: 3, citations: [], pages } }
  });
  const viewer = openAppState(api).viewer;
  viewer.openImage({ volumeId: '201', volume: 'I Aa:201', image: 2 });
  await Bun.sleep(0);
  await viewer.pages.setHere([12]);
  expect(viewer.pages.here.get()).toEqual({
    image: 2,
    pages: [12],
    by: 'hand'
  });
  expect(api.asked.slice(-3)).toEqual([
    'page 201/2 12',
    'citations 201',
    'pages 201'
  ]);
});
