import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Astia } from './astia';
import { memoryAstia } from './memory-astia';
import { FolderAwayError } from './offload-folder';
import { OffloadedError, openScanCache } from './scan-cache';
import type { ScanCache } from './scan-cache';

// The Scan cache's offloaded Volumes and its offload folder.

const IMAGES = 10;
const IMAGE_BYTES = 1000;

let dir = '';
// File ids in the order Astia was asked for them.
let fetched: string[] = [];

// Volumes 101–106 of ten Images each, whose files Astia gives IMAGE_BYTES
// long.
const listed = memoryAstia({
  '1': {
    volumes: ['101', '102', '103', '104', '105', '106'].map((id) => ({
      id,
      label: `Volume ${id}`,
      images: IMAGES
    }))
  }
});
const astia: Astia = {
  ...listed,
  // eslint-disable-next-line @typescript-eslint/require-await -- Astia's shape
  async imageBytes(_volumeId, fileId) {
    fetched.push(fileId);
    return new Uint8Array(IMAGE_BYTES).fill(0xff);
  }
};

// Opened afresh on each test's folder.
let cache: ScanCache = openScanCache({ astia, root: dir });

function open(volumeId: string, image: number) {
  return cache.image({ volumeId, image }, 'full', new AbortController().signal);
}

function thumb(volumeId: string, image: number) {
  return cache.image(
    { volumeId, image },
    'thumb',
    new AbortController().signal
  );
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'offloaded-'));
  cache = openScanCache({ astia, root: dir });
  fetched = [];
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('an offloaded Volume fetches its cited Images first, then nothing', async () => {
  await Promise.all([1, 2, 3].map(async (n) => await open('106', n)));
  await thumb('106', 1);
  fetched = [];
  await cache.offload('106', [2, 7]);
  expect(fetched).toEqual(['106-f7']);
  expect(await cache.isOffloaded('106')).toBe(true);
  expect((await readdir(join(dir, '.astia-images', '106'))).toSorted()).toEqual(
    ['106-f2.jpg', '106-f7.jpg', '106-t1.jpg', 'offloaded.json']
  );
  expect(await open('106', 7)).toEndWith('106-f7.jpg');
  const refused = await Promise.all(
    [open('106', 3), thumb('106', 4)].map(
      async (p) => await p.catch((err: unknown) => err)
    )
  );
  for (const err of refused) expect(err).toBeInstanceOf(OffloadedError);
  expect(fetched).toEqual(['106-f7']);
  expect(await cache.keeps({ volumeId: '106', image: 7 })).toBe(true);
  expect(await cache.keeps({ volumeId: '106', image: 3 })).toBe(false);
  // Brought back, it's any Volume again.
  await cache.bringBack('106');
  expect(await cache.keeps({ volumeId: '106', image: 3 })).toBe(true);
  expect(await open('106', 3)).toEndWith('106-f3.jpg');
});

test("an offloaded Volume's kept Images are never pruned", async () => {
  await open('105', 1);
  await cache.offload('105', [1]);
  await cache.setCap(2.5 * IMAGE_BYTES);
  await open('104', 1);
  await Bun.sleep(5);
  await open('104', 2);
  await Bun.sleep(5);
  await open('104', 3);
  expect(await readdir(join(dir, '.astia-images', '105'))).toContain(
    '105-f1.jpg'
  );
  expect(await readdir(join(dir, '.astia-images', '104'))).toEqual([
    '104-f3.jpg'
  ]);
});

test('clearing keeps what an offloaded Volume keeps, and its marker', async () => {
  await open('105', 1);
  await open('104', 1);
  await cache.offload('105', [1]);
  await cache.clear();
  expect(await cache.isOffloaded('105')).toBe(true);
  fetched = [];
  expect(await open('105', 1)).toBe(
    join(dir, '.astia-images', '105', '105-f1.jpg')
  );
  expect(fetched).toEqual([]);
  expect(await readdir(join(dir, '.astia-images'))).toEqual(['105']);
});

test('an offloaded Volume with no Image left is still listed', async () => {
  await cache.offload('104', []);
  expect(await cache.volumes()).toContain('104');
  await cache.remove('104');
  expect(await cache.isOffloaded('104')).toBe(false);
});

test('an offload moves the rest into the offload folder, read from there', async () => {
  const away = join(dir, 'ssd');
  await mkdir(away);
  await cache.offloadFolder.set(away);
  await Promise.all([1, 2].map(async (n) => await open('103', n)));
  fetched = [];
  await cache.offload('103', [1]);
  expect(await readdir(join(away, '103'))).toContain('103-f2.jpg');
  expect(await open('103', 2)).toBe(join(away, '103', '103-f2.jpg'));
  expect(fetched).toEqual([]);
  // Its drive away, it's unavailable, and nothing more is offloaded.
  await rm(away, { recursive: true });
  expect(await cache.offloadFolder.status()).toEqual({
    path: away,
    attached: false
  });
  const unread = await open('103', 2).catch((err: unknown) => err);
  expect(unread).toBeInstanceOf(OffloadedError);
  await open('102', 1);
  const refused = await cache.offload('102', []).catch((err: unknown) => err);
  expect(refused).toBeInstanceOf(FolderAwayError);
  expect(await cache.isOffloaded('102')).toBe(false);
});

