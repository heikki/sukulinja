import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    const volumeId =
      url.searchParams.get('aineistoId') ?? url.searchParams.get('id');
    if (volumeId === '202') {
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
      const links = await get('/astia/volumes/201/images');
      expect(((await links.json()) as string[]).length).toBe(2);
      expect((await get('/astia/volumes/202/images')).status).toBe(502);
    } finally {
      astia.mockRestore();
    }
  });
});

describe('Scan cache setting', () => {
  const GB = 1024 ** 3;

  async function send(method: string, body?: unknown) {
    const res = await fetch(
      new Request('http://localhost/settings/scan-cache', {
        method,
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    );
    return {
      status: res.status,
      body: (await res.json().catch(() => null)) as unknown
    };
  }

  test('changes the cap, keeps it for the install, and clears', async () => {
    const images = join(root, 'data', '.astia-images');
    await mkdir(images, { recursive: true });
    await writeFile(join(images, 'a.jpg'), new Uint8Array(1000));
    expect(await send('GET')).toEqual({
      status: 200,
      body: { cap: 2 * GB, used: 1000, caps: [GB, 2 * GB, 5 * GB, 10 * GB] }
    });
    expect((await send('PUT', { cap: 3 * GB })).status).toBe(400);
    expect((await send('PUT', { cap: 5 * GB })).body).toMatchObject({
      cap: 5 * GB,
      used: 1000
    });
    const saved = await readFile(join(root, 'data', 'settings.local.json'));
    expect(JSON.parse(saved.toString())).toEqual({ scanCacheBytes: 5 * GB });
    // As after a restart: the cap is read back from the data folder.
    fetch = createStaticFetch({
      api: createApi(new DatasetRegistry(join(root, 'data'))),
      staticRoots: [root]
    });
    expect((await send('GET')).body).toMatchObject({ cap: 5 * GB });
    expect((await send('DELETE')).body).toMatchObject({ used: 0 });
    await send('PUT', { cap: 2 * GB });
  });
});
