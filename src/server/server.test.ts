import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { readNdjson } from '@client/ndjson';

import { memoryAstia } from './citation-scans/memory-astia';
import type { MemoryAstia } from './citation-scans/memory-astia';
import { juvaAstia, rippiCitation } from './citation-scans/test-parish';
import { DatasetRegistry } from './dataset-registry';
import { importGedcom } from './gedcom-import';
import { parseGedcom } from './gedcom-parser';
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
    const switched = await fetch(
      new Request('http://localhost/astia/volumes/201/rescan', {
        method: 'POST'
      })
    );
    expect(((await switched.json()) as string[])[0]).toContain('201-2-f1');
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
    const images = join(root, 'data', '.astia-images');
    await mkdir(images, { recursive: true });
    await writeFile(join(images, 'a.jpg'), new Uint8Array(1000));
    expect(await send('GET')).toEqual({
      status: 200,
      body: {
        cap: 2 * GB,
        used: 1000,
        caps: [2 * GB, 5 * GB, 10 * GB, 20 * GB]
      }
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
      api: createApi(new DatasetRegistry(join(root, 'data')), { astia }),
      staticRoots: [root]
    });
    expect((await send('GET')).body).toMatchObject({ cap: 5 * GB });
    expect((await send('DELETE')).body).toMatchObject({ used: 0 });
  });
});

