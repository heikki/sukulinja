// The fetch adapter against the app's own server, in-process: the routes
// and answers the client expects are the ones the server gives.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { memoryAstia } from '@server/citation-scans/memory-astia';
import type { MemoryAstia } from '@server/citation-scans/memory-astia';
import {
  IMAGES,
  JUVA,
  rippiCitation,
  VOLUMES
} from '@server/citation-scans/test-parish';
import { DatasetRegistry } from '@server/dataset-registry';
import { importGedcom } from '@server/gedcom-import';
import { parseGedcom } from '@server/gedcom-parser';
import { createApi, createStaticFetch } from '@server/server';

import { ApiError, NOT_RESPONDING, openDatasetApi } from '.';
import type { DatasetApi } from '.';

const ORIGIN = 'http://localhost';

// Juva's first rippikirja, under an id like Astia's own: the app's routes
// take only those.
const VOLUME = '201';

function juvaAstia() {
  return memoryAstia({
    [JUVA]: {
      volumes: [{ id: VOLUME, label: VOLUMES['juva-1'], images: IMAGES }]
    }
  });
}

// Made-up people: a couple and their child.
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/',
  '1 SEX M',
  '0 @I2@ INDI',
  '1 NAME Maria /Esimerkki/',
  '1 SEX F',
  '0 @I3@ INDI',
  '1 NAME Juho /Esimerkki/',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 CHIL @I3@',
  ''
].join('\n');

let root = '';
let serve: ((req: Request) => Promise<Response>) | null = null;
let api: DatasetApi = openDatasetApi('juva');

