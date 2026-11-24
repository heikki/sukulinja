import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openVolumeFacts } from '.';
import { juvaAstia } from '../astia/test-parish';
import { joinSkipsInDataFolder, joinSkipsInOffloadFolder } from './join-skips';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'join-skips-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const VOLUME = 'juva-1';

async function NO_LISTS() {
  return await Promise.resolve(null);
}

// Skips on 3 and 9 apart, a page on 14, and 16–19 skipped one by one.
const OLD = [
  ...[3, 9].map((image) => ({ image, pages: [] })),
  { image: 14, pages: [8] },
  ...[16, 17, 18, 19].map((image) => ({ image, pages: [] }))
];

async function skipped(folder: string) {
  const facts = openVolumeFacts(folder, { astia: juvaAstia() });
  return (await facts.pagesOn(VOLUME, 'I Aa:1'))
    .filter((p) => p.pages.length === 0)
    .map((p) => p.image);
}

test('a data folder migrated skips what it did, a run kept at its ends, once', async () => {
  const data = join(dir, 'data');
  await mkdir(data);
  const file = join(data, 'pins.local.json');
  await Bun.write(
    file,
    JSON.stringify({ volumes: { [VOLUME]: { pages: OLD } }, references: {} })
  );
  expect(await skipped(data)).toEqual([3, 4, 5, 6, 7, 8, 9, 16, 17, 18, 19]);
  expect(await joinSkipsInDataFolder(data)).toEqual([VOLUME]);
  expect(await skipped(data)).toEqual([3, 9, 16, 17, 18, 19]);
  async function pages() {
    const saved = (await Bun.file(file).json()) as {
      volumes: Record<string, { pages: unknown[] }>;
    };
    return saved.volumes[VOLUME]?.pages;
  }
  const migrated = await pages();
  expect(migrated).toMatchObject([
    { image: 3, pages: [], alone: true },
    { image: 9, pages: [], alone: true },
    { image: 14, pages: [8] },
    { image: 16, pages: [] },
    { image: 19, pages: [] }
  ]);
  // Run again, it's left as it is.
  expect(await joinSkipsInDataFolder(data)).toBeNull();
  expect(await pages()).toEqual(migrated);
});

test("an Offload folder's copies migrated keep all they say, once", async () => {
  const offload = join(dir, 'offload');
  const copy = join(offload, VOLUME, 'facts.json');
  const said = { title: 'I Aa:1', archive: 'Juvan arkisto', pages: OLD };
  await mkdir(join(offload, VOLUME), { recursive: true });
  await Bun.write(copy, JSON.stringify(said));
  expect(await joinSkipsInOffloadFolder(offload, NO_LISTS)).toEqual([VOLUME]);
  expect(await Bun.file(copy).json()).toEqual({
    ...said,
    pages: [
      { image: 3, pages: [], alone: true },
      { image: 9, pages: [], alone: true },
      { image: 14, pages: [8] },
      { image: 16, pages: [] },
      { image: 19, pages: [] }
    ]
  });
  expect(await joinSkipsInOffloadFolder(offload, NO_LISTS)).toBeNull();
});

test("pins of another filming tell no skips apart, as they're not counted", async () => {
  const data = join(dir, 'data');
  await mkdir(data);
  const file = join(data, 'pins.local.json');
  const files = Array.from({ length: 20 }, (_, i) => `f${i + 1}`);
  function on(image: number) {
    return { fileId: files[image - 1] };
  }
  await Bun.write(
    file,
    JSON.stringify({
      volumes: {
        [VOLUME]: {
          pages: [
            ...[3, 4, 5].map((image) => ({ image, pages: [], ...on(image) })),
            { image: 7, pages: [9], fileId: 'old-f7' },
            ...[9, 10, 11].map((image) => ({ image, pages: [], ...on(image) })),
            { image: 13, pages: [], fileId: 'old-f13' }
          ]
        }
      },
      references: {}
    })
  );
  expect(
    await joinSkipsInDataFolder(data, async () => await Promise.resolve(files))
  ).toEqual([VOLUME]);
  const saved = (await Bun.file(file).json()) as {
    volumes: Record<
      string,
      { pages: Array<{ image: number; alone?: boolean }> }
    >;
  };
  // Nothing current between the two runs: each Image of them kept alone.
  expect(
    saved.volumes[VOLUME]?.pages.map((p) => [p.image, p.alone ?? false])
  ).toEqual([
    [3, true],
    [4, true],
    [5, true],
    [7, false],
    [9, true],
    [10, true],
    [11, true],
    [13, true]
  ]);
});