describe("A dataset's Citations", () => {
  async function seedDataset() {
    const data = join(root, 'data');
    const staging = await new DatasetRegistry(data).createStaging('juva');
    const insert = staging.db.prepare(
      `INSERT INTO citations (scope_type, scope_id, page, text, sort_order)
       VALUES ('person', 1, ?, ?, ?)`
    );
    const rippi = rippiCitation(5001, '1790 - 1796', 12);
    insert.run(rippi.page, rippi.text, 0);
    insert.run(null, 'Family bible', 1);
    await staging.commit();
  }

  async function mark(citationId: number, body: unknown) {
    const res = await fetch(
      new Request(`http://localhost/d/juva/api/citations/${citationId}/scans`, {
        method: 'POST',
        body: JSON.stringify(body)
      })
    );
    return res.status;
  }

  test('streams scan lines, saves Marks, and lists a Volume', async () => {
    await seedDataset();
    const scans = await get('/d/juva/api/persons/1/scans');
    expect(scans.headers.get('content-type')).toBe('application/x-ndjson');
    const lines = (await scans.text())
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { citationId: number });
    expect(lines.map((l) => l.citationId)).toEqual([1]);

    expect(await mark(1, { volumeId: 'juva-1', image: 7 })).toBe(200);
    expect(await mark(1, { volumeId: 'juva-1', image: 99 })).toBe(400);
    expect(await mark(1, { image: 7 })).toBe(400);
    expect(await mark(1, { volumeId: 'juva-1', image: '7' })).toBe(400);
    const box = { left: 100, top: 500, width: 500, height: 50 };
    expect(await mark(1, { volumeId: 'juva-1', image: 7, box })).toBe(200);
    expect(await mark(1, { volumeId: 'juva-1', image: 7, box: null })).toBe(
      200
    );
    expect(
      await mark(1, { volumeId: 'juva-1', image: 7, box: { left: 1 } })
    ).toBe(400);
    expect(await mark(1, { volumeId: 'juva-1', box })).toBe(400);
    expect(await mark(2, { volumeId: 'juva-1', image: 7 })).toBe(404);
    expect(await mark(1, { volumeId: 'juva-1' })).toBe(200);

    const choices = await get('/d/juva/api/citations/1/volumes');
    expect(await choices.json()).toMatchObject({
      fits: [{ id: 'juva-1' }],
      others: [{ id: 'juva-2' }]
    });
    expect((await get('/d/juva/api/citations/2/volumes')).status).toBe(404);

    const volume = await get('/d/juva/api/volumes/juva-1/citations');
    expect(((await volume.json()) as unknown[]).length).toBe(1);
    expect((await get('/d/juva/api/volumes/elsewhere/citations')).status).toBe(
      404
    );
  });

  test('says when Astia fails', async () => {
    await seedDataset();
    serveWith(memoryAstia({}, { down: true }));
    const scans = await get('/d/juva/api/persons/1/scans');
    expect(JSON.parse(await scans.text())).toEqual({
      citationId: 1,
      unlinked: 'astia-error'
    });
    expect(await mark(1, { volumeId: 'juva-1', image: 7 })).toBe(502);
    expect((await get('/d/juva/api/volumes/juva-1/citations')).status).toBe(
      502
    );
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
    const res = await get('/d/tree/api/persons');
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

describe('Exporting a dataset', () => {
  test('saves its GEDZIP into the export folder, under a free name', async () => {
    const registry = new DatasetRegistry(join(root, 'data'));
    const exportDir = join(root, 'Downloads');
    fetch = createStaticFetch({
      api: createApi(registry, { astia, exportDir }),
      staticRoots: []
    });
    const staging = await registry.createStaging('tree');
    importGedcom(
      staging.db,
      parseGedcom('0 @I1@ INDI\n1 NAME Matti /Esimerkki/'),
      () => null
    );
    await staging.commit();
    async function exportTree(path = 'export') {
      const res = await fetch(
        new Request(`http://localhost/datasets/tree/${path}`, {
          method: 'POST'
        })
      );
      return (await res.json()) as { path: string; left: string[] };
    }
    expect(await exportTree()).toEqual({
      path: join(exportDir, 'tree.gdz'),
      left: []
    });
    expect(await exportTree()).toEqual({
      path: join(exportDir, 'tree-2.gdz'),
      left: []
    });
    expect(
      (await readFile(join(exportDir, 'tree.gdz'))).length
    ).toBeGreaterThan(0);
    expect(await exportTree('export-myheritage')).toEqual({
      path: join(exportDir, 'tree-myheritage.ged'),
      left: []
    });
    const ged = await readFile(join(exportDir, 'tree-myheritage.ged'), 'utf8');
    expect(ged).toContain('2 VERS 5.5.1');
  });

  test("answers 400 for a dataset that isn't there", async () => {
    fetch = createStaticFetch({
      api: createApi(new DatasetRegistry(join(root, 'data')), {
        astia,
        exportDir: join(root, 'Downloads')
      }),
      staticRoots: []
    });
    const res = await fetch(
      new Request('http://localhost/datasets/nope/export', { method: 'POST' })
    );
    expect(res.status).toBe(400);
  });
});

interface ImportEvent {
  type: string;
  id?: string;
}
type Events = AsyncGenerator<ImportEvent, void>;

describe('Importing into a dataset', () => {
  const GEDCOM =
    '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Matti /Esimerkki/\n0 TRLR\n';

  async function upload() {
    const body = new FormData();
    body.append('file', new File([GEDCOM], 'tree.ged'));
    const res = await fetch(
      new Request('http://localhost/import', { method: 'POST', body })
    );
    return readNdjson(res.body!) as Events;
  }

  // The events up to the one of `type`, read on without cancelling the
  // stream, which would cancel the import.
  async function until(events: Events, type: string) {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- one event at a time
      const next = await events.next();
      if (next.done === true) throw new Error(`no ${type}`);
      if (next.value.type === type) return next.value;
      if (next.value.type !== 'log') {
        throw new Error(JSON.stringify(next.value));
      }
    }
  }

  async function answer(id: string, merge: boolean) {
    const res = await fetch(
      new Request(`http://localhost/import/${id}`, {
        method: 'POST',
        body: JSON.stringify({ merge })
      })
    );
    return res.status;
  }

  async function undo() {
    const res = await fetch(
      new Request('http://localhost/datasets/tree/undo-import', {
        method: 'POST'
      })
    );
    return res.status;
  }

  async function undoable() {
    const res = await get('/datasets');
    return ((await res.json()) as Array<{ undoable: boolean }>)[0]!.undoable;
  }

  test('asks before merging, and can be undone', async () => {
    await until(await upload(), 'done');
    expect(await undoable()).toBe(false);

    const cancelling = await upload();
    const asked = await until(cancelling, 'review');
    expect(await answer(asked.id!, false)).toBe(204);
    await until(cancelling, 'cancelled');
    expect(await undoable()).toBe(false);

    const merging = await upload();
    const review = await until(merging, 'review');
    expect(review).toMatchObject({ review: { people: { added: 0, gone: 0 } } });
    expect(await answer(review.id!, true)).toBe(204);
    await until(merging, 'done');
    expect(await undoable()).toBe(true);
    expect(await answer(review.id!, true)).toBe(404);

    expect(await undo()).toBe(204);
    expect(await undoable()).toBe(false);
    expect(await undo()).toBe(404);
  });
});
