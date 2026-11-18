import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Refusal } from '../operations';
import { openDownloads } from './astia/downloads';
import { memoryAstia } from './astia/memory-astia';
import { memoryParishes } from './astia/parishes';
import { openScanCache } from './astia/scan-cache';
import { sharedOperations } from './shared-operations';

const ASTIA = memoryAstia({
  10: { title: 'Puumalan seurakunnan arkisto', volumes: [] },
  11: { title: 'Puumalan kunnan arkisto', volumes: [] }
});

// A data folder for the Scan cache, which these don't fill.
const root = mkdtempSync(join(tmpdir(), 'shared-operations-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

// The operations over the parishes.
function parishOperations(parishes: ReturnType<typeof memoryParishes>) {
  const cache = openScanCache({ astia: ASTIA, root });
  const downloads = openDownloads({ astia: ASTIA, cache });
  return sharedOperations({ astia: ASTIA, parishes, cache, downloads });
}

const SIGNAL = new AbortController().signal;

test("a parish's archive is found, and a spelling linked into it", async () => {
  const parishes = memoryParishes([]);
  const ops = parishOperations(parishes);
  expect(await ops.findParishArchives({ name: 'Puumala' }, SIGNAL)).toEqual([
    { archiveId: '10', title: 'Puumalan seurakunnan arkisto' }
  ]);
  await ops.linkSpelling({ spelling: 'Puumala', archiveId: '10' }, SIGNAL);
  expect(parishes.archiveOf('Puumala')).toBe('10');
  expect(await ops.parishes({}, SIGNAL)).toEqual([
    { archiveId: '10', title: 'Puumalan seurakunnan arkisto' }
  ]);
});

test("only a parish's archive can be chosen", async () => {
  const parishes = memoryParishes([]);
  const ops = parishOperations(parishes);
  const refused = await Promise.resolve(
    ops.addParish({ archiveId: '11' }, SIGNAL)
  ).catch((err: unknown) => err);
  expect(refused).toBeInstanceOf(Refusal);
  expect(refused).toMatchObject({
    status: 400,
    message: "Puumalan kunnan arkisto isn't a parish's archive."
  });
  expect(parishes.all()).toEqual([]);

  await ops.addParish({ archiveId: '10' }, SIGNAL);
  expect(parishes.all()).toEqual([{ archiveId: '10', spellings: [] }]);
});
