import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { NoImageError } from './astia';
import type { Astia } from './astia';
import { memoryAstia } from './memory-astia';
import { openScanCache } from './scan-cache';
import type { ScanCache } from './scan-cache';

const IMAGES = 10;
const IMAGE_BYTES = 1000;
const GB = 1024 ** 3;

let dir = '';
// File ids in the order Astia was asked for them.
let fetched: string[] = [];
// While set, Astia holds every image until it resolves.
let hold: PromiseWithResolvers<void> | null = null;

// Volumes 101–106 and 109, of ten Images each, whose files Astia gives
// IMAGE_BYTES long once let go.
const listed = memoryAstia({
  '1': {
    volumes: ['101', '102', '103', '104', '105', '106', '109'].map((id) => ({
      id,
      label: `Volume ${id}`,
      images: IMAGES
    }))
  }
});
const astia: Astia = {
  ...listed,
  async imageBytes(_volumeId, fileId) {
    fetched.push(fileId);
    await hold?.promise;
    return new Uint8Array(IMAGE_BYTES).fill(0xff);
  }
};

// Opened afresh on each test's folder.
let cache: ScanCache = openScanCache({ astia, root: dir, switches: false });

function open(
  volumeId: string,
  image: number,
  signal = new AbortController().signal
) {
  return cache.image({ volumeId, image }, 'full', signal);
}

function thumb(volumeId: string, image: number) {
  return cache.image(
    { volumeId, image },
    'thumb',
    new AbortController().signal
  );
}

async function until(done: () => boolean) {
  // eslint-disable-next-line no-await-in-loop -- polling, one look at a time
  while (!done()) await Bun.sleep(1);
}

