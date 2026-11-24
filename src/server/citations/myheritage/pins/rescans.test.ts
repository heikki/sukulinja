import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Rescan, StalePin } from '@/common/types';

import { fileId, memoryAstia } from '../../astia/memory-astia';
import type { MemoryAstia } from '../../astia/memory-astia';
import { openStorage } from '../../storage';
import { openVolumeFacts } from '../../volume-facts';
import { routeRescan, switchFilming } from './rescans';

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

const LOCAL = {
  volumes: {
    v1: {
      title: 'I Ab:1',
      pages: [{ ...on('v1', 2), pages: [3, 4] }],
      records: [
        { record: 7, by: 'vision' as const, ...on('v1', 6) },
        // Saved before pins kept file ids.
        { record: 8, image: 7 }
      ]
    },
    v2: { title: 'I Ab:2', pages: [{ ...on('v2', 5), pages: [9, 10] }] }
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
  }
};

// What v1's re-scan leaves out of LOCAL.
const STALE: StalePin[] = [
  { kind: 'page', by: 'hand', image: 2, pages: [3, 4] },
  {
    kind: 'record',
    by: 'vision',
    image: 6,
    record: 7,
    markKey: 'record 7'
  },
  {
    kind: 'reference',
    by: 'hand',
    image: 4,
    url: 'ref-a',
    markKey: 'url ref-a'
  }
];

// ---------------------------------------------------------------- the app

async function app(listed: MemoryAstia) {
  await Bun.write(join(dir, 'pins.local.json'), JSON.stringify(LOCAL));
  const facts = openVolumeFacts(dir, { astia: listed });
  const shared = {
    astia: listed,
    images: openStorage({
      astia: listed,
      root: dir,
      citedImages: async () => await Promise.resolve([])
    }).images,
    kept: async () => [await facts.kept()]
  };
  async function ask(method: string, volumeId: string) {
    const req = new Request(`http://localhost/astia/volumes/${volumeId}`, {
      method
    });
    return await routeRescan(shared, req, volumeId);
  }
  return {
    ...shared,
    ask,
    switchTo: async (volumeId: string) => await switchFilming(shared, volumeId)
  };
}

test("says there's no re-scan of a Volume Astia lists as cached", async () => {
  const listed = astia();
  const { ask } = await app(listed);
  expect(await (await ask('GET', 'v1')).json()).toEqual({ rescan: null });
});

test('tells of a re-scan, and what switching leaves out, without switching', async () => {
  const listed = astia();
  const { ask, images } = await app(listed);
  await images.image(
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
  expect(await readdir(join(dir, '.astia-images', 'v1'))).toEqual([
    'v1-f2.jpg'
  ]);
});

test('switches to the new filming when asked, saying what it switched from', async () => {
  const listed = astia();
  const { ask, images, switchTo } = await app(listed);
  await images.image(
    { volumeId: 'v1', image: 2 },
    'full',
    new AbortController().signal
  );
  listed.rescan('v1', 8);
  const { urls, rescan } = await switchTo('v1');
  expect(rescan).toMatchObject({ cached: 10, images: 8 });
  expect(urls).toHaveLength(8);
  expect(urls[0]).toContain('fileId=v1-2-f1');
  expect(await listed.volumeImages('v1')).toHaveLength(8);
  expect(await readdir(join(dir, '.astia-images', 'v1'))).toEqual([]);
  expect(await (await ask('GET', 'v1')).json()).toEqual({ rescan: null });
  expect((await switchTo('v1')).rescan).toBeNull();
  expect((await ask('POST', 'v1')).status).toBe(405);
});
