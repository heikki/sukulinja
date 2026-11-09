import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AstiaError, NoImageError } from './astia';
import type { Astia } from './astia';
import { openDownloads } from './downloads';
import type { Downloads } from './downloads';
import { memoryAstia } from './memory-astia';
import type { MemoryAstia } from './memory-astia';
import { openScanCache } from './scan-cache';
import type { ScanCache } from './scan-cache';

const IMAGE_BYTES = 1000;

let dir = '';
let listed: MemoryAstia = fresh();
// File ids in the order Astia was asked for them.
let fetched: string[] = [];
// While set, Astia holds every full-size Image until it resolves.
let hold: PromiseWithResolvers<void> | null = null;
// How many more requests for an Image fail as if Astia were down.
let failing = 0;
// How many more requests for an Image get Astia's "no preview" placeholder,
// and whether every thumbnail does.
let placeholders = 0;
let noThumbs = false;
let cache: ScanCache = openScanCache({
  astia: astia(),
  root: dir,
  switches: false
});
let downloads: Downloads = openDownloads({ astia: astia(), cache });

function fresh() {
  return memoryAstia({
    '1': {
      volumes: [
        { id: '201', label: 'Volume 201', images: 4 },
        { id: '202', label: 'Volume 202', images: 3 }
      ]
    }
  });
}

function astia(): Astia {
  return {
    ...listed,
    async imageBytes(volumeId, fileId) {
      if (failing > 0) {
        failing -= 1;
        throw new AstiaError('down');
      }
      if (noThumbs && fileId.includes('-t')) {
        throw new NoImageError(`no image ${fileId}`);
      }
      if (placeholders > 0) {
        placeholders -= 1;
        throw new NoImageError(`no image ${fileId}`);
      }
      await listed.imageBytes(volumeId, fileId);
      fetched.push(fileId);
      if (fileId.includes('-f')) await hold?.promise;
      return new Uint8Array(IMAGE_BYTES).fill(0xff);
    }
  };
}

async function until(done: () => boolean | Promise<boolean>) {
  // eslint-disable-next-line no-await-in-loop -- polling, one look at a time
  while (!(await done())) await Bun.sleep(1);
}

// The Volume's download this run, with what of it is on disk: `done` when
// it has none, as when it finished.
async function statusOf(volumeId: string) {
  const download = downloads.of(volumeId);
  return {
    state: download?.state ?? 'done',
    error: download?.error ?? null,
    ...(await cache.onDisk(volumeId))
  };
}

