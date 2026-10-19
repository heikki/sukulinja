import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { Pins } from './locate';
import { openPins } from './pins';
import type { MarkTarget } from './pins';
import shipped from './pins.json';
import type { ChurchBookRef } from './record';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pins-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const BASE: Pins['volumes'] = {
  a: {
    title: 'I Aa:1',
    pages: [{ image: 10, pages: [20] }],
    ranges: [{ from: 100, to: 200 }]
  }
};

const BOX = { left: 0.1, top: 0.4, width: 0.5, height: 0.05 };

function open(base = BASE) {
  return openPins(dir, { base });
}

function localFile() {
  return join(dir, 'pins.local.json');
}

async function writeLocal(pins: Partial<Pins>) {
  await Bun.write(localFile(), JSON.stringify(pins));
}

// A rippikirja reference to the record, on the page when given.
function ref(recordId: number | null, page: number | null = null) {
  const item = recordId ?? 'none';
  const book: ChurchBookRef = {
    url: `https://www.myheritage.fi/research/collection-10509/x?itemId=${item}`,
    collection: '10509',
    parish: 'Juva',
    kind: 'rippi',
    years: { from: 1790, to: 1796 },
    page,
    places: [],
    recordId,
    name: null,
    date: null,
    household: null,
    named: []
  };
  return book;
}

function vision(volumeId: string, image: number, onCitedPage = false) {
  return { volumeId, volume: volumeId, image, onCitedPage, box: BOX };
}

function linked(volume = 'I Aa:1') {
  return { volume, linked: true };
}

function elsewhere(volume = 'I Aa:1') {
  return { volume, linked: false };
}

function at(volumeId: string, image: number): MarkTarget {
  return { volumeId, image };
}

// ---------------------------------------------------------------- reading

test('reads the local pins over the base', async () => {
  await writeLocal({
    volumes: {
      a: {
        pages: [{ image: 10, pages: [99] }],
        villages: ['Kylä'],
        ranges: [{ from: 300, to: 310 }],
        records: [{ record: 150, image: 10 }]
      },
      b: { title: 'I Aa:2', pages: [{ image: 2, pages: [3] }] }
    }
  });
  const { volumes, references } = await open().snapshot();
  expect(volumes.a).toEqual({
    title: 'I Aa:1',
    pages: [{ image: 10, pages: [99] }],
    villages: ['Kylä'],
    ranges: [
      { from: 100, to: 200 },
      { from: 300, to: 310 }
    ],
    records: [{ record: 150, image: 10 }]
  });
  expect(volumes.b).toEqual({
    title: 'I Aa:2',
    pages: [{ image: 2, pages: [3] }]
  });
  expect(references).toEqual({});
  expect(BASE.a!.pages).toEqual([{ image: 10, pages: [20] }]);
});

test('reads over the shipped pins unless given a base', async () => {
  const { volumes } = await openPins(dir).snapshot();
  expect(Object.keys(volumes)).toEqual(Object.keys(shipped.volumes));
});

test('ships only facts about Volumes, never Record or Reference pins', () => {
  expect(Object.keys(shipped)).toEqual(['volumes']);
  const volumes: Pins['volumes'] = shipped.volumes;
  for (const volume of Object.values(volumes)) {
    expect(volume.records).toBeUndefined();
  }
});

test('the stamp changes when another opening saves, and so does the snapshot', async () => {
  const app = open();
  const pass = open();
  const before = await app.stamp();
  expect((await app.snapshot()).volumes.b).toBeUndefined();
  await pass.recordVision(ref(5000), vision('b', 4));
  expect(await app.stamp()).not.toBe(before);
  expect((await app.snapshot()).volumes.b?.records).toEqual([
    { record: 5000, image: 4, by: 'vision', box: BOX }
  ]);
});

// ---------------------------------------------------------------- marks

test('a Mark of a page in a linked Volume saves a hand Page pin and Record pin', async () => {
  const pins = open();
  await pins.recordMark(ref(150, 21), at('a', 11), linked());
  // Marking page 21 again moves it rather than adding a second claim.
  await pins.recordMark(ref(150, 21), at('a', 12), linked());

  const a = (await pins.snapshot()).volumes.a!;
  expect(a.pages).toEqual([
    { image: 10, pages: [20] },
    { image: 12, pages: [21], note: 'marked in the app', by: 'hand' }
  ]);
  expect(a.records).toEqual([{ record: 150, image: 12, by: 'hand' }]);
});

