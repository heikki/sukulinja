import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import {
  addLocalAnchor,
  loadAnchors,
  loadPlacements,
  setLocalFolder,
  setPlacement
} from './anchors';
import shipped from './anchors.json';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'anchors-'));
  setLocalFolder(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('reads local anchors over the shipped ones', async () => {
  const [volumeId, volume] = Object.entries(shipped)[0]!;
  const first = volume.anchors[0]!;
  await addLocalAnchor(volumeId, 'ignored', {
    image: first.image,
    pages: [999],
    note: 'placed by hand in the app'
  });
  await addLocalAnchor('new-volume', 'A new volume', {
    image: 4,
    pages: [5, 6]
  });
  // Placing page 5 again moves it rather than adding a second claim.
  await addLocalAnchor('new-volume', 'A new volume', {
    image: 3,
    pages: [5, 6]
  });

  const anchors = await loadAnchors();
  const replaced = anchors[volumeId]!.anchors;
  expect(replaced).toHaveLength(volume.anchors.length);
  expect(replaced.find((a) => a.image === first.image)?.pages).toEqual([999]);
  expect(anchors['new-volume']).toEqual({
    title: 'A new volume',
    anchors: [{ image: 3, pages: [5, 6] }]
  });
  expect(shipped[volumeId as keyof typeof shipped].anchors[0]).toEqual(first);
});

test('merges village lists from local files over shipped ones', async () => {
  await Bun.write(
    join(dir, 'anchors.local.json'),
    JSON.stringify({
      v: { anchors: [{ image: 2, pages: [3] }], villages: ['Kylä'] }
    })
  );
  setLocalFolder(dir);
  expect((await loadAnchors()).v).toEqual({
    anchors: [{ image: 2, pages: [3] }],
    villages: ['Kylä']
  });
});

test('places a record by hand, and takes it back', async () => {
  const record =
    'https://www.myheritage.fi/research/collection-10509/x?itemId=1';
  const placement = { volumeId: 'v', volume: 'I Aa:3', image: 203 };
  await setPlacement(record, placement);
  expect(await loadPlacements()).toEqual({ [record]: placement });
  await setPlacement(record, null);
  expect(await loadPlacements()).toEqual({});
});
