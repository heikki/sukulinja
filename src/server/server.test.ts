import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { juvaAstia, memoryAstia } from './citations/testing';
import type { MemoryAstia } from './citations/testing';
import { DatasetRegistry } from './datasets/registry';
import { parseGedcom } from './gedcom/parser';
import { importGedcom } from './import/gedcom';
import { createApi, createStaticFetch } from './server';

let root = '';
// Astia as the app sees it; nothing goes out over HTTP.
let astia: MemoryAstia = juvaAstia();
let fetch = createStaticFetch({
  api: createApi(new DatasetRegistry('/'), { astia }),
  staticRoots: []
});

async function get(path: string) {
  return await fetch(new Request(`http://localhost${path}`));
}

// Asks the dataset's operation `name` (common/operations).
async function op(slug: string, name: string, body: unknown = {}) {
  return await fetch(
    new Request(`http://localhost/d/${slug}/api/${name}`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'static-fetch-'));
  await writeFile(join(root, 'index.js'), 'export {};');
  astia = juvaAstia();
  fetch = createStaticFetch({
    api: createApi(new DatasetRegistry(join(root, 'data')), { astia }),
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

// Serves with this Astia instead.
function serveWith(other: MemoryAstia) {
  astia = other;
  fetch = createStaticFetch({
    api: createApi(new DatasetRegistry(join(root, 'data')), { astia }),
    staticRoots: []
  });
}

async function until(done: () => Promise<boolean>) {
  // eslint-disable-next-line no-await-in-loop -- polling, one look at a time
  while (!(await done())) await Bun.sleep(5);
}

// What the request failed with; it must fail.
async function failure(request: Promise<unknown>) {
  return await request
    .then(() => 'succeeded')
    .catch((err: unknown) => String(err));
}

describe('Astia Images', () => {
  const VOLUME_201 = {
    '1': { volumes: [{ id: '201', label: 'I Aa:1', images: 2 }] }
  };

  test('serves an Image, or says why not', async () => {
    serveWith(memoryAstia(VOLUME_201));
    const res = await get('/astia/volumes/201/images/2');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect((await res.bytes()).length).toBe(2);
    expect((await get('/astia/volumes/201/images/3')).status).toBe(404);
    const links = await get('/astia/volumes/201/images');
    expect(((await links.json()) as string[]).length).toBe(2);
  });

  test('names the photograph in its ETag, so a re-scanned one is fetched anew once switched to', async () => {
    const volume = memoryAstia(VOLUME_201);
    serveWith(volume);
    const first = await get('/astia/volumes/201/images/2');
    const etag = first.headers.get('ETag')!;
    expect(etag).toBe('"201-f2"');
    expect(first.headers.get('Cache-Control')).toBe('no-cache');
    const again = await fetch(
      new Request('http://localhost/astia/volumes/201/images/2', {
        headers: { 'If-None-Match': etag }
      })
    );
    expect(again.status).toBe(304);
    volume.rescan('201', 2);
    // The cached list still names the old file, which is on disk.
    expect((await get('/astia/volumes/201/images/2')).headers.get('ETag')).toBe(
      etag
    );
    // Image 1 isn't: Astia no longer has it, and the app waits to be told
    // to switch to the new filming.
    const gone = await get('/astia/volumes/201/images/1');
    expect(gone.status).toBe(410);
    expect(await gone.text()).toBe('Astia no longer has this Image.');
    const asked = (await (await get('/astia/volumes/201/rescan')).json()) as {
      rescan: { cached: number; images: number } | null;
    };
    expect(asked.rescan).toMatchObject({ cached: 2, images: 2 });
    // Switched from a dataset's Scan viewer, which says so in its Changes.
    const staging = await new DatasetRegistry(join(root, 'data')).createStaging(
      'tree'
    );
    await staging.commit();
    const switched = await op('tree', 'switchFilming', {
      volumeId: '201',
      volume: 'I Aa:1'
    });
    expect(((await switched.json()) as string[])[0]).toContain('201-2-f1');
    expect(await (await op('tree', 'changes')).json()).toMatchObject([
      {
        on: null,
        what: {
          kind: 'switch-filming',
          volume: 'I Aa:1',
          from: 2,
          to: 2,
          stale: 0
        }
      }
    ]);
    const renewed = await fetch(
      new Request('http://localhost/astia/volumes/201/images/2', {
        headers: { 'If-None-Match': etag }
      })
    );
    expect(renewed.status).toBe(200);
    expect(renewed.headers.get('ETag')).toBe('"201-2-f2"');
  });

  test('answers 502 when Astia fails, and throws on a bug', async () => {
    serveWith(memoryAstia(VOLUME_201, { down: true }));
    expect((await get('/astia/volumes/201/images/1')).status).toBe(502);
    const urls = await get('/astia/volumes/201/images');
    expect(urls.status).toBe(502);
    expect(await urls.text()).toBe(
      "Astia couldn't be reached or gave no answer."
    );
    // Asking for a Volume the Astia wasn't given is a mistake, not an outage.
    serveWith(memoryAstia(VOLUME_201));
    expect(await failure(get('/astia/volumes/202/images'))).toBe(
      'Error: no volume 202 in this Astia'
    );
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
    const images = join(root, 'data', '.astia-images', '101');
    await mkdir(images, { recursive: true });
    await writeFile(join(images, 'a.jpg'), new Uint8Array(1000));
    expect(await send('GET')).toEqual({
      status: 200,
      body: {
        cap: 5 * GB,
        used: 1000,
        caps: [5 * GB, 10 * GB, 20 * GB, 40 * GB]
      }
    });
    expect((await send('PUT', { cap: 3 * GB })).status).toBe(400);
    expect((await send('PUT', { cap: 10 * GB })).body).toMatchObject({
      cap: 10 * GB,
      used: 1000
    });
    const saved = await readFile(join(root, 'data', 'settings.local.json'));
    expect(JSON.parse(saved.toString())).toEqual({ scanCacheBytes: 10 * GB });
    // As after a restart: the cap is read back from the data folder.
    fetch = createStaticFetch({
      api: createApi(new DatasetRegistry(join(root, 'data')), { astia }),
      staticRoots: [root]
    });
    expect((await send('GET')).body).toMatchObject({ cap: 10 * GB });
    expect((await send('DELETE')).body).toMatchObject({ used: 0 });
  });
});

describe('Church books', () => {
  const JUVA_ARCHIVE = '1212295491';
  const JUVA_BOOKS = {
    [JUVA_ARCHIVE]: {
      volumes: [
        {
          id: '301',
          label: 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
          images: 2
        },
        {
          id: '302',
          label: 'I C:1 Syntyneiden ja kastettujen luettelot',
          images: 3
        }
      ]
    }
  };

  async function send(method: string, path: string) {
    const res = await fetch(new Request(`http://localhost${path}`, { method }));
    return {
      status: res.status,
      body: (await res.json().catch(() => null)) as unknown
    };
  }

  test("lists a parish's Volumes, and downloads one into the cache", async () => {
    serveWith(memoryAstia(JUVA_BOOKS));
    const before = await send('GET', `/astia/archives/${JUVA_ARCHIVE}/volumes`);
    expect(before.body).toEqual([
      {
        id: '301',
        label: 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
        digitized: true,
        onDisk: { images: 2, cached: 0, bytes: 0 },
        download: null
      },
      expect.objectContaining({ id: '302', download: null })
    ]);
    const started = await send('PUT', '/astia/volumes/302/download');
    expect(started.body).toEqual([
      { volumeId: '302', state: 'downloading', error: null }
    ]);
    await until(async () => {
      const { body } = await send('GET', '/astia/downloads');
      return (body as unknown[]).length === 0;
    });
    const after = await send('GET', `/astia/archives/${JUVA_ARCHIVE}/volumes`);
    expect((after.body as unknown[])[1]).toMatchObject({
      onDisk: { images: 3, cached: 3 },
      download: null
    });
    expect((await send('DELETE', '/astia/volumes/302/download')).status).toBe(
      405
    );
  });

  test('downloads are started and stopped, not read one by one', async () => {
    expect((await send('GET', '/astia/volumes/302/download')).status).toBe(405);
  });
});

describe('A dataset replaced while open', () => {
  // Imports a one-person dataset as `tree` the way /import does: staged,
  // then committed over any earlier one.
  async function importAs(registry: DatasetRegistry, given: string) {
    const staging = await registry.createStaging('tree');
    importGedcom(
      staging.db,
      parseGedcom(`0 @I1@ INDI\n1 NAME ${given} /Esimerkki/`),
      () => null
    );
    await staging.commit();
  }

  async function persons() {
    const res = await op('tree', 'persons');
    return res.ok
      ? ((await res.json()) as Array<{ given: string }>).map((p) => p.given)
      : res.status;
  }

  test('answers with the new dataset after an import commits', async () => {
    const registry = new DatasetRegistry(join(root, 'data'));
    fetch = createStaticFetch({
      api: createApi(registry, { astia }),
      staticRoots: []
    });
    await importAs(registry, 'Matti');
    expect(await persons()).toEqual(['Matti']);
    // Committed without /import, so only the registry knows.
    await importAs(registry, 'Liisa');
    expect(await persons()).toEqual(['Liisa']);
  });

  test('is gone once deleted', async () => {
    const registry = new DatasetRegistry(join(root, 'data'));
    fetch = createStaticFetch({
      api: createApi(registry, { astia }),
      staticRoots: []
    });
    await importAs(registry, 'Matti');
    expect(await persons()).toEqual(['Matti']);
    const deleted = await fetch(
      new Request('http://localhost/datasets/tree', { method: 'DELETE' })
    );
    expect(deleted.status).toBe(204);
    expect(await persons()).toBe(404);
  });
});