test('a Volume numbered by page takes both pages of an Image', async () => {
  const pins = open({});
  const lasten = { ...ref(null, 40), kind: 'lasten' as const };
  await pins.recordMark(lasten, at('c', 5), linked('I Ab:1'));
  expect((await pins.snapshot()).volumes.c?.pages).toEqual([
    { image: 5, pages: [40, 41], note: 'marked in the app', by: 'hand' }
  ]);
});

test('a Mark outside the linked Volumes saves a Reference pin, which a linked Mark takes back', async () => {
  const pins = open();
  const cited = ref(null, 21);
  await pins.recordMark(cited, at('b', 3), elsewhere('I Aa:2'));
  expect((await pins.snapshot()).references).toEqual({
    [cited.url]: { volumeId: 'b', volume: 'I Aa:2', image: 3, by: 'hand' }
  });
  await pins.recordMark(cited, at('a', 11), linked());
  const { volumes, references } = await pins.snapshot();
  expect(references).toEqual({});
  expect(volumes.a!.pages.map((p) => p.image)).toEqual([10, 11]);
});

test('confirming a vision match by hand keeps its Box', async () => {
  const pins = open();
  await pins.recordVision(ref(150), vision('a', 11));
  await pins.recordMark(ref(150, 21), at('a', 11), linked());
  expect((await pins.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand', box: BOX }
  ]);
});

// ---------------------------------------------------------------- precedence

test('a vision pin never replaces a hand one', async () => {
  const pins = open();
  await pins.recordMark(ref(150, 21), at('a', 11), linked());
  await pins.recordVision(ref(150, 21), vision('a', 12, true));
  // Nor a Page pin of the base, which counts as by hand.
  await pins.recordVision(ref(160, 20), vision('a', 10, true));
  const index = ref(null);
  await pins.recordMark(index, at('b', 5), elsewhere('I C:1'));
  await pins.recordVision(index, vision('b', 6));

  const { volumes, references } = await pins.snapshot();
  expect(volumes.a!.pages).toEqual([
    { image: 10, pages: [20] },
    { image: 11, pages: [21], note: 'marked in the app', by: 'hand' }
  ]);
  expect(volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand' },
    { record: 160, image: 10, by: 'vision', box: BOX }
  ]);
  expect(references[index.url]).toEqual({
    volumeId: 'b',
    volume: 'I C:1',
    image: 5,
    by: 'hand'
  });
});

test('a hand pin replaces a vision one', async () => {
  const pins = open();
  await pins.recordVision(ref(150, 21), vision('a', 11, true));
  await pins.recordMark(ref(150, 21), at('a', 12), linked());
  const index = ref(null);
  await pins.recordVision(index, vision('b', 6));
  await pins.recordMark(index, at('b', 5), elsewhere('I C:1'));

  const { volumes, references } = await pins.snapshot();
  expect(volumes.a!.pages).toEqual([
    { image: 10, pages: [20] },
    { image: 12, pages: [21], note: 'marked in the app', by: 'hand' }
  ]);
  expect(volumes.a!.records).toEqual([{ record: 150, image: 12, by: 'hand' }]);
  expect(references[index.url]).toEqual({
    volumeId: 'b',
    volume: 'I C:1',
    image: 5,
    by: 'hand'
  });
});

test('a record pinned again moves to its new Image, in any Volume', async () => {
  const pins = open({});
  await pins.recordVision(ref(12), vision('x', 4));
  await pins.recordVision(ref(12), vision('y', 9));
  const { volumes } = await pins.snapshot();
  expect(volumes.x!.records).toBeUndefined();
  expect(volumes.y!.records).toEqual([
    { record: 12, image: 9, by: 'vision', box: BOX }
  ]);
});

// ---------------------------------------------------------------- ranges

