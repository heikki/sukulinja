import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import {
  addLocalAnchor,
  addLocalSeen,
  loadAnchors,
  loadPlacements,
  setLocalFolder,
  setPlacement
} from './anchors';
import shipped from './anchors.json';
import type { RecordRange, SeenRecord } from './locate';

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

test('merges villages, record ranges and seen records from local files', async () => {
  const records = [{ from: 10, to: 20 }];
  const seen = [{ record: 12, image: 5 }];
  await Bun.write(
    join(dir, 'anchors.local.json'),
    JSON.stringify({
      v: {
        anchors: [{ image: 2, pages: [3] }],
        villages: ['Kylä'],
        records,
        seen
      }
    })
  );
  setLocalFolder(dir);
  expect((await loadAnchors()).v).toEqual({
    anchors: [{ image: 2, pages: [3] }],
    villages: ['Kylä'],
    records,
    seen
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

test('a vision match never replaces a hand correction', async () => {
  const [volumeId, volume] = Object.entries(shipped)[0]!;
  const first = volume.anchors[0]!;
  const seen: SeenRecord = { record: 77, image: 5, by: 'hand' };
  await addLocalAnchor(volumeId, 'ignored', {
    image: first.image,
    pages: [999],
    by: 'vision'
  });
  await addLocalSeen(volumeId, 'ignored', seen);
  await addLocalSeen(volumeId, 'ignored', {
    ...seen,
    image: seen.image + 1,
    by: 'vision'
  });
  const record =
    'https://www.myheritage.fi/research/collection-30233/x?itemId=1';
  const hand = {
    volumeId: 'v',
    volume: 'I C:1',
    image: 20,
    by: 'hand' as const
  };
  await setPlacement(record, hand);
  await setPlacement(record, { ...hand, image: 21, by: 'vision' });

  const anchors = await loadAnchors();
  expect(anchors[volumeId]!.anchors).toEqual(volume.anchors);
  expect(anchors[volumeId]!.seen).toEqual([seen]);
  expect(await loadPlacements()).toEqual({ [record]: hand });
});

test('a hand correction replaces a vision match', async () => {
  await addLocalAnchor('v', 'I Aa:1', { image: 4, pages: [5], by: 'vision' });
  await addLocalAnchor('v', 'I Aa:1', { image: 5, pages: [5], by: 'hand' });
  await addLocalSeen('v', 'I Aa:1', { record: 12, image: 4, by: 'vision' });
  await addLocalSeen('v', 'I Aa:1', { record: 12, image: 5, by: 'hand' });
  const record =
    'https://www.myheritage.fi/research/collection-30233/x?itemId=1';
  const vision = {
    volumeId: 'v',
    volume: 'I C:1',
    image: 20,
    by: 'vision' as const
  };
  await setPlacement(record, vision);
  await setPlacement(record, { ...vision, image: 21, by: 'hand' });

  const v = (await loadAnchors()).v!;
  expect(v.anchors).toEqual([{ image: 5, pages: [5], by: 'hand' }]);
  expect(v.seen).toEqual([{ record: 12, image: 5, by: 'hand' }]);
  expect(await loadPlacements()).toEqual({
    [record]: { ...vision, image: 21, by: 'hand' }
  });
});

test('a record seen again moves to its new image, in any volume', async () => {
  await addLocalSeen('a', 'I Aa:1', { record: 12, image: 4 });
  await addLocalSeen('b', 'I Aa:2', { record: 12, image: 9 });
  const anchors = await loadAnchors();
  expect(anchors.a!.seen).toBeUndefined();
  expect(anchors.b!.seen).toEqual([{ record: 12, image: 9 }]);
});

test('a seen record extends the nearest record range of its volume', async () => {
  await Bun.write(
    join(dir, 'anchors.local.json'),
    JSON.stringify({
      a: {
        anchors: [],
        records: [
          { from: 100, to: 200 },
          { from: 500, to: 600 }
        ]
      },
      b: { anchors: [], records: [{ from: 300, to: 400 }] },
      c: { anchors: [], records: [{ from: 1000, to: 1100 }] }
    })
  );
  setLocalFolder(dir);
  await addLocalSeen('a', 'I Aa:1', { record: 250, image: 4 });
  await addLocalSeen('a', 'I Aa:1', { record: 150, image: 3 });
  await addLocalSeen('a', 'I Aa:1', { record: 650, image: 40 });
  // Records 401–499 lie between b's range and a's: a's grows down to them.
  await addLocalSeen('a', 'I Aa:1', { record: 450, image: 30 });
  // c's nearest range is past a's 500–650: it can't grow over it.
  await addLocalSeen('c', 'I Aa:3', { record: 50, image: 2 });
  await addLocalSeen('d', 'I Aa:4', { record: 800, image: 2 });

  const anchors = await loadAnchors();
  expect(anchors.a!.records).toEqual([
    { from: 100, to: 250 },
    { from: 450, to: 650 }
  ]);
  expect(anchors.c!.records).toEqual([{ from: 1000, to: 1100 }]);
  // A volume with no range starts one.
  expect(anchors.d!.records).toEqual([{ from: 800, to: 800 }]);
});

test('an extended local range stands in for the shipped one', async () => {
  const [volumeId, volume] = Object.entries(shipped).find(
    ([, v]) => 'records' in v
  )!;
  const [range] = (volume as { records: RecordRange[] }).records;
  await addLocalSeen(volumeId, 'ignored', {
    record: range!.to + 1,
    image: 2
  });
  expect((await loadAnchors())[volumeId]!.records).toEqual([
    { from: range!.from, to: range!.to + 1 }
  ]);
});
