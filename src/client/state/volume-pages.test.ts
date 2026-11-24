import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';

import { openAppState } from '.';
import { openSelected } from './selected';
import { openViewer } from './viewer';

test("tells the pages the Volume's Page pins put on the Image shown", async () => {
  const pins = [{ image: 1, pages: [7], by: 'vision' as const }];
  const api = memoryDatasetApi({
    volumes: { '201': { images: 3, citations: [], pins } }
  });
  const viewer = openAppState(api).viewer;
  viewer.openImage({ volumeId: '201', volume: 'I Aa:201', image: 1 });
  expect(viewer.pages.here.get()).toBeNull();
  await Bun.sleep(0);
  expect(viewer.pages.here.get()).toEqual({
    image: 1,
    pages: [7],
    by: 'vision'
  });
  viewer.show(3);
  expect(viewer.pages.here.get()).toEqual({ image: 3, pages: [9], by: null });
});

test("a page set by hand on the Image shown is told, and the Volume's citations reloaded", async () => {
  const api = memoryDatasetApi({
    volumes: { '201': { images: 3, citations: [] } }
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

test("the Volume's page numbers are cleared, and its citations reloaded", async () => {
  const pins = [{ image: 2, pages: [8] }];
  const api = memoryDatasetApi({
    volumes: { '201': { images: 3, citations: [], pins } }
  });
  const viewer = openAppState(api).viewer;
  viewer.openImage({ volumeId: '201', volume: 'I Aa:201', image: 2 });
  await Bun.sleep(0);
  expect(viewer.pages.pinned.get()).toBe(1);
  await viewer.pages.clearVolume();
  expect(viewer.pages.pinned.get()).toBe(0);
  expect(api.asked.slice(-3)).toEqual([
    'pages cleared 201',
    'citations 201',
    'pages 201'
  ]);
});

test("the Volume's page numbers are known locked, and read again once unmarked", async () => {
  const api = memoryDatasetApi({
    volumes: { '201': { images: 3, citations: [], mark: 'checked' } }
  });
  const viewer = openViewer(api, openSelected(api));
  viewer.openImage({ volumeId: '201', volume: 'I Aa:201', image: 2 });
  await Bun.sleep(0);
  expect(viewer.pages.locked.get()).toBe(true);
  await api.markPages({ volumeId: '201', volume: 'I Aa:201' }, null);
  await viewer.pages.load('201');
  expect(viewer.pages.locked.get()).toBe(false);
});