test('a Record pin extends the nearest Record range of its Volume', async () => {
  const pins = open({
    a: {
      pages: [],
      ranges: [
        { from: 100, to: 200 },
        { from: 500, to: 600 }
      ]
    },
    b: { pages: [], ranges: [{ from: 300, to: 400 }] },
    c: { pages: [], ranges: [{ from: 1000, to: 1100 }] }
  });
  await pins.recordVision(ref(250), vision('a', 4));
  await pins.recordVision(ref(150), vision('a', 3));
  await pins.recordVision(ref(650), vision('a', 40));
  // Records 401–499 lie between b's range and a's: a's grows down to them.
  await pins.recordVision(ref(450), vision('a', 30));
  // c's nearest range is past a's 450–650: it can't grow over it.
  await pins.recordVision(ref(50), vision('c', 2));
  await pins.recordVision(ref(800), vision('d', 2));

  const { volumes } = await pins.snapshot();
  // The extended ranges stand in for the base ones they grew from.
  expect(volumes.a!.ranges).toEqual([
    { from: 100, to: 250 },
    { from: 450, to: 650 }
  ]);
  expect(volumes.c!.ranges).toEqual([{ from: 1000, to: 1100 }]);
  // A Volume with no range starts one.
  expect(volumes.d!.ranges).toEqual([{ from: 800, to: 800 }]);
});

// ---------------------------------------------------------------- writing

test('two openings saving at once both keep their saves', async () => {
  const app = open();
  const pass = open();
  const saves = Array.from({ length: 10 }, (_, i) => [
    app.recordMark(ref(1000 + i), at('v', i + 1), elsewhere('V')),
    pass.recordVision(ref(2000 + i), vision('v', i + 1))
  ]).flat();
  await Promise.all(saves);

  const { volumes, references } = await open().snapshot();
  expect(volumes.v!.records).toHaveLength(20);
  expect(Object.keys(references)).toHaveLength(10);
  expect(await readdir(dir)).toEqual(['pins.local.json']);
});

test('a reader never sees half a file', async () => {
  const pins = open();
  const state = { saving: true };
  const saves = Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      pins.recordVision(ref(1000 + i), vision('v', i + 1))
    )
  ).finally(() => {
    state.saving = false;
  });
  let reads = 0;
  while (state.saving) {
    // eslint-disable-next-line no-await-in-loop -- reading while it's written
    const text = await Bun.file(localFile())
      .text()
      .catch(() => null);
    if (text !== null) {
      expect(() => JSON.parse(text) as unknown).not.toThrow();
      reads += 1;
    }
    // eslint-disable-next-line no-await-in-loop -- as above
    await Bun.sleep(1);
  }
  await saves;
  expect(reads).toBeGreaterThan(0);
});

test('takes over a lock left by a process that died', async () => {
  await Bun.write(
    join(dir, 'pins.lock'),
    JSON.stringify({ pid: 1, at: Date.now() - 31_000 })
  );
  const pins = open();
  await pins.recordVision(ref(150), vision('a', 11));
  expect((await pins.snapshot()).volumes.a!.records).toHaveLength(1);
  expect(await readdir(dir)).toEqual(['pins.local.json']);
});

test('gives up after 5 s on a lock another save holds', async () => {
  await Bun.write(
    join(dir, 'pins.lock'),
    JSON.stringify({ pid: 1, at: Date.now() })
  );
  const since = Date.now();
  const failed = await open()
    .recordVision(ref(150), vision('a', 11))
    .then(() => null)
    .catch((err: unknown) => err);
  expect(Date.now() - since).toBeGreaterThanOrEqual(5000);
  expect(String(failed)).toContain('locked');
  expect(await Bun.file(localFile()).exists()).toBe(false);
}, 10_000);

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
}

test('moves the files saved before pins into pins.local.json', async () => {
  await writeOldFiles();
  const { volumes, references } = await open({}).snapshot();

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

test('migrates once: a later opening reads pins.local.json as it is', async () => {
  await writeOldFiles();
  await open({}).recordVision(ref(13), vision('v', 6));
  const { volumes, references } = await open({}).snapshot();
  expect(Object.keys(references)).toEqual([INDEX_URL]);
  expect(volumes.v?.records).toEqual([
    { record: 12, image: 5, by: 'vision' },
    { record: 13, image: 6, by: 'vision', box: BOX }
  ]);
});
