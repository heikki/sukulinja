import { mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { DatasetRegistry } from './dataset-registry';
import { seedDemo } from './demo';

const DEMO = resolve(import.meta.dir, '../../resources/demo/bourbon.gdz');

let tmp = '';
let registry = new DatasetRegistry('');
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'demo-'));
  registry = new DatasetRegistry(join(tmp, 'data'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function slugs() {
  return (await registry.list()).map((d) => d.slug);
}

test('a new data folder gets the demo, built from its GEDZIP', async () => {
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

test('the demo is offered once: deleted, it stays gone', async () => {
  await seedDemo(registry, DEMO);
  await registry.delete('bourbon');
  await seedDemo(registry, DEMO);
  expect(await slugs()).toEqual([]);
});

test('a data folder with datasets of its own gets no demo', async () => {
  await seedDemo(registry, DEMO);
  await rename(join(registry.root, 'bourbon'), join(registry.root, 'own'));
  await rm(join(registry.root, '.demo-offered'));
  await seedDemo(registry, DEMO);
  expect(await slugs()).toEqual(['own']);
});

test('a folder with only pins and caches, as a reset leaves it, gets the demo', async () => {
  await mkdir(join(registry.root, '.astia-cache'), { recursive: true });
  await Bun.write(join(registry.root, 'pins.local.json'), '{}');
  await seedDemo(registry, DEMO);
  expect(await slugs()).toEqual(['bourbon']);
});

test('a demo that fails to import is logged, and not tried again', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => undefined);
  await seedDemo(registry, join(tmp, 'missing.gdz'));
  expect(error).toHaveBeenCalled();
  error.mockRestore();
  await seedDemo(registry, DEMO);
  expect(await slugs()).toEqual([]);
});

// Marks the dataset's database as an older version's, optionally changing
// which file it says it came from.
function age(sourceFilename?: string) {
  const db = new Database(join(registry.root, 'bourbon', 'db.sqlite'));
  db.run("UPDATE meta SET value = '1' WHERE key = 'schema_version'");
  if (sourceFilename !== undefined) {
    db.run("UPDATE meta SET value = ? WHERE key = 'source_filename'", [
      sourceFilename
    ]);
  }
  db.close();
}

test('a demo an older version built is imported again', async () => {
  await seedDemo(registry, DEMO);
  age();
  expect(await registry.list()).toMatchObject([{ outdated: true }]);
  await seedDemo(registry, DEMO);
  expect(await registry.list()).toMatchObject([
    { slug: 'bourbon', outdated: false, personCount: 303 }
  ]);
});

test("an outdated dataset of your own under the demo's name is left alone", async () => {
  await seedDemo(registry, DEMO);
  age('my-own.ged');
  await seedDemo(registry, DEMO);
  expect(await registry.list()).toMatchObject([{ outdated: true }]);
});