async function stateOf(volumeId: string) {
  return (await statusOf(volumeId)).state;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'downloads-'));
  listed = fresh();
  fetched = [];
  hold = null;
  failing = 0;
  placeholders = 0;
  noThumbs = false;
  const a = astia();
  cache = openScanCache({ astia: a, root: dir, switches: false });
  downloads = openDownloads(
    { astia: a, cache },
    { gapMs: 0, retryMs: 0, retries: 2 }
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('fetches every Image, full size and thumbnail, into the cache', async () => {
  downloads.start('201');
  await downloads.idle();
  expect(fetched).toEqual([
    '201-f1',
    '201-t1',
    '201-f2',
    '201-t2',
    '201-f3',
    '201-t3',
    '201-f4',
    '201-t4'
  ]);
  expect(downloads.list()).toEqual([]);
  expect(await statusOf('201')).toEqual({
    state: 'done',
    error: null,
    images: 4,
    cached: 4,
    bytes: 8 * IMAGE_BYTES
  });
});

test('fills the ordinary cache, under its cap', async () => {
  await cache.setCap(5 * 1024 ** 3);
  downloads.start('201');
  await downloads.idle();
  expect((await cache.status()).used).toBe(8 * IMAGE_BYTES);
});

test('skips Images already cached', async () => {
  const signal = new AbortController().signal;
  await cache.image({ volumeId: '201', image: 2 }, 'full', signal);
  await cache.image({ volumeId: '201', image: 2 }, 'thumb', signal);
  fetched = [];
  downloads.start('201');
  await downloads.idle();
  expect(fetched).not.toContain('201-f2');
  expect(fetched).not.toContain('201-t2');
});

test('one Volume at a time, the next queued behind it', async () => {
  hold = Promise.withResolvers();
  downloads.start('201');
  downloads.start('202');
  expect(await stateOf('201')).toBe('downloading');
  expect(await stateOf('202')).toBe('queued');
  expect(downloads.list().map((d) => d.volumeId)).toEqual(['201', '202']);
  hold.resolve();
  await downloads.idle();
  expect(await statusOf('202')).toMatchObject({ state: 'done', cached: 3 });
  expect(fetched.indexOf('202-f1')).toBeGreaterThan(fetched.indexOf('201-t4'));
});

test('an Image the Scan viewer asks for goes before the next', async () => {
  hold = Promise.withResolvers();
  downloads.start('201');
  await until(() => fetched.includes('201-f1'));
  const viewed = cache.image(
    { volumeId: '202', image: 3 },
    'full',
    new AbortController().signal
  );
  hold.resolve();
  await viewed;
  await downloads.idle();
  expect(fetched.indexOf('202-f3')).toBeLessThan(fetched.indexOf('201-f2'));
});

test('stopped, keeps what it fetched; started again, fetches only the rest', async () => {
  hold = Promise.withResolvers();
  downloads.start('201');
  await until(() => fetched.includes('201-f1'));
  downloads.stop('201');
  hold.resolve();
  await downloads.idle();
  // The Image on its way when stopped still lands in the cache.
  await until(async () => (await cache.onDisk('201')).cached === 1);
  expect(await statusOf('201')).toMatchObject({
    state: 'stopped',
    error: null
  });
  const before = [...fetched];
  downloads.start('201');
  await downloads.idle();
  const after = fetched.slice(before.length);
  expect(after).not.toContain('201-f1');
  expect(after).toContain('201-f4');
  expect(await stateOf('201')).toBe('done');
});

test('stopped while queued, never starts', async () => {
  hold = Promise.withResolvers();
  downloads.start('201');
  downloads.start('202');
  downloads.stop('202');
  expect(await stateOf('202')).toBe('stopped');
  hold.resolve();
  await downloads.idle();
  expect(fetched.some((id) => id.startsWith('202'))).toBe(false);
});

test('rides out Astia failing a few times', async () => {
  failing = 2;
  downloads.start('202');
  await downloads.idle();
  expect(await stateOf('202')).toBe('done');
});

test('stops when Astia stays down, and says so', async () => {
  failing = Infinity;
  downloads.start('202');
  await downloads.idle();
  expect(await statusOf('202')).toMatchObject({
    state: 'stopped',
    error: 'unreachable',
    cached: 0
  });
  failing = 0;
  downloads.start('202');
  await downloads.idle();
  expect(await statusOf('202')).toMatchObject({ state: 'done', cached: 3 });
});

test('a re-scan found mid-way stops it as re-scanned', async () => {
  listed.rescan('202', 3);
  downloads.start('202');
  await downloads.idle();
  expect(await statusOf('202')).toMatchObject({
    state: 'stopped',
    error: 'rescanned'
  });
});

test("Astia's placeholder for a file it still lists is no re-scan", async () => {
  placeholders = 2;
  downloads.start('202');
  await downloads.idle();
  expect(await stateOf('202')).toBe('done');
  placeholders = Infinity;
  downloads.start('201');
  await downloads.idle();
  expect(await statusOf('201')).toMatchObject({
    state: 'stopped',
    error: 'no-image'
  });
});

test('thumbnails Astia gives no image for stop nothing', async () => {
  noThumbs = true;
  downloads.start('202');
  await downloads.idle();
  expect(await statusOf('202')).toMatchObject({ state: 'done', cached: 3 });
});
