import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AstiaError } from './astia';
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

async function stateOf(volumeId: string) {
  return (await downloads.of(volumeId))?.state ?? null;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'downloads-'));
  listed = fresh();
  fetched = [];
  hold = null;
  failing = 0;
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

test('fetches every Image, full size and thumbnail, and keeps them', async () => {
  await downloads.start('201');
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
  expect(await downloads.list()).toEqual([
    {
      volumeId: '201',
      state: 'complete',
      error: null,
      images: 4,
      cached: 4,
      bytes: 8 * IMAGE_BYTES
    }
  ]);
  expect(await cache.kept()).toEqual(['201']);
});

test('skips Images already cached', async () => {
  const signal = new AbortController().signal;
  await cache.image({ volumeId: '201', image: 2 }, 'full', signal);
  await cache.image({ volumeId: '201', image: 2 }, 'thumb', signal);
  fetched = [];
  await downloads.start('201');
  await downloads.idle();
  expect(fetched).not.toContain('201-f2');
  expect(fetched).not.toContain('201-t2');
});

test('one Volume at a time, the next queued behind it', async () => {
  hold = Promise.withResolvers();
  await downloads.start('201');
  await downloads.start('202');
  expect(await stateOf('201')).toBe('downloading');
  expect(await stateOf('202')).toBe('queued');
  hold.resolve();
  await downloads.idle();
  expect(await stateOf('202')).toBe('complete');
  expect(fetched.indexOf('202-f1')).toBeGreaterThan(fetched.indexOf('201-t4'));
});

test('an Image the Scan viewer asks for goes before the next', async () => {
  hold = Promise.withResolvers();
  await downloads.start('201');
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

test('stopped, keeps what it fetched; resumed, fetches only the rest', async () => {
  hold = Promise.withResolvers();
  await downloads.start('201');
  await until(() => fetched.includes('201-f1'));
  downloads.stop('201');
  hold.resolve();
  await downloads.idle();
  expect(await downloads.of('201')).toMatchObject({
    state: 'stopped',
    error: null
  });
  expect(await cache.kept()).toEqual(['201']);
  const before = [...fetched];
  await downloads.start('201');
  await downloads.idle();
  const after = fetched.slice(before.length);
  expect(after).not.toContain('201-f1');
  expect(after).toContain('201-f4');
  expect(await stateOf('201')).toBe('complete');
});

test('rides out Astia failing a few times', async () => {
  failing = 2;
  await downloads.start('202');
  await downloads.idle();
  expect(await stateOf('202')).toBe('complete');
});

test('stops when Astia stays down, and says so', async () => {
  failing = Infinity;
  await downloads.start('202');
  await downloads.idle();
  expect(await downloads.of('202')).toMatchObject({
    state: 'stopped',
    error: 'unreachable',
    cached: 0
  });
  failing = 0;
  await downloads.start('202');
  await downloads.idle();
  expect(await downloads.of('202')).toMatchObject({
    state: 'complete',
    error: null
  });
});

test('stops on a re-scan, and resumes onto the new filming', async () => {
  await downloads.start('201');
  await downloads.idle();
  listed.rescan('201', 5);
  // Astia now answers the old ids with its placeholder.
  await cache.refresh('201');
  expect(await downloads.of('201')).toMatchObject({
    state: 'stopped',
    images: 5,
    cached: 0
  });
  await downloads.start('201');
  await downloads.idle();
  expect(await downloads.of('201')).toMatchObject({
    state: 'complete',
    cached: 5
  });
});

test('a re-scan found mid-way stops it as re-scanned', async () => {
  listed.rescan('202', 3);
  await downloads.start('202');
  await downloads.idle();
  expect(await downloads.of('202')).toMatchObject({
    state: 'stopped',
    error: 'rescanned'
  });
});

test('removed, stops and hands its Images back to the cap', async () => {
  await downloads.start('201');
  await downloads.idle();
  await downloads.remove('201');
  expect(await downloads.list()).toEqual([]);
  expect(await downloads.of('201')).toBeNull();
  // Under the default cap they stay, as ordinary cache.
  expect(await readdir(join(dir, '.astia-images', '201'))).toHaveLength(8);
});
