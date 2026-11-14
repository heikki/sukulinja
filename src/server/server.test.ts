import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { juvaAstia, memoryAstia, rippiCitation } from './citations/testing';
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
    const switched = await fetch(
      new Request('http://localhost/d/tree/api/volumes/201/filming', {
        method: 'POST',
        body: JSON.stringify({ volume: 'I Aa:1' })
      })
    );
    expect(((await switched.json()) as string[])[0]).toContain('201-2-f1');
    expect(await (await get('/d/tree/api/changes')).json()).toMatchObject([
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

describe("A dataset's Citations", () => {
  async function seedDataset() {
    const data = join(root, 'data');
    const staging = await new DatasetRegistry(data).createStaging('juva');
    staging.db.run("INSERT INTO persons (id, xref) VALUES (1, '@I1@')");
    staging.db.run(
      "INSERT INTO names (person_id, full_text, sort_order) VALUES (1, 'Matti /Testinen/', 0)"
    );
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

    // A Mark at the entry converts the reference to a Citation of its Image
    // (ADR-0016): it can't lose its Box, nor go in another Volume.
    expect(await mark(1, { volumeId: 'juva-1', image: 7, box })).toBe(200);
    expect(await mark(1, { volumeId: 'juva-1', image: 7, box: null })).toBe(
      400
    );
    expect((await get('/d/juva/api/citations/1/volumes')).status).toBe(404);

    // The Marks saved are one Change on their Citation, the last one
    // (combine.ts); one refused is none.
    const changes = (await (await get('/d/juva/api/changes')).json()) as Array<{
      what: { kind: string; at: string };
      on: { kind: string; citationId: number } | null;
      who: string | null;
    }>;
    expect(changes.map((c) => c.what.at)).toEqual(['entry']);
    expect(changes[0]).toMatchObject({
      on: { kind: 'citation', citationId: 1 },
      who: 'Matti /Testinen/'
    });

    const volume = await get('/d/juva/api/volumes/juva-1/citations');
    expect(((await volume.json()) as unknown[]).length).toBe(1);
    expect((await get('/d/juva/api/volumes/elsewhere/citations')).status).toBe(
      404
    );
  });

  test("lists the archives the dataset's church books are in", async () => {
    await seedDataset();
    const archives = await get('/d/juva/api/archives');
    // Astia gives no title here, so each goes by its id.
    expect(await archives.json()).toEqual([
      { archiveId: '1212295491', title: '1212295491' }
    ]);
    // Nor names the archive a Volume is in.
    const volume = await get('/d/juva/api/volumes/juva-1');
    expect(await volume.json()).toMatchObject({ archive: null });
  });

  test("counts the Citations in each of a parish's Volumes", async () => {
    await seedDataset();
    const juva = await get('/d/juva/api/archives/1212295491/citations');
    expect(await juva.json()).toEqual({ 'juva-1': 1 });
    const elsewhere = await get('/d/juva/api/archives/1200716382/citations');
    expect(await elsewhere.json()).toEqual({});
  });

  async function send(method: string, path: string, body?: unknown) {
    return await fetch(
      new Request(`http://localhost/d/juva${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    );
  }

  // An entry on Image 13, and people 2 and 3 beside the seeded dataset's.
  const at = {
    volumeId: 'juva-1',
    image: 13,
    fileId: 'juva-1-f13',
    box: { left: 100, top: 500, width: 500, height: 50 }
  };
  async function seedPeople() {
    await seedDataset();
    const db = new DatasetRegistry(join(root, 'data')).open('juva');
    db.run("INSERT INTO persons (id, xref) VALUES (2, '@I2@'), (3, '@I3@')");
    db.close();
  }

  test('makes an Entry with its people, edits it as a whole, and deletes it', async () => {
    await seedPeople();
    const made = await send('POST', '/api/entries', {
      ...at,
      text: 'Rippikirja',
      people: [{ personId: 2 }]
    });
    expect(made.status).toBe(201);
    const [first] = (await made.json()) as Array<{
      citation: { entryId: number };
    }>;
    const entryId = first!.citation.entryId;
    expect(
      (await send('POST', '/api/entries', { ...at, people: [{}] })).status
    ).toBe(400);
    expect((await send('GET', '/api/entries')).status).toBe(405);

    const moved = { ...at, image: 14, fileId: 'juva-1-f14' };
    const edited = await send('PUT', `/api/entries/${entryId}`, {
      at: moved,
      text: ' Rippikirja,\n\n sivu  12 ',
      people: [{ personId: 2 }, { personId: 3 }]
    });
    expect(edited.status).toBe(200);
    const now = {
      citation: { text: 'Rippikirja,\nsivu 12' },
      link: { image: 14 }
    };
    expect(await edited.json()).toMatchObject([
      { personId: 2, ...now },
      { personId: 3, ...now }
    ]);
    // Refused whole: someone named twice.
    expect(
      (
        await send('PUT', `/api/entries/${entryId}`, {
          text: 'x',
          people: [{ personId: 3 }, { personId: 3 }]
        })
      ).status
    ).toBe(400);
    const unread = [{ text: 1 }, { at: { image: 2 } }].map(
      async (body) =>
        (await send('PUT', `/api/entries/${entryId}`, body)).status
    );
    expect(await Promise.all(unread)).toEqual([400, 400]);
    const missing = await send('PUT', '/api/entries/99', { text: 'x' });
    expect(missing.status).toBe(404);
    const deleted = await send('DELETE', `/api/entries/${entryId}`);
    expect(await deleted.json()).toEqual({ removed: 2 });
    expect((await send('DELETE', `/api/entries/${entryId}`)).status).toBe(404);
  });

  test('makes a Citation on an Image, and deletes it', async () => {
    await seedPeople();
    const entry = { ...at, text: 'Baptism' };
    function naming(personId: number, at = entry) {
      return { ...at, people: [{ personId }] };
    }

    const made = await send('POST', '/api/entries', naming(2));
    expect(made.status).toBe(201);
    expect(await made.json()).toMatchObject([
      {
        personId: 2,
        citation: { id: 3, text: 'Baptism', madeInApp: true },
        link: { image: 13, precision: 'entry', certainty: 'marked' }
      }
    ]);
    // Person 1's reference is Estimated on Image 12.
    const linked = { ...entry, image: 12, fileId: 'juva-1-f12' };
    expect((await send('POST', '/api/entries', naming(1, linked))).status).toBe(
      400
    );
    expect((await send('POST', '/api/entries', naming(9))).status).toBe(404);
    const { box: _, ...unboxed } = naming(1);
    expect((await send('POST', '/api/entries', unboxed)).status).toBe(400);
    expect((await send('POST', '/api/persons/1/citations', entry)).status).toBe(
      404
    );

    const volume = await get('/d/juva/api/volumes/juva-1/citations');
    expect(((await volume.json()) as unknown[]).length).toBe(2);

    expect((await send('DELETE', '/api/citations/3')).status).toBe(204);
    expect((await send('DELETE', '/api/citations/3')).status).toBe(404);

    // Made, then deleted: the deleted one's Change falls back on its person.
    const changes = (await (await get('/d/juva/api/changes')).json()) as Array<{
      what: { kind: string; cited?: string };
      on: { kind: string; personId: number } | null;
    }>;
    expect(changes[0]!.what.cited).toEndWith(', Image\u00a013');
    expect(changes).toMatchObject([
      {
        what: { kind: 'uncite' },
        on: { kind: 'person', personId: 2 }
      },
      {
        what: { kind: 'cite', image: 13 },
        on: { kind: 'person', personId: 2 }
      }
    ]);
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
