import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';

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

describe('Astia Images', () => {
  // Volume 201 has two Images; Volume 202's are unreachable.
  function file(id: string) {
    return { name: 'FILE', children: [{ name: 'URL', tagData: id }] };
  }

  function fakeAstia(input: string | URL | Request) {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.searchParams.get('aineistoId') === '202') {
      return Promise.resolve(new Response('', { status: 404 }));
    }
    if (url.pathname.endsWith('/digitoidut.php')) {
      return Promise.resolve(
        Response.json({ isot: [file('a'), file('b')], pienet: [] })
      );
    }
    return Promise.resolve(new Response(new Uint8Array([0xff, 0xd8])));
  }

  test('serves an Image, or says why not', async () => {
    const astia = spyOn(globalThis, 'fetch').mockImplementation(
      fakeAstia as typeof globalThis.fetch
    );
    try {
      const res = await get('/astia/volumes/201/images/2');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/jpeg');
      expect((await res.bytes()).length).toBe(2);
      expect((await get('/astia/volumes/201/images/3')).status).toBe(404);
      expect((await get('/astia/volumes/202/images/1')).status).toBe(502);
    } finally {
      astia.mockRestore();
    }
  });
});