// The server over `astia`, and the client asking it.
function serveWith(astia: MemoryAstia) {
  const registry = new DatasetRegistry(join(root, 'data'));
  serve = createStaticFetch({
    api: createApi(registry, { astia }),
    staticRoots: []
  });
  api = openDatasetApi('juva', { fetch: serve, origin: ORIGIN });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dataset-api-'));
  const staging = await new DatasetRegistry(join(root, 'data')).createStaging(
    'juva'
  );
  importGedcom(staging.db, parseGedcom(GEDCOM), () => null);
  const insert = staging.db.prepare(
    `INSERT INTO citations (scope_type, scope_id, page, text, sort_order)
     VALUES ('person', 1, ?, ?, ?)`
  );
  // One in the Volume Astia has, one in a later Volume it doesn't.
  const kept = rippiCitation(5001, '1790 - 1796', 12);
  const later = rippiCitation(5002, '1797 - 1803', 3);
  insert.run(kept.page, kept.text, 0);
  insert.run(later.page, later.text, 1);
  await writeFile(join(staging.mediaDir, 'photo.jpg'), 'jpeg');
  await staging.commit();
  serveWith(juvaAstia());
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

async function status(url: string) {
  return (await serve!(new Request(url))).status;
}

describe('the answers', () => {
  test('persons, families and a person', async () => {
    const persons = await api.persons();
    expect(persons.map((p) => p.id).toSorted((a, b) => a - b)).toEqual([
      1, 2, 3
    ]);
    expect(await api.families()).toMatchObject([
      { husband_id: 1, wife_id: 2, child_ids: [3] }
    ]);
    expect(await api.person(1)).toMatchObject({ id: 1 });
  });

  test("a person's Links, one line per church-book reference", async () => {
    const lines = [];
    for await (const line of api.personLinks(1)) lines.push(line);
    // In the order they resolve.
    lines.sort((a, b) => a.citationId - b.citationId);
    expect(lines.map((l) => l.citationId)).toEqual([1, 2]);
    expect(lines[0]).toHaveProperty('links');
    expect(lines[1]).toEqual({ citationId: 2, unlinked: 'no-volume' });
  });

  test('a Mark answers the reference resolved again', async () => {
    const resolved = await api.mark(1, { volumeId: VOLUME, image: 7 });
    expect(resolved).toMatchObject({
      citationId: 1,
      links: [{ volumeId: VOLUME, image: 7, certainty: 'marked' }]
    });
  });

  test('a Discard takes the Box back to the estimate, once', async () => {
    const box = { left: 100, top: 400, width: 300, height: 30 };
    await api.mark(1, { volumeId: VOLUME, image: 7, box });
    const resolved = await api.discard(1, { volumeId: VOLUME, image: 7 });
    expect(resolved).toMatchObject({
      citationId: 1,
      links: [{ volumeId: VOLUME, certainty: 'estimated' }]
    });
    expect(await failure(api.discard(1, { volumeId: VOLUME, image: 7 }))).toBe(
      'There is no box there to discard.'
    );
  });

  test("a Volume's citations and Images", async () => {
    const rows = await api.volumeCitations(VOLUME);
    expect(rows.map((r) => r.personId)).toEqual([1]);
    expect(await api.volumeImages(VOLUME)).toHaveLength(IMAGES);
  });

  test('the URLs it builds are served', async () => {
    expect(await status(api.imageUrl(VOLUME, 2, 0))).toBe(200);
    expect(api.imageUrl(VOLUME, 2, 3)).toEndWith('/images/2?retry=3');
    expect(await status(api.imageUrl(VOLUME, 2, 3))).toBe(200);
    expect(await status(api.thumbUrl(VOLUME, 2))).toBe(200);
    expect(await status(api.mediaUrl('photo.jpg'))).toBe(200);
  });
});

describe('failing', () => {
  test("says why in the server's words", async () => {
    expect(await failure(api.person(99))).toBe('person not found');
    expect(await failure(api.volumeCitations('elsewhere'))).toBe(
      "volume not in the dataset's parishes"
    );
    expect(await failure(api.mark(9, { volumeId: VOLUME, image: 7 }))).toBe(
      'citation not found'
    );
  });

  test('says when Astia fails', async () => {
    serveWith(memoryAstia({}, { down: true }));
    expect(await failure(api.volumeImages(VOLUME))).toBe(
      "Astia couldn't be reached or gave no answer."
    );
  });

  test("says when the app can't be reached", async () => {
    const away = openDatasetApi('juva', {
      fetch: async () => await Promise.reject(new TypeError('Load failed')),
      origin: ORIGIN
    });
    expect(await failure(away.persons())).toBe(NOT_RESPONDING);
  });

  test('a bug is thrown on as it is', async () => {
    const broken = openDatasetApi('juva', {
      fetch: async () => await Promise.resolve(new Response('{\n')),
      origin: ORIGIN
    });
    expect(await failure(broken.persons())).toBeInstanceOf(SyntaxError);
    expect(await failure(broken.personLinks(1).next())).toBeInstanceOf(
      SyntaxError
    );
  });

  test("a person's Links cut off are the app not responding", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new TypeError('network connection was lost'));
      }
    });
    const cut = openDatasetApi('juva', {
      fetch: async () => await Promise.resolve(new Response(body)),
      origin: ORIGIN
    });
    expect(await failure(cut.personLinks(1).next())).toBe(NOT_RESPONDING);
  });
});

describe('aborting', () => {
  test('rejects with the reason, even once answered', async () => {
    const abort = new AbortController();
    const reason = new Error('superseded');
    const asked = api.persons(abort.signal);
    abort.abort(reason);
    expect(await failure(asked)).toBe(reason);
  });

  test("ends a person's Links with the reason", async () => {
    const abort = new AbortController();
    const reason = new Error('superseded');
    const lines = api.personLinks(1, abort.signal);
    expect((await lines.next()).done).toBe(false);
    abort.abort(reason);
    expect(await failure(lines.next())).toBe(reason);
  });

  test('before a call is answered, too', async () => {
    const reason = new Error('superseded');
    const lines = api.personLinks(1, AbortSignal.abort(reason));
    expect(await failure(lines.next())).toBe(reason);
  });
});
