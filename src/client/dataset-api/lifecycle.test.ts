// The lifecycle adapter against the app's own server, in-process: a
// dataset's whole life, from upload to delete, as the chooser asks for it.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { ImportReview } from '@common/types';
import { juvaAstia } from '@server/citation-scans/test-parish';
import { DatasetRegistry } from '@server/dataset-registry';
import { SCHEMA_VERSION } from '@server/db';
import { createApi, createStaticFetch } from '@server/server';

import { ApiError } from '.';
import { openLifecycleApi } from './lifecycle';
import type { ImportHooks, LifecycleApi } from './lifecycle';

// A made-up person.
const GEDCOM =
  '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Matti /Esimerkki/\n0 TRLR\n';

let root = '';
let api: LifecycleApi = openLifecycleApi();

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'lifecycle-api-'));
  const serve = createStaticFetch({
    api: createApi(new DatasetRegistry(join(root, 'data')), {
      astia: juvaAstia(),
      exportDir: join(root, 'Downloads')
    }),
    staticRoots: []
  });
  api = openLifecycleApi({ fetch: serve, origin: 'http://localhost' });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// What the call failed with; it must fail. An ApiError gives its words.
async function failure(call: Promise<unknown>) {
  return await call
    .then(() => 'succeeded')
    .catch((err: unknown) => (err instanceof ApiError ? err.message : err));
}

// Hooks that answer every review with `merge`, keeping what was asked.
function answering(merge: boolean) {
  const reviews: ImportReview[] = [];
  const steps: string[] = [];
  const hooks: ImportHooks = {
    progress: (message) => {
      steps.push(message);
    },
    review: async (review) => {
      reviews.push(review);
      return await Promise.resolve(merge);
    }
  };
  return { hooks, reviews, steps };
}

async function upload(merge = true, name = 'Tree', file = 'tree.ged') {
  return await api.importFile(
    { file: new File([GEDCOM], file), name },
    answering(merge).hooks
  );
}

async function undoable() {
  return (await api.list()).map((d) => d.undoable);
}

test('a dataset from upload to delete', async () => {
  expect(await api.list()).toEqual([]);

  const first = answering(true);
  const made = await api.importFile(
    { file: new File([GEDCOM], 'tree.ged'), name: 'Tree' },
    first.hooks
  );
  expect(made).toMatchObject({
    slug: 'tree',
    displayName: 'Tree',
    personCount: 1,
    sourceFilename: 'tree.ged',
    undoable: false
  });
  // A new dataset isn't reviewed.
  expect(first.reviews).toEqual([]);
  expect(first.steps).toContain('Parsing GEDCOM…');

  const cancelling = answering(false);
  expect(
    await api.importFile(
      { file: new File([GEDCOM], 'tree.ged'), name: 'Tree' },
      cancelling.hooks
    )
  ).toBeNull();
  expect(cancelling.reviews).toMatchObject([{ people: { added: 0, gone: 0 } }]);
  expect(await undoable()).toEqual([false]);

  expect(await upload()).toMatchObject({ slug: 'tree', undoable: true });
  expect(await undoable()).toEqual([true]);

  await api.undoImport('tree');
  expect(await undoable()).toEqual([false]);
  expect(await failure(api.undoImport('tree'))).toBe('no import to undo');

  await api.remove('tree');
  expect(await api.list()).toEqual([]);
  expect(await failure(api.remove('tree'))).toBe('dataset not found');
});

test("an upload it can't read is refused", async () => {
  expect(await failure(upload(true, 'Tree', 'tree.txt'))).toBe(
    'expected a .ged, .gedcom or .gdz file'
  );
  expect(await failure(upload(true, '!!!'))).toBe(
    'The name needs a letter or a digit.'
  );
});

test('an export is saved into Downloads, under a free name', async () => {
  await upload();
  const downloads = join(root, 'Downloads');
  expect(await api.exportAs('tree', 'gdz')).toEqual({
    path: join(downloads, 'tree.gdz'),
    left: []
  });
  expect(await api.exportAs('tree', 'gdz')).toEqual({
    path: join(downloads, 'tree-2.gdz'),
    left: []
  });
  const saved = await api.exportAs('tree', 'myheritage');
  expect(saved.path).toBe(join(downloads, 'tree-myheritage.ged'));
  expect(await readFile(saved.path, 'utf8')).toContain('2 VERS 5.5.1');
});

test("an export of a dataset that isn't there, or won't open, says why", async () => {
  expect(await failure(api.exportAs('nope', 'gdz'))).toBe(
    'dataset not found: nope'
  );
  await upload();
  const db = new Database(join(root, 'data', 'tree', 'db.sqlite'));
  db.run("UPDATE meta SET value = '1' WHERE key = 'schema_version'");
  db.close();
  expect(await failure(api.exportAs('tree', 'gdz'))).toBe(
    `This dataset was made by an older version of the app (schema 1, now ${SCHEMA_VERSION}).`
  );
});
