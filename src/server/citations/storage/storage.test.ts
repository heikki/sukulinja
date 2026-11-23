import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FolderAwayError, OffloadedError, openStorage } from '.';
import type { Storage } from '.';
import type { Astia } from '../astia/astia';
import { memoryAstia } from '../astia/memory-astia';

// Storage through its two faces: Offloaded Volumes, the Offload folder,
// and the steps between.

const IMAGES = 10;
const IMAGE_BYTES = 1000;

let dir = '';
// File ids in the order Astia was asked for them.
let fetched: string[] = [];
// The Images each Volume's Citations link, as the datasets would say.
let cited: Record<string, number[]> = {};

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

function opened(root: string) {
  return openStorage({
    astia,
    root,
    citedImages: async (volumeId) =>
      await Promise.resolve(cited[volumeId] ?? []),
    downloads: { gapMs: 0, retryMs: 0 }
  });
}

// Opened afresh on each test's folder.
let storage: Storage = opened(dir);

function open(volumeId: string, image: number) {
  return storage.images.image(
    { volumeId, image },
    'full',
    new AbortController().signal
  );
}

function thumb(volumeId: string, image: number) {
  return storage.images.image(
    { volumeId, image },
    'thumb',
    new AbortController().signal
  );
}

async function offloaded(volumeId: string) {
  return (await storage.volumes.of(volumeId)).offloaded !== null;
}

async function offload(volumeId: string, images: number[]) {
  cited[volumeId] = images;
  await storage.volumes.offload(volumeId);
}

// The Offload folder, set and attached.
async function attachFolder() {
  const away = join(dir, 'ssd');
  await mkdir(away, { recursive: true });
  await storage.volumes.setFolder(away);
  return away;
}

// Lists what the Offload folder has of the Volume once its copies, made
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

// Waits out the copies each fetch makes into the Offload folder aside, so
// none lands after the folder is taken away or emptied.
async function copiesSettled(away: string, volumeId: string) {
  let quiet = 0;
  while (quiet < 3) {
    // eslint-disable-next-line no-await-in-loop -- polling, one look at a time
    const names = await readdir(join(away, volumeId)).catch(() => []);
    quiet = names.some((n) => n.endsWith('.part')) ? 0 : quiet + 1;
    // eslint-disable-next-line no-await-in-loop -- polling, one look at a time
    await Bun.sleep(2);
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'storage-'));
  storage = opened(dir);
  fetched = [];
  cited = {};
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('an offloaded Volume fetches its cited Images first, then nothing', async () => {
  await open('106', 2);
  await thumb('106', 1);
  fetched = [];
  await offload('106', [2, 7]);
  expect(fetched).toEqual(['106-f7']);
  expect(await offloaded('106')).toBe(true);
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
  const { citable } = storage.images;
  expect(await citable({ volumeId: '106', image: 7 })).toBe(true);
  expect(await citable({ volumeId: '106', image: 3 })).toBe(false);
});

test('what an offload would free is told before it', async () => {
  await Promise.all([1, 2, 3].map(async (n) => await open('104', n)));
  cited['104'] = [1];
  expect(await storage.volumes.offloadFrees('104')).toBe(2 * IMAGE_BYTES);
});

test("an offloaded Volume's kept Images are never pruned", async () => {
  await open('105', 1);
  await offload('105', [1]);
  await storage.volumes.setCap(2.5 * IMAGE_BYTES);
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
  await offload('105', [1]);
  expect(await storage.volumes.status()).toMatchObject({
    used: 2 * IMAGE_BYTES,
    kept: IMAGE_BYTES
  });
  await storage.volumes.clear();
  expect(await offloaded('105')).toBe(true);
  expect(await storage.volumes.status()).toMatchObject({
    used: IMAGE_BYTES,
    kept: IMAGE_BYTES
  });
  fetched = [];
  expect(await open('105', 1)).toBe(
    join(dir, '.astia-images', '105', '105-f1.jpg')
  );
  expect(fetched).toEqual([]);
  expect(await readdir(join(dir, '.astia-images'))).toEqual(['105']);
});

test('an offloaded Volume with no Image left is still here, until removed', async () => {
  await offload('104', []);
  expect(await storage.volumes.here()).toContain('104');
  await storage.volumes.remove('104');
  expect(await offloaded('104')).toBe(false);
  expect(await storage.volumes.here()).not.toContain('104');
});

test('an offload moves the rest into the Offload folder, read from there', async () => {
  const away = await attachFolder();
  await Promise.all([1, 2].map(async (n) => await open('103', n)));
  fetched = [];
  await offload('103', [1]);
  expect(await readdir(join(away, '103'))).toContain('103-f2.jpg');
  expect(await open('103', 2)).toBe(join(away, '103', '103-f2.jpg'));
  expect(fetched).toEqual([]);
  // Its drive away, it's unavailable, and nothing more is offloaded.
  await rm(away, { recursive: true });
  expect(await storage.volumes.folder()).toEqual({
    path: away,
    attached: false
  });
  const unread = await open('103', 2).catch((err: unknown) => err);
  expect(unread).toBeInstanceOf(OffloadedError);
  await open('102', 1);
  const refused = await offload('102', []).catch((err: unknown) => err);
  expect(refused).toBeInstanceOf(FolderAwayError);
  expect(await offloaded('102')).toBe(false);
});

