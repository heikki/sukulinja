import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { DatasetRegistry } from './dataset-registry';
import { createApi, createStaticFetch } from './server';

let root = '';
let fetch = createStaticFetch({
  api: createApi(new DatasetRegistry('/')),
  staticRoots: []
});

async function get(path: string) {
  return await fetch(new Request(`http://localhost${path}`));
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'static-fetch-'));
  await writeFile(join(root, 'index.js'), 'export {};');
  fetch = createStaticFetch({
    api: createApi(new DatasetRegistry(join(root, 'data'))),
    staticRoots: [root]
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('createStaticFetch', () => {
  test('serves an asset the dataset page links relatively', async () => {
    const res = await get('/d/index.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('export {};');
  });

  test('answers 404 for a file that is not there', async () => {
    const res = await get('/d/missing.js');
    expect(res.status).toBe(404);
  });
});
