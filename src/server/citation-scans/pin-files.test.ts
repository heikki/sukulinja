import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import type { Pins } from './locate';
import { fillFileIds } from './pin-files';
import { openPins } from './pins';
import { BOX, listedAstia, ref, vision } from './test-pins';

let dir = '';
let lists: Record<string, string[]> = {};
const ASTIA = listedAstia(() => lists);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pin-files-'));
  lists = {};
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function open(base: Pins['volumes'] = {}) {
  return openPins(dir, { astia: ASTIA, base });
}

function localFile() {
  return join(dir, 'pins.local.json');
}

function at(volumeId: string, image: number) {
  return { volumeId, image };
}

function elsewhere(volume: string) {
  return { volume, linked: false };
}

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

// ---------------------------------------------------------------- file ids

test('fills in the file ids of pins saved before pins kept them', async () => {
  const url = ref(null).url;
  const saved = {
    volumes: {
      a: {
        pages: [
          { image: 2, pages: [3] },
          { image: 4, pages: [5], fileId: 'kept' }
        ],
        records: [{ record: 12, image: 2, by: 'vision', box: BOX }],
        ranges: [{ from: 10, to: 20 }]
      },
      b: { pages: [], villages: ['Kylä'] }
    },
    references: {
      [url]: { volumeId: 'c', volume: 'I C:1', image: 1 },
      other: { volumeId: 'd', volume: 'I C:2' }
    },
    rejected: { [url]: [{ volumeId: 'a', image: 3 }] }
  };
  await Bun.write(localFile(), JSON.stringify(saved));
  lists = { a: ['a1', 'a2', 'a3', 'a4'], c: ['c1'] };
  await fillFileIds(dir, ASTIA);
  expect(await Bun.file(localFile()).json()).toEqual({
    volumes: {
      a: {
        pages: [
          { image: 2, pages: [3], fileId: 'a2' },
          { image: 4, pages: [5], fileId: 'kept' }
        ],
        records: [
          { record: 12, image: 2, by: 'vision', box: BOX, fileId: 'a2' }
        ],
        ranges: [{ from: 10, to: 20 }]
      },
      b: { pages: [], villages: ['Kylä'] }
    },
    references: {
      [url]: { volumeId: 'c', volume: 'I C:1', image: 1, fileId: 'c1' },
      other: { volumeId: 'd', volume: 'I C:2' }
    },
    rejected: { [url]: [{ volumeId: 'a', image: 3, fileId: 'a3' }] }
  });
  expect(await readdir(dir)).toEqual(['pins.local.json']);
});

test("a Volume whose list isn't cached keeps its pins as they are", async () => {
  const saved = {
    volumes: { a: { pages: [{ image: 2, pages: [3] }] } },
    references: {}
  };
  await Bun.write(localFile(), JSON.stringify(saved));
  const before = await stat(localFile());
  await fillFileIds(dir, ASTIA);
  expect(await Bun.file(localFile()).json()).toEqual(saved);
  expect((await stat(localFile())).mtimeMs).toBe(before.mtimeMs);
});

test('opening the pins fills in file ids before they are first read', async () => {
  await Bun.write(
    localFile(),
    JSON.stringify({
      volumes: { a: { pages: [{ image: 2, pages: [3] }] } },
      references: {}
    })
  );
  lists = { a: ['a1', 'a2'] };
  await open().snapshot();
  expect(await Bun.file(localFile()).json()).toEqual({
    volumes: { a: { pages: [{ image: 2, pages: [3], fileId: 'a2' }] } },
    references: {}
  });
});

test('a fill that fails is logged, and the pins read as they are', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => undefined);
  const references = { r: { volumeId: 'a', volume: 'I A:1', image: 2 } };
  await Bun.write(localFile(), JSON.stringify({ volumes: {}, references }));
  const broken = {
    ...ASTIA,
    cachedImages: async () => await Promise.reject(new Error('unreadable'))
  };
  const pins = openPins(dir, { astia: broken, base: {} });
  expect((await pins.snapshot()).references).toEqual(references);
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});
