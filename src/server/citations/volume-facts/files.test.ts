import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openVolumeFacts } from '.';
import { listedAstia, ref } from '../myheritage/test-pins';
import { withLock } from './files';

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

function open() {
  return openVolumeFacts(dir, { astia: ASTIA });
}

function localFile() {
  return join(dir, 'pins.local.json');
}

// A Page pin for page `page` on the Image of Volume v.
async function savePage(
  facts: ReturnType<typeof open>,
  page: number,
  image: number,
  by: 'hand' | 'vision' = 'vision'
) {
  const filming = await facts.filmingOf('v');
  await facts.savePagePin(
    filming,
    { page, kind: ref(null, page).kind },
    { volume: 'V', image, by }
  );
}

// ---------------------------------------------------------------- writing

test('two openings saving at once both keep their saves', async () => {
  const app = open();
  const pass = open();
  const saves = Array.from({ length: 10 }, (_, i) => [
    savePage(app, 100 + i, i + 1, 'hand'),
    savePage(pass, 200 + i, i + 21)
  ]).flat();
  await Promise.all(saves);

  const volumes = await open().volumes();
  expect(volumes.v!.pages).toHaveLength(20);
  expect(await readdir(dir)).toEqual(['pins.local.json']);
});

test('a reader never sees half a file', async () => {
  const pins = open();
  const state = { saving: true };
  const saves = Promise.all(
    Array.from({ length: 10 }, async (_, i) => {
      await savePage(pins, 100 + i, i + 1);
    })
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
  await savePage(pins, 21, 11);
  expect((await pins.volumes()).v!.pages).toHaveLength(1);
  expect(await readdir(dir)).toEqual(['pins.local.json']);
});

test('gives up waiting on a lock another save holds', async () => {
  const lock = join(dir, 'pins.lock');
  await Bun.write(lock, JSON.stringify({ pid: 1, at: Date.now() }));
  let ran = false;
  const since = Date.now();
  const failed = await withLock(
    lock,
    async () => {
      ran = true;
      await Promise.resolve();
    },
    { waitMs: 100 }
  )
    .then(() => null)
    .catch((err: unknown) => err);
  expect(Date.now() - since).toBeGreaterThanOrEqual(100);
  expect(String(failed)).toContain('locked');
  expect(ran).toBe(false);
});
