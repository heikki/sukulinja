import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { Pins, RecordPin, RecordRange } from './locate';
import {
  addPagePin,
  addRecordPin,
  loadPins,
  setLocalFolder,
  setReferencePin
} from './pins';
import shipped from './pins.json';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pins-'));
  setLocalFolder(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const SHIPPED: Pins['volumes'] = shipped.volumes;

async function writeLocal(pins: Partial<Pins>) {
  await Bun.write(join(dir, 'pins.local.json'), JSON.stringify(pins));
  setLocalFolder(dir);
}

test('reads local Page pins over the shipped ones', async () => {
  const [volumeId, volume] = Object.entries(SHIPPED)[0]!;
  const first = volume.pages[0]!;
  await addPagePin(volumeId, 'ignored', {
    image: first.image,
    pages: [999],
    note: 'marked in the app'
  });
  await addPagePin('new-volume', 'A new volume', { image: 4, pages: [5, 6] });
  // Pinning page 5 again moves it rather than adding a second claim.
  await addPagePin('new-volume', 'A new volume', { image: 3, pages: [5, 6] });

  const { volumes } = await loadPins();
  const replaced = volumes[volumeId]!.pages;
  expect(replaced).toHaveLength(volume.pages.length);
  expect(replaced.find((p) => p.image === first.image)?.pages).toEqual([999]);
  expect(volumes['new-volume']).toEqual({
    title: 'A new volume',
    pages: [{ image: 3, pages: [5, 6] }]
  });
  expect(SHIPPED[volumeId]!.pages[0]).toEqual(first);
});

test('merges villages, Record ranges and Record pins from the local file', async () => {
  const ranges = [{ from: 10, to: 20 }];
  const records = [{ record: 12, image: 5 }];
  await writeLocal({
    volumes: {
      v: {
        pages: [{ image: 2, pages: [3] }],
        villages: ['Kylä'],
        ranges,
        records
      }
    }
  });
  expect((await loadPins()).volumes.v).toEqual({
    pages: [{ image: 2, pages: [3] }],
    villages: ['Kylä'],
    ranges,
    records
  });
});

test('pins a reference by hand, and takes it back', async () => {
  const url = 'https://www.myheritage.fi/research/collection-10509/x?itemId=1';
  const pin = { volumeId: 'v', volume: 'I Aa:3', image: 203 };
  await setReferencePin(url, pin);
  expect((await loadPins()).references).toEqual({ [url]: pin });
  await setReferencePin(url, null);
  expect((await loadPins()).references).toEqual({});
});

test('a vision pin never replaces a hand one', async () => {
  const [volumeId, volume] = Object.entries(SHIPPED)[0]!;
  const first = volume.pages[0]!;
  const hand: RecordPin = { record: 77, image: 5, by: 'hand' };
  await addPagePin(volumeId, 'ignored', {
    image: first.image,
    pages: [999],
    by: 'vision'
  });
  await addRecordPin(volumeId, 'ignored', hand);
  await addRecordPin(volumeId, 'ignored', {
    ...hand,
    image: hand.image + 1,
    by: 'vision'
  });
  const url = 'https://www.myheritage.fi/research/collection-30233/x?itemId=1';
  const handRef = {
    volumeId: 'v',
    volume: 'I C:1',
    image: 20,
    by: 'hand' as const
  };
  await setReferencePin(url, handRef);
  await setReferencePin(url, { ...handRef, image: 21, by: 'vision' });

  const pins = await loadPins();
  expect(pins.volumes[volumeId]!.pages).toEqual(volume.pages);
  expect(pins.volumes[volumeId]!.records).toEqual([hand]);
  expect(pins.references).toEqual({ [url]: handRef });
});

test('a hand pin replaces a vision one', async () => {
  await addPagePin('v', 'I Aa:1', { image: 4, pages: [5], by: 'vision' });
  await addPagePin('v', 'I Aa:1', { image: 5, pages: [5], by: 'hand' });
  await addRecordPin('v', 'I Aa:1', { record: 12, image: 4, by: 'vision' });
  await addRecordPin('v', 'I Aa:1', { record: 12, image: 5, by: 'hand' });
  const url = 'https://www.myheritage.fi/research/collection-30233/x?itemId=1';
  const vision = {
    volumeId: 'v',
    volume: 'I C:1',
    image: 20,
    by: 'vision' as const
  };
  await setReferencePin(url, vision);
  await setReferencePin(url, { ...vision, image: 21, by: 'hand' });

  const pins = await loadPins();
  expect(pins.volumes.v!.pages).toEqual([{ image: 5, pages: [5], by: 'hand' }]);
  expect(pins.volumes.v!.records).toEqual([
    { record: 12, image: 5, by: 'hand' }
  ]);
  expect(pins.references).toEqual({
    [url]: { ...vision, image: 21, by: 'hand' }
  });
});

test('a record pinned again moves to its new image, in any volume', async () => {
  await addRecordPin('a', 'I Aa:1', { record: 12, image: 4 });
  await addRecordPin('b', 'I Aa:2', { record: 12, image: 9 });
  const { volumes } = await loadPins();
  expect(volumes.a!.records).toBeUndefined();
  expect(volumes.b!.records).toEqual([{ record: 12, image: 9 }]);
});

test('a Record pin extends the nearest Record range of its volume', async () => {
  await writeLocal({
    volumes: {
      a: {
        pages: [],
        ranges: [
          { from: 100, to: 200 },
          { from: 500, to: 600 }
        ]
      },
      b: { pages: [], ranges: [{ from: 300, to: 400 }] },
      c: { pages: [], ranges: [{ from: 1000, to: 1100 }] }
    }
  });
  await addRecordPin('a', 'I Aa:1', { record: 250, image: 4 });
  await addRecordPin('a', 'I Aa:1', { record: 150, image: 3 });
  await addRecordPin('a', 'I Aa:1', { record: 650, image: 40 });
  // Records 401–499 lie between b's range and a's: a's grows down to them.
  await addRecordPin('a', 'I Aa:1', { record: 450, image: 30 });
  // c's nearest range is past a's 500–650: it can't grow over it.
  await addRecordPin('c', 'I Aa:3', { record: 50, image: 2 });
  await addRecordPin('d', 'I Aa:4', { record: 800, image: 2 });

  const { volumes } = await loadPins();
  expect(volumes.a!.ranges).toEqual([
    { from: 100, to: 250 },
    { from: 450, to: 650 }
  ]);
  expect(volumes.c!.ranges).toEqual([{ from: 1000, to: 1100 }]);
  // A volume with no range starts one.
  expect(volumes.d!.ranges).toEqual([{ from: 800, to: 800 }]);
});

test('an extended local range stands in for the shipped one', async () => {
  const [volumeId, volume] = Object.entries(SHIPPED).find(
    ([, v]) => v.ranges !== undefined
  )!;
  const [range] = volume.ranges as [RecordRange];
  await addRecordPin(volumeId, 'ignored', { record: range.to + 1, image: 2 });
  expect((await loadPins()).volumes[volumeId]!.ranges).toEqual([
    { from: range.from, to: range.to + 1 }
  ]);
});

test('ships only facts about Volumes, never Record or Reference pins', () => {
  expect(Object.keys(shipped)).toEqual(['volumes']);
  for (const volume of Object.values(SHIPPED)) {
    expect(volume.records).toBeUndefined();
  }
});

// ---------------------------------------------------------------- migration

const INDEX_URL =
  'https://www.myheritage.fi/research/collection-30233/x?itemId=9';

async function writeOldFiles() {
  await Bun.write(
    join(dir, 'anchors.local.json'),
    JSON.stringify({
      v: {
        title: 'I Aa:1',
        anchors: [{ image: 2, pages: [3], by: 'vision' }],
        villages: ['Kylä'],
        records: [{ from: 10, to: 20 }],
        seen: [{ record: 12, image: 5, by: 'vision' }]
      }
    })
  );
  await Bun.write(
    join(dir, 'placements.local.json'),
    JSON.stringify({
      [INDEX_URL]: { volumeId: 'v', volume: 'I C:1', image: 45 }
    })
  );
  await Bun.write(join(dir, 'anchors.local.before-full.json'), '{}');
  setLocalFolder(dir);
}

test('moves the files saved before pins into pins.local.json', async () => {
  await writeOldFiles();
  const { volumes, references } = await loadPins();

  expect(volumes.v).toEqual({
    title: 'I Aa:1',
    pages: [{ image: 2, pages: [3], by: 'vision' }],
    villages: ['Kylä'],
    ranges: [{ from: 10, to: 20 }],
    records: [{ record: 12, image: 5, by: 'vision' }]
  });
  expect(references).toEqual({
    [INDEX_URL]: { volumeId: 'v', volume: 'I C:1', image: 45 }
  });
  expect((await readdir(dir)).toSorted()).toEqual([
    'anchors.local.before-full.json',
    'anchors.local.json.migrated',
    'pins.local.json',
    'placements.local.json.migrated'
  ]);
});

test('migrates once: a second open reads pins.local.json as it is', async () => {
  await writeOldFiles();
  await loadPins();
  await setReferencePin(INDEX_URL, null);
  setLocalFolder(dir);
  expect((await loadPins()).references).toEqual({});
  expect((await loadPins()).volumes.v?.records).toEqual([
    { record: 12, image: 5, by: 'vision' }
  ]);
});
