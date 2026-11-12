// The lifecycle adapter against the app's own server, in-process: a
// dataset's whole life, from upload to delete, as the chooser asks for it.

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Change } from '@/common/types';
import { juvaAstia } from '@/server/citations/testing';
import { DatasetRegistry } from '@/server/datasets/registry';
import { createApi, createStaticFetch } from '@/server/server';

import { ApiError } from './';
import { openLifecycleApi } from './lifecycle';
import type { ImportHooks, LifecycleApi } from './lifecycle';

// A made-up person.
const GEDCOM =
  '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Matti /Esimerkki/\n0 TRLR\n';

let root = '';
let api: LifecycleApi = openLifecycleApi();
let serve: ((req: Request) => Promise<Response>) | null = null;

// The app as it starts over the data folder in `root`.
function launch() {
  serve = createStaticFetch({
    api: createApi(new DatasetRegistry(join(root, 'data')), {
      astia: juvaAstia(),
      exportDir: join(root, 'Downloads')
    }),
    staticRoots: []
  });
  api = openLifecycleApi({ fetch: serve, origin: 'http://localhost' });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'lifecycle-api-'));
  launch();
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

// Hooks that keep each step the import takes.
function recording() {
  const steps: string[] = [];
  const hooks: ImportHooks = {
    progress: (message) => {
      steps.push(message);
    }
  };
  return { hooks, steps };
}

async function upload(name = 'Tree', file = 'tree.ged') {
  return await api.importFile(
    { file: new File([GEDCOM], file), name },
    recording().hooks
  );
}

// Makes the dataset look as one an older version built, as the app finds
// it when it starts.
function outdate(slug: string) {
  const db = new Database(join(root, 'data', slug, 'db.sqlite'));
  db.run('PRAGMA user_version = 0');
  db.close();
  launch();
}

test('a dataset from upload to delete', async () => {
  expect(await api.list()).toEqual([]);

  const first = recording();
  const made = await api.importFile(
    { file: new File([GEDCOM], 'tree.ged'), name: 'Tree' },
    first.hooks
  );
  expect(made).toMatchObject({
    slug: 'tree',
    displayName: 'Tree',
    personCount: 1,
    sourceFilename: 'tree.ged'
  });
  expect(first.steps).toContain('Parsing GEDCOM…');

  await api.remove('tree');
  expect(await api.list()).toEqual([]);
  expect(await failure(api.remove('tree'))).toBe('dataset not found');
});

test("an import doesn't replace a dataset, as its tree is edited in the app", async () => {
  await upload();
  const refused =
    "There's a dataset named Tree already. Import this under another name.";
  expect(await failure(upload('Tree', 'again.ged'))).toBe(refused);
  // Nor one an older version built: it's deleted first.
  outdate('tree');
  expect(await failure(upload('Tree', 'again.ged'))).toBe(refused);
  expect((await api.list()).map((d) => d.outdated)).toEqual([true]);
});

// What each of the dataset's Changes did, newest first.
async function changesDone(slug: string) {
  const res = await serve!(
    new Request(`http://localhost/d/${slug}/api/changes`)
  );
  const all = (await res.json()) as Change[];
  return all.map((c) => c.what);
}

test('an import is a Change', async () => {
  await upload();
  expect(await changesDone('tree')).toEqual([
    { kind: 'import', file: 'tree.ged', merged: false, lost: 0 }
  ]);
});

test("an upload it can't read is refused", async () => {
  expect(await failure(upload('Tree', 'tree.txt'))).toBe(
    'expected a .ged, .gedcom or .gdz file'
  );
  expect(await failure(upload('!!!'))).toBe(
    'The name needs a letter or a digit.'
  );
});

test('an export is saved into Downloads, under a free name', async () => {
  await upload();
  const downloads = join(root, 'Downloads');
  expect(await api.exportAs('tree')).toEqual({
    path: join(downloads, 'tree.gdz')
  });
  expect(await api.exportAs('tree')).toEqual({
    path: join(downloads, 'tree-2.gdz')
  });
});

test("an export of a dataset that isn't there, or won't open, says why", async () => {
  expect(await failure(api.exportAs('nope'))).toBe('dataset not found: nope');
  await upload();
  outdate('tree');
  expect(await failure(api.exportAs('tree'))).toBe(
    'This dataset was made by an older version of the app, from before schema 1.'
  );
});