// Settles to 'left' when the request was given up.
async function outcome(request: Promise<string | null>) {
  return await request.catch(() => 'left');
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scan-cache-'));
  cache = openScanCache({ astia, root: dir, switches: false });
  fetched = [];
  hold = null;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('fetches an Image once, then serves it from the cache', async () => {
  const path = await open('101', 3);
  expect(Bun.file(path!).size).toBe(IMAGE_BYTES);
  expect(await open('101', 3)).toBe(path);
  await thumb('101', 3);
  expect(fetched).toEqual(['101-f3', '101-t3']);
});

test('has no Image outside the Volume', async () => {
  expect(await open('102', 0)).toBeNull();
  expect(await open('102', IMAGES + 1)).toBeNull();
  expect(fetched).toEqual([]);
});

test('fetches the latest request first', async () => {
  await open('103', 9);
  hold = Promise.withResolvers();
  const first = open('103', 1);
  await until(() => fetched.length === 2);
  // Each first looks in the cache on disk; let 5 reach the queue before 6.
  const five = open('103', 5);
  await Bun.sleep(50);
  const six = open('103', 6);
  await Bun.sleep(50);
  hold.resolve();
  await Promise.all([first, five, six]);
  expect(fetched).toEqual(['103-f9', '103-f1', '103-f6', '103-f5']);
});

test("a thumbnail doesn't wait behind full Images", async () => {
  await open('104', 9);
  hold = Promise.withResolvers();
  const first = open('104', 1);
  await until(() => fetched.length === 2);
  const second = open('104', 2);
  const small = thumb('104', 2);
  await until(() => fetched.length === 3);
  expect(fetched).toEqual(['104-f9', '104-f1', '104-t2']);
  hold.resolve();
  await Promise.all([first, second, small]);
  expect(fetched).toEqual(['104-f9', '104-f1', '104-t2', '104-f2']);
});

test('drops a queued request whose client has gone', async () => {
  await open('104', 9);
  hold = Promise.withResolvers();
  const first = open('104', 1);
  await until(() => fetched.length === 2);
  const leaving = new AbortController();
  const five = open('104', 5, leaving.signal);
  await Bun.sleep(10);
  leaving.abort();
  expect(await outcome(five)).toBe('left');
  hold.resolve();
  await first;
  await Bun.sleep(10);
  expect(fetched).toEqual(['104-f9', '104-f1']);
});

test('keeps a request another client still waits for', async () => {
  await open('105', 9);
  hold = Promise.withResolvers();
  const first = open('105', 1);
  await until(() => fetched.length === 2);
  const leaving = new AbortController();
  const five = open('105', 5, leaving.signal);
  const staying = open('105', 5);
  await Bun.sleep(10);
  leaving.abort();
  expect(await outcome(five)).toBe('left');
  hold.resolve();
  await Promise.all([first, staying]);
  expect(fetched).toEqual(['105-f9', '105-f1', '105-f5']);
});

test('drops the least recently viewed Images past the cap', async () => {
  await cache.setCap(2.5 * IMAGE_BYTES);
  await open('106', 1);
  await Bun.sleep(5);
  await open('106', 2);
  await Bun.sleep(5);
  await open('106', 1);
  await Bun.sleep(5);
  await open('106', 3);
  const cached = await readdir(join(dir, '.astia-images'));
  expect(cached.sort()).toEqual(['106-f1.jpg', '106-f3.jpg']);
});

// The space the cached Images take.
async function used() {
  return (await cache.status()).used;
}

test('shrinks to a lowered cap at once, and clears', async () => {
  expect(await used()).toBe(0);
  await open('109', 1);
  await Bun.sleep(5);
  await open('109', 2);
  await Bun.sleep(5);
  await open('109', 3);
  expect(await used()).toBe(3 * IMAGE_BYTES);
  await cache.setCap(1.5 * IMAGE_BYTES);
  expect(await readdir(join(dir, '.astia-images'))).toEqual(['109-f3.jpg']);
  await cache.clear();
  expect(await used()).toBe(0);
});

async function writeSettings(root: string, settings: unknown) {
  await mkdir(root, { recursive: true });
  await Bun.write(join(root, 'settings.local.json'), JSON.stringify(settings));
}

test('reads the cap saved for the install before anything else', async () => {
  const root = join(dir, 'saved');
  await writeSettings(root, { scanCacheBytes: 10 * GB });
  expect(
    await openScanCache({ astia, root, switches: false }).status()
  ).toEqual({
    cap: 10 * GB,
    used: 0,
    caps: [2 * GB, 5 * GB, 10 * GB, 20 * GB]
  });
  // A cap no longer offered falls back to the default.
  await writeSettings(root, { scanCacheBytes: 1 * GB });
  expect(
    (await openScanCache({ astia, root, switches: false }).status()).cap
  ).toBe(2 * GB);
});

test("saving a cap keeps the install's other settings", async () => {
  await writeSettings(dir, { theme: 'dark', scanCacheBytes: 5 * GB });
  await cache.setCap(20 * GB);
  expect(await Bun.file(join(dir, 'settings.local.json')).json()).toEqual({
    theme: 'dark',
    scanCacheBytes: 20 * GB
  });
  expect(
    (await openScanCache({ astia, root: dir, switches: false }).status()).cap
  ).toBe(20 * GB);
});

test('Scan caches on two data folders share neither files nor a queue', async () => {
  const other = openScanCache({
    astia,
    root: join(dir, 'other'),
    switches: false
  });
  await open('101', 9);
  hold = Promise.withResolvers();
  const held = open('101', 1);
  await until(() => fetched.length === 2);
  // Not queued behind the held Image: the other cache fetches its own.
  const elsewhere = other.image(
    { volumeId: '101', image: 9 },
    'full',
    new AbortController().signal
  );
  await until(() => fetched.length === 3);
  hold.resolve();
  expect(await elsewhere).toBe(
    join(dir, 'other', '.astia-images', '101-f9.jpg')
  );
  await held;
  expect(fetched).toEqual(['101-f9', '101-f1', '101-f9']);
});

describe('a re-scanned Volume', () => {
  // Volume 301 of ten Images, which Astia films anew with eight, in a
  // Scan cache that switches to the new filming on its own unless told.
  function rescanned(switches = true) {
    const astia = memoryAstia({
      '3': { volumes: [{ id: '301', label: 'Volume 301', images: IMAGES }] }
    });
    return { astia, cache: openScanCache({ astia, root: dir, switches }) };
  }

  function at(image: number) {
    return { volumeId: '301', image };
  }

  const signal = new AbortController().signal;

  test('fetches an Image Astia no longer has by its new id', async () => {
    const { astia, cache: scans } = rescanned();
    astia.rescan('301', 8);
    expect(await scans.image(at(5), 'full', signal)).toBe(
      join(dir, '.astia-images', '301-2-f5.jpg')
    );
    expect(await scans.image(at(6), 'thumb', signal)).toBe(
      join(dir, '.astia-images', '301-2-t6.jpg')
    );
    expect(astia.asked.filter((a) => a.startsWith('refresh'))).toEqual([
      'refresh 301'
    ]);
  });

  test("drops the replaced filming's cached Images", async () => {
    const { astia, cache: scans } = rescanned();
    await scans.image(at(2), 'full', signal);
    await scans.image(at(2), 'thumb', signal);
    await scans.image(at(3), 'full', signal);
    astia.rescan('301', 8);
    await scans.image(at(5), 'full', signal);
    expect((await readdir(join(dir, '.astia-images'))).toSorted()).toEqual([
      '301-2-f5.jpg'
    ]);
  });

  test("one that doesn't switch on its own leaves the filming as it was", async () => {
    const { astia, cache: scans } = rescanned(false);
    await scans.image(at(2), 'full', signal);
    astia.rescan('301', 8);
    const failed = await scans
      .image(at(5), 'full', signal)
      .catch((err: unknown) => err);
    expect(failed).toBeInstanceOf(NoImageError);
    expect(astia.asked.filter((a) => a.startsWith('refresh'))).toEqual([]);
    expect(await scans.image(at(2), 'full', signal)).toBe(
      join(dir, '.astia-images', '301-f2.jpg')
    );
    await scans.refresh('301');
    expect(await readdir(join(dir, '.astia-images'))).toEqual([]);
    expect(await scans.image(at(5), 'full', signal)).toBe(
      join(dir, '.astia-images', '301-2-f5.jpg')
    );
  });

  test("doesn't ask Astia for an Image a peek found gone", async () => {
    const { astia, cache: scans } = rescanned(false);
    await scans.image(at(2), 'full', signal);
    astia.rescan('301', 8);
    await astia.peekImages('301');
    const failed = await scans
      .image(at(5), 'thumb', signal)
      .catch((err: unknown) => err);
    expect(failed).toBeInstanceOf(NoImageError);
    expect(astia.asked).not.toContain('bytes 301-t5');
    // One on disk still shows.
    expect(await scans.image(at(2), 'full', signal)).toBe(
      join(dir, '.astia-images', '301-f2.jpg')
    );
  });

  test('has no Image past the new filming', async () => {
    const { astia, cache: scans } = rescanned();
    astia.rescan('301', 8);
    expect(await scans.image(at(9), 'full', signal)).toBeNull();
    expect(await scans.image(at(9), 'full', signal)).toBeNull();
  });

  test('throws when the list asked for again has the same id', async () => {
    const listed = memoryAstia({
      '3': { volumes: [{ id: '301', label: 'Volume 301', images: IMAGES }] }
    });
    const gone: Astia = {
      ...listed,
      imageBytes: () => Promise.reject(new NoImageError('no image'))
    };
    const scans = openScanCache({ astia: gone, root: dir, switches: true });
    const failed = await scans
      .image(at(2), 'full', signal)
      .catch((err: unknown) => err);
    expect(failed).toBeInstanceOf(NoImageError);
    expect(listed.asked.filter((a) => a.startsWith('refresh'))).toEqual([
      'refresh 301'
    ]);
  });
});
