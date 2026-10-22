import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Rescan, StalePin } from '@/common/types';

import { fileId, memoryAstia } from './memory-astia';
import type { MemoryAstia } from './memory-astia';
import { openVolumeFacts } from './pins';
import { checkRescans, routeRescan } from './rescans';
import { openScanCache } from './scan-cache';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rescans-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Volumes v1 and v2 of ten Images; tests re-scan v1 with eight.
function astia() {
  return memoryAstia({
    '1': {
      volumes: [
        { id: 'v1', label: 'I Ab:1', images: 10 },
        { id: 'v2', label: 'I Ab:2', images: 10 }
      ]
    }
  });
}

function on(volumeId: string, image: number) {
  return { image, fileId: fileId(volumeId, image, 'full') };
}

const SHIPPED = {
  v1: { title: 'I Ab:1', pages: [{ ...on('v1', 2), pages: [3, 4] }] },
  v2: { title: 'I Ab:2', pages: [{ ...on('v2', 5), pages: [9, 10] }] }
};

const LOCAL = {
  volumes: {
    v1: {
      pages: [],
      records: [
        { record: 7, by: 'vision' as const, ...on('v1', 6) },
        // Saved before pins kept file ids.
        { record: 8, image: 7 }
      ]
    }
  },
  references: {
    'ref-a': {
      volumeId: 'v1',
      volume: 'I Ab:1',
      by: 'hand' as const,
      ...on('v1', 4)
    },
    'ref-b': { volumeId: 'v2', volume: 'I Ab:2', ...on('v2', 1) },
    'ref-c': { volumeId: 'v1', volume: 'I Ab:1' }
  },
  rejected: { 'ref-d': [{ volumeId: 'v1', ...on('v1', 9) }] }
};

// What v1's re-scan leaves out of SHIPPED and LOCAL.
const STALE: StalePin[] = [
  { kind: 'page', from: 'shipped', by: 'hand', image: 2, pages: [3, 4] },
  {
    kind: 'record',
    from: 'local',
    by: 'vision',
    image: 6,
    record: 7,
    markKey: 'record 7'
  },
  {
    kind: 'reference',
    from: 'local',
    by: 'hand',
    image: 4,
    url: 'ref-a',
    markKey: 'url ref-a'
  },
  { kind: 'rejection', from: 'local', by: 'hand', image: 9, url: 'ref-d' }
];

test('names the re-scanned Volume and its stale pins, and nothing else', async () => {
  const listed = astia();
  listed.rescan('v1', 8);
  const result = await checkRescans(
    { shipped: SHIPPED, local: [LOCAL] },
    async (id) => await listed.peekImages(id),
    async (id) => await listed.volumeImages(id)
  );
  expect(result).toEqual({
    volumes: 2,
    unchecked: 1,
    rescanned: [
      { volumeId: 'v1', title: 'I Ab:1', cached: 10, images: 8, stale: STALE }
    ]
  });
});

test('finds nothing when no pinned Volume was re-scanned', async () => {
  const listed = astia();
  const result = await checkRescans(
    { shipped: SHIPPED, local: [] },
    async (id) => await listed.peekImages(id),
    async (id) => await listed.volumeImages(id)
  );
  expect(result).toEqual({ volumes: 2, unchecked: 0, rescanned: [] });
});

// ---------------------------------------------------------------- the app

async function app(listed: MemoryAstia) {
  await Bun.write(join(dir, 'pins.local.json'), JSON.stringify(LOCAL));
  const facts = openVolumeFacts(dir, { astia: listed, base: SHIPPED });
  const shared = {
    astia: listed,
    cache: openScanCache({ astia: listed, root: dir, switches: false }),
    kept: async () => {
      const { shipped, local } = await facts.kept();
      return { shipped, local: [local] };
    }
  };
  async function ask(method: string, volumeId: string) {
    const req = new Request(`http://localhost/astia/volumes/${volumeId}`, {
      method
    });
    return await routeRescan(shared, req, volumeId);
  }
  return { ...shared, ask };
}

test("says there's no re-scan of a Volume Astia lists as cached", async () => {
  const listed = astia();
  const { ask } = await app(listed);
  expect(await (await ask('GET', 'v1')).json()).toEqual({ rescan: null });
});

test('tells of a re-scan, and what switching leaves out, without switching', async () => {
  const listed = astia();
  const { ask, cache } = await app(listed);
  await cache.image(
    { volumeId: 'v1', image: 2 },
    'full',
    new AbortController().signal
  );
  listed.rescan('v1', 8);
  const { rescan } = (await (await ask('GET', 'v1')).json()) as {
    rescan: Rescan;
  };
  // The app gave the pin saved before file ids the id of its Image in the
  // cached list, so it's known to be of the filming replaced.
  const filled: StalePin = {
    kind: 'record',
    from: 'local',
    by: 'hand',
    image: 7,
    record: 8,
    markKey: 'record 8'
  };
  expect(rescan).toEqual({
    cached: 10,
    images: 8,
    stale: [...STALE.slice(0, 2), filled, ...STALE.slice(2)]
  });
  expect(await listed.volumeImages('v1')).toHaveLength(10);
  expect(await readdir(join(dir, '.astia-images'))).toEqual(['v1-f2.jpg']);
});

test('switches to the new filming when asked', async () => {
  const listed = astia();
  const { ask, cache } = await app(listed);
  await cache.image(
    { volumeId: 'v1', image: 2 },
    'full',
    new AbortController().signal
  );
  listed.rescan('v1', 8);
  const urls = (await (await ask('POST', 'v1')).json()) as string[];
  expect(urls).toHaveLength(8);
  expect(urls[0]).toContain('fileId=v1-2-f1');
  expect(await listed.volumeImages('v1')).toHaveLength(8);
  expect(await readdir(join(dir, '.astia-images'))).toEqual([]);
  expect(await (await ask('GET', 'v1')).json()).toEqual({ rescan: null });
});