test('downloading an offloaded Volume brings it back from the Offload folder first', async () => {
  const away = await attachFolder();
  await Promise.all([1, 2, 3].map(async (n) => await open('103', n)));
  await offload('103', [1]);
  await copiesSettled(away, '103');
  // Its drive away, nothing is brought back, nor downloaded.
  await rename(away, `${away}-off`);
  const refused = await storage.volumes
    .download('103')
    .catch((err: unknown) => err);
  expect(refused).toBeInstanceOf(FolderAwayError);
  expect(await offloaded('103')).toBe(true);
  expect(storage.volumes.downloads()).toEqual([]);
  await rename(`${away}-off`, away);
  fetched = [];
  await storage.volumes.download('103');
  expect(await offloaded('103')).toBe(false);
  // The folder keeps them, beside the rest as they're downloaded.
  const inFolder = await kept(away, '103', 3);
  for (const n of [1, 2, 3]) expect(inFolder).toContain(`103-f${n}.jpg`);
  expect(await open('103', 2)).toBe(
    join(dir, '.astia-images', '103', '103-f2.jpg')
  );
  // Removed, the download is dropped first; only the rest was fetched.
  await storage.volumes.remove('103');
  expect(fetched).not.toContain('103-f2');
  expect(storage.volumes.downloads()).toEqual([]);
});

test('a Volume removed for good leaves the Offload folder, only while attached', async () => {
  const away = await attachFolder();
  await Promise.all([1, 2].map(async (n) => await open('103', n)));
  await offload('103', []);
  await copiesSettled(away, '103');
  await rename(away, `${away}-off`);
  const refused = await storage.volumes
    .removeForGood('103')
    .catch((err: unknown) => err);
  expect(refused).toBeInstanceOf(FolderAwayError);
  // Nor is it removed from disk, losing what it keeps.
  const notRemoved = await storage.volumes
    .remove('103')
    .catch((err: unknown) => err);
  expect(notRemoved).toBeInstanceOf(FolderAwayError);
  expect(await offloaded('103')).toBe(true);
  await rename(`${away}-off`, away);
  expect(await kept(away, '103', 2)).toHaveLength(2);
  await storage.volumes.removeForGood('103');
  expect(await readdir(away)).toEqual([]);
  expect(await storage.volumes.here()).not.toContain('103');
});

test('a Volume removed for good keeps its facts in the Offload folder', async () => {
  const away = await attachFolder();
  await open('103', 1);
  await storage.folderFacts.keepFacts('103', '{"pages":[]}');
  expect(await kept(away, '103', 1)).toHaveLength(1);
  await copiesSettled(away, '103');
  await storage.volumes.removeForGood('103');
  expect(await readdir(join(away, '103'))).toEqual(['facts.json']);
  expect(await storage.folderFacts.facts('103')).toBe('{"pages":[]}');
});

test('every Image fetched with the Offload folder attached is kept there too', async () => {
  const away = await attachFolder();
  await open('103', 1);
  await thumb('103', 1);
  expect(await kept(away, '103', 2)).toEqual(['103-f1.jpg', '103-t1.jpg']);
  // Pruned off the disk, it's read from there, not fetched again.
  await rm(join(dir, '.astia-images', '103', '103-f1.jpg'));
  fetched = [];
  expect(await open('103', 1)).toBe(join(away, '103', '103-f1.jpg'));
  expect(fetched).toEqual([]);
});

test('what was fetched before the Offload folder was set is copied in', async () => {
  await Promise.all([1, 2].map(async (n) => await open('104', n)));
  await thumb('104', 1);
  await offload('104', [1]);
  const away = await attachFolder();
  expect(await kept(away, '104', 2)).toEqual(['104-f1.jpg', '104-t1.jpg']);
  // Copied in once: set again, nothing changes.
  await storage.volumes.setFolder(away);
  await Bun.sleep(10);
  expect(await readdir(join(away, '104'))).toHaveLength(2);
});

test('what the Offload folder has counts as here, and a cut-off copy is made whole', async () => {
  await Promise.all([1, 2].map(async (n) => await open('105', n)));
  const away = join(dir, 'ssd');
  await mkdir(join(away, '105'), { recursive: true });
  // One cut off on its way in, and one only there.
  await Bun.write(join(away, '105', '105-f1.jpg'), 'x');
  await Bun.write(join(away, '105', '105-f3.jpg'), 'y'.repeat(IMAGE_BYTES));
  await storage.volumes.setFolder(away);
  expect((await storage.volumes.of('105')).onDisk).toMatchObject({
    cached: 3
  });
  expect(await storage.images.isCached({ volumeId: '105', image: 3 })).toBe(
    true
  );
  expect(await kept(away, '105', 3)).toEqual([
    '105-f1.jpg',
    '105-f2.jpg',
    '105-f3.jpg'
  ]);
  for (let tries = 0; tries < 500; tries++) {
    if (Bun.file(join(away, '105', '105-f1.jpg')).size === IMAGE_BYTES) break;
    // eslint-disable-next-line no-await-in-loop -- polling, one look at a time
    await Bun.sleep(2);
  }
  expect(Bun.file(join(away, '105', '105-f1.jpg')).size).toBe(IMAGE_BYTES);
});

test("a Volume's next steps wait for the Offload folder while it's away", async () => {
  const away = await attachFolder();
  await Promise.all([1, 2].map(async (n) => await open('103', n)));
  expect((await storage.volumes.of('103')).next).toEqual({
    download: 'start',
    trash: 'offload'
  });
  await offload('103', [1]);
  expect((await storage.volumes.of('103')).next).toEqual({
    download: 'bringBack',
    trash: 'removeForGood'
  });
  await copiesSettled(away, '103');
  await rename(away, `${away}-off`);
  expect((await storage.volumes.of('103')).next).toEqual({
    download: null,
    trash: null
  });
});