test('bringing back copies the Images back from the offload folder', async () => {
  const away = join(dir, 'ssd');
  await mkdir(away);
  await cache.offloadFolder.set(away);
  await Promise.all([1, 2, 3].map(async (n) => await open('103', n)));
  await cache.offload('103', [1]);
  // Its drive away, nothing is brought back.
  await rename(away, `${away}-off`);
  const refused = await cache.bringBack('103').catch((err: unknown) => err);
  expect(refused).toBeInstanceOf(FolderAwayError);
  expect(await cache.isOffloaded('103')).toBe(true);
  await rename(`${away}-off`, away);
  fetched = [];
  await cache.bringBack('103');
  expect(await cache.isOffloaded('103')).toBe(false);
  expect(await cache.onDisk('103')).toMatchObject({ cached: 3 });
  // The folder keeps them.
  expect(await kept(away, '103', 3)).toEqual([
    '103-f1.jpg',
    '103-f2.jpg',
    '103-f3.jpg'
  ]);
  expect(await open('103', 2)).toBe(
    join(dir, '.astia-images', '103', '103-f2.jpg')
  );
  expect(fetched).toEqual([]);
});

test('a Volume removed for good leaves the offload folder, only while attached', async () => {
  const away = join(dir, 'ssd');
  await mkdir(away);
  await cache.offloadFolder.set(away);
  await Promise.all([1, 2].map(async (n) => await open('103', n)));
  await cache.offload('103', []);
  await rename(away, `${away}-off`);
  const refused = await cache.offloadFolder
    .forget('103')
    .catch((err: unknown) => err);
  expect(refused).toBeInstanceOf(FolderAwayError);
  await rename(`${away}-off`, away);
  expect(await kept(away, '103', 2)).toHaveLength(2);
  await cache.offloadFolder.forget('103');
  expect(await readdir(away)).toEqual([]);
});

test('a Volume removed for good keeps its facts in the offload folder', async () => {
  const away = join(dir, 'ssd');
  await mkdir(away);
  await cache.offloadFolder.set(away);
  await open('103', 1);
  await cache.offloadFolder.keepFacts('103', '{"pages":[]}');
  expect(await kept(away, '103', 1)).toHaveLength(1);
  await cache.offloadFolder.forget('103');
  expect(await readdir(join(away, '103'))).toEqual(['facts.json']);
  expect(await cache.offloadFolder.facts('103')).toBe('{"pages":[]}');
});

// Lists what the offload folder has of the Volume once its copies, made
// aside, are in.
async function kept(away: string, volumeId: string, count: number) {
  async function names() {
    const all = await readdir(join(away, volumeId)).catch(() => []);
    return all.filter((n) => n.endsWith('.jpg'));
  }
  for (let tries = 0; tries < 500; tries++) {
    // eslint-disable-next-line no-await-in-loop -- polling, one look at a time
    if ((await names()).length >= count) break;
    // eslint-disable-next-line no-await-in-loop -- polling, one look at a time
    await Bun.sleep(2);
  }
  return (await names()).toSorted();
}

test('every Image fetched with the offload folder attached is kept there too', async () => {
  const away = join(dir, 'ssd');
  await mkdir(away);
  await cache.offloadFolder.set(away);
  await open('103', 1);
  await thumb('103', 1);
  expect(await kept(away, '103', 2)).toEqual(['103-f1.jpg', '103-t1.jpg']);
  // Pruned off the disk, it's read from there, not fetched again.
  await rm(join(dir, '.astia-images', '103', '103-f1.jpg'));
  fetched = [];
  expect(await open('103', 1)).toBe(join(away, '103', '103-f1.jpg'));
  expect(fetched).toEqual([]);
});

test('what was fetched before the offload folder was set is copied in', async () => {
  await Promise.all([1, 2].map(async (n) => await open('104', n)));
  await thumb('104', 1);
  await cache.offload('104', [1]);
  const away = join(dir, 'ssd');
  await mkdir(away);
  await cache.offloadFolder.set(away);
  await cache.archive();
  expect(await kept(away, '104', 2)).toEqual(['104-f1.jpg', '104-t1.jpg']);
  // Copied in once: again, nothing changes.
  await cache.archive();
  expect(await readdir(join(away, '104'))).toHaveLength(2);
});

test('what the offload folder has counts as on disk, and a cut-off copy is made whole', async () => {
  await Promise.all([1, 2].map(async (n) => await open('105', n)));
  const away = join(dir, 'ssd');
  await mkdir(join(away, '105'), { recursive: true });
  // One cut off on its way in, and one only there.
  await Bun.write(join(away, '105', '105-f1.jpg'), 'x');
  await Bun.write(join(away, '105', '105-f3.jpg'), 'y'.repeat(IMAGE_BYTES));
  await cache.offloadFolder.set(away);
  expect(await cache.onDisk('105')).toMatchObject({ cached: 3 });
  expect(await cache.isCached({ volumeId: '105', image: 3 })).toBe(true);
  await cache.archive();
  expect(Bun.file(join(away, '105', '105-f1.jpg')).size).toBe(IMAGE_BYTES);
  expect(await kept(away, '105', 3)).toEqual([
    '105-f1.jpg',
    '105-f2.jpg',
    '105-f3.jpg'
  ]);
});
