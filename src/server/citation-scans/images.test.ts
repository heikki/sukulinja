import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { Astia } from './astia';
import {
  astiaImage,
  clearImageCache,
  imageCacheUsed,
  setImageCacheCap,
  setImageCacheDir,
  shrinkImageCache
} from './images';
import { memoryAstia } from './memory-astia';

const IMAGES = 10;
const IMAGE_BYTES = 1000;

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

function open(
  volumeId: string,
  image: number,
  signal = new AbortController().signal
) {
  return astiaImage(astia, { volumeId, image }, 'full', signal);
}

function thumb(volumeId: string, image: number) {
  return astiaImage(
    astia,
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
  dir = await mkdtemp(join(tmpdir(), 'astia-images-'));
  setImageCacheDir(join(dir, 'images'));
  setImageCacheCap(500 * 1024 * 1024);
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
  setImageCacheCap(2.5 * IMAGE_BYTES);
  await open('106', 1);
  await Bun.sleep(5);
  await open('106', 2);
  await Bun.sleep(5);
  await open('106', 1);
  await Bun.sleep(5);
  await open('106', 3);
  const cached = await readdir(join(dir, 'images'));
  expect(cached.sort()).toEqual(['106-f1.jpg', '106-f3.jpg']);
});

test('shrinks to a lowered cap at once, and clears', async () => {
  expect(await imageCacheUsed()).toBe(0);
  await open('109', 1);
  await Bun.sleep(5);
  await open('109', 2);
  await Bun.sleep(5);
  await open('109', 3);
  expect(await imageCacheUsed()).toBe(3 * IMAGE_BYTES);
  setImageCacheCap(1.5 * IMAGE_BYTES);
  await shrinkImageCache();
  expect(await readdir(join(dir, 'images'))).toEqual(['109-f3.jpg']);
  await clearImageCache();
  expect(await imageCacheUsed()).toBe(0);
});
