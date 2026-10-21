import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { DatasetRegistry } from './dataset-registry';
import { seedDemo } from './demo';

const DEMO = resolve(import.meta.dir, '../../resources/demo/bourbon.gdz');

let tmp = '';
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'demo-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('a new data folder gets the demo, built from its GEDZIP', async () => {
  const registry = new DatasetRegistry(join(tmp, 'data'));
  await seedDemo(registry, DEMO);
  expect(await registry.list()).toMatchObject([
    {
      slug: 'bourbon',
      displayName: 'Bourbon',
      personCount: 303,
      familyCount: 139
    }
  ]);
  expect(await readdir(registry.mediaDir('bourbon'))).toHaveLength(47);
});

test('a data folder that exists is left alone, even empty', async () => {
  const registry = new DatasetRegistry(join(tmp, 'data'));
  await mkdir(registry.root);
  await seedDemo(registry, DEMO);
  expect(await readdir(registry.root)).toEqual([]);
});

test('a demo that fails to import leaves an empty data folder', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => undefined);
  const registry = new DatasetRegistry(join(tmp, 'data'));
  await seedDemo(registry, join(tmp, 'missing.gdz'));
  expect(await readdir(registry.root)).toEqual([]);
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});
