// The operations on a dataset's Citations, over HTTP as the app serves
// them: what each answers, and what it refuses with which status.

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BookSuggestion, ListedBook } from '@/common/types';

import { DatasetRegistry } from '../datasets/registry';
import { createApi, createStaticFetch } from '../server';
import type { VisionReaders } from './index';
import { JUVA, juvaAstia, memoryAstia, rippiCitation } from './testing';
import type { MemoryAstia } from './testing';

let root = '';

// A vision model that finds no one, for nothing.
const visionAsked: string[] = [];
async function vision(
  ...[model]: Parameters<VisionReaders>
): ReturnType<VisionReaders> {
  let calls = 0;
  function ask(what: string) {
    visionAsked.push(what);
    calls += 1;
  }
  return await Promise.resolve({
    models: { pages: model, entry: model },
    spend: () => ({
      [model]: { calls, inputTokens: 0, outputTokens: 0, dollars: 0 }
    }),
    pageNumbers: async ({ image }) => {
      ask(`pages ${image}`);
      return await Promise.resolve({ pages: [image] });
    },
    findEntry: async ({ image }) => {
      ask(`entry ${image}`);
      return await Promise.resolve({ found: false, confidence: 0.9 });
    },
    findEntries: async ({ image }, people) => {
      ask(`entries ${image}`);
      return await Promise.resolve(
        people.map(() => ({ found: false, confidence: 0.9 }))
      );
    }
  });
}

// The app's routes over the data folder in `root`, with this Astia.
function servedWith(astia: MemoryAstia) {
  return createStaticFetch({
    api: createApi(new DatasetRegistry(join(root, 'data')), { astia, vision }),
    staticRoots: []
  });
}

let fetch = servedWith(juvaAstia());

// Serves with this Astia instead.
function serveWith(astia: MemoryAstia) {
  fetch = servedWith(astia);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'citation-operations-'));
  serveWith(juvaAstia());
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// Asks the dataset's operation `name` (common/operations).
async function op(slug: string, name: string, body: unknown = {}) {
  return await fetch(
    new Request(`http://localhost/d/${slug}/api/${name}`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  );
}

describe("A dataset's Citations", () => {
  async function seedDataset(more: (db: Database) => void = () => undefined) {
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
    more(staging.db);
    await staging.commit();
  }

  async function mark(citationId: number, at: unknown) {
    return (await op('juva', 'mark', { citationId, at })).status;
  }

  test('streams scan lines, saves Marks, and lists a Volume', async () => {
    await seedDataset();
    const scans = await op('juva', 'personLinks', { personId: 1 });
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

    const choices = await op('juva', 'volumeChoices', { citationId: 1 });
    expect(await choices.json()).toMatchObject({
      fits: [{ id: 'juva-1' }],
      others: [{ id: 'juva-2' }]
    });
    expect((await op('juva', 'volumeChoices', { citationId: 2 })).status).toBe(
      404
    );

    // A Mark at the entry converts the reference to a Citation of its Image
    // (ADR-0016): it can't lose its Box, nor go in another Volume.
    expect(await mark(1, { volumeId: 'juva-1', image: 7, box })).toBe(200);
    expect(await mark(1, { volumeId: 'juva-1', image: 7, box: null })).toBe(
      400
    );
    expect((await op('juva', 'volumeChoices', { citationId: 1 })).status).toBe(
      404
    );

    // The Marks saved are one Change on their Citation, the last one
    // (combine.ts); one refused is none.
    const changes = (await (await op('juva', 'changes')).json()) as Array<{
      what: { kind: string; at: string };
      on: { kind: string; citationId: number } | null;
      who: string | null;
    }>;
    expect(changes.map((c) => c.what.at)).toEqual(['entry']);
    expect(changes[0]).toMatchObject({
      on: { kind: 'citation', citationId: 1 },
      who: 'Matti /Testinen/'
    });

    const volume = await op('juva', 'volumeCitations', { volumeId: 'juva-1' });
    expect(((await volume.json()) as unknown[]).length).toBe(1);
    const elsewhere = await op('juva', 'volumeCitations', {
      volumeId: 'elsewhere'
    });
    expect(await elsewhere.json()).toEqual([]);
  });

  test("lists the archives the dataset's church books are in", async () => {
    await seedDataset();
    const archives = await op('juva', 'archives');
    // Astia gives no title here, so each goes by its id.
    expect(await archives.json()).toEqual([
      { archiveId: '1212295491', title: '1212295491' }
    ]);
    // Nor names the archive a Volume is in.
    const volume = await op('juva', 'volume', { volumeId: 'juva-1' });
    expect(await volume.json()).toMatchObject({ archive: null });
  });

  test("counts the Citations in each of a parish's Volumes", async () => {
    await seedDataset();
    const juva = await op('juva', 'archiveCitations', {
      archiveId: '1212295491'
    });
    expect(await juva.json()).toEqual({ 'juva-1': 1 });
    const elsewhere = await op('juva', 'archiveCitations', {
      archiveId: '1200716382'
    });
    expect(await elsewhere.json()).toEqual({});
  });

  test('counts again once the dataset has changed', async () => {
    await seedDataset();
    async function counted() {
      const res = await op('juva', 'archiveCitations', {
        archiveId: '1212295491'
      });
      return (await res.json()) as unknown;
    }
    expect(await counted()).toEqual({ 'juva-1': 1 });
    // Written from another connection, as another process would.
    const rippi = rippiCitation(5002, '1790 - 1796', 13);
    new DatasetRegistry(join(root, 'data'))
      .open('juva')
      .prepare(
        `INSERT INTO citations (scope_type, scope_id, page, text, sort_order)
         VALUES ('person', 1, ?, ?, 2)`
      )
      .run(rippi.page, rippi.text);
    expect(await counted()).toEqual({ 'juva-1': 2 });
  });

  test('lists the books cited, and adds and takes off others', async () => {
    await seedDataset();
    async function listed(name: string, body: unknown = {}) {
      const res = await op('juva', name, body);
      expect(res.status).toBe(200);
      return ((await res.json()) as ListedBook[]).map((b) => ({
        id: b.id,
        kind: b.kind,
        cited: b.cited,
        added: b.added
      }));
    }
    expect(await listed('bookList')).toEqual([
      { id: 'juva-1', kind: 'rippi', cited: 1, added: false }
    ]);
    expect(
      await listed('listBook', { volumeId: 'juva-3', archiveId: JUVA })
    ).toEqual([
      { id: 'juva-1', kind: 'rippi', cited: 1, added: false },
      { id: 'juva-3', kind: 'kastetut', cited: 0, added: true }
    ]);
    const elsewhere = await op('juva', 'listBook', {
      volumeId: 'juva-3',
      archiveId: '1200716382'
    });
    expect(elsewhere.status).toBe(400);
    // A book cited stays, added or not.
    const cited = await op('juva', 'unlistBook', { volumeId: 'juva-1' });
    expect(cited.status).toBe(404);
    await listed('listBook', { volumeId: 'juva-1', archiveId: JUVA });
    expect(
      (await op('juva', 'unlistBook', { volumeId: 'juva-1' })).status
    ).toBe(409);
    expect(await listed('unlistBook', { volumeId: 'juva-3' })).toEqual([
      { id: 'juva-1', kind: 'rippi', cited: 1, added: true }
    ]);
  });

  test("finds the church books a person's Facts say they're in", async () => {
    await seedDataset((db) => {
      db.run(
        `INSERT INTO facts (scope_type, scope_id, tag, date_text, place)
         VALUES ('person', 1, 'BIRT', '1792', 'Juva, Suomi')`
      );
    });
    const books = await op('juva', 'personBooks', { personId: 1 });
    const [baptism] = (await books.json()) as BookSuggestion[];
    expect(baptism?.volumes.map((v) => v.id)).toEqual(['juva-3']);
    expect((await op('juva', 'personBooks', { personId: 9 })).status).toBe(404);
  });

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
    const made = await op('juva', 'citeEntry', {
      at: { ...at, event: 'CHR', text: 'Rippikirja' },
      people: [{ personId: 2, role: 'CHIL' }]
    });
    expect(made.status).toBe(200);
    const [first] = (await made.json()) as Array<{
      citation: { entryId: number };
    }>;
    const entryId = first!.citation.entryId;
    expect((await op('juva', 'citeEntry', { at, people: [{}] })).status).toBe(
      400
    );
    const got = await fetch(
      new Request('http://localhost/d/juva/api/citeEntry')
    );
    expect(got.status).toBe(405);

    const moved = { ...at, image: 14, fileId: 'juva-1-f14' };
    const edited = await op('juva', 'editEntry', {
      entryId,
      edit: {
        at: moved,
        event: 'CHR',
        text: ' Rippikirja,\n\n sivu  12 ',
        people: [
          { personId: 2, role: 'CHIL' },
          { personId: 3, role: 'FATH' }
        ]
      }
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
        await op('juva', 'editEntry', {
          entryId,
          edit: { text: 'x', people: [{ personId: 3 }, { personId: 3 }] }
        })
      ).status
    ).toBe(400);
    const unread = [{ text: 1 }, { at: { image: 2 } }, { event: 'BIRT' }].map(
      async (edit) => (await op('juva', 'editEntry', { entryId, edit })).status
    );
    expect(await Promise.all(unread)).toEqual([400, 400, 400]);
    const missing = await op('juva', 'editEntry', {
      entryId: 99,
      edit: { text: 'x' }
    });
    expect(missing.status).toBe(404);
    expect((await op('juva', 'deleteEntry', { entryId })).status).toBe(204);
    expect((await op('juva', 'deleteEntry', { entryId })).status).toBe(404);
  });

  test('makes a Citation on an Image, and deletes it', async () => {
    await seedPeople();
    const entry = { ...at, event: 'CHR', text: 'Baptism' };
    function naming(personId: number, at: object = entry) {
      return { at, people: [{ personId }] };
    }

    const made = await op('juva', 'citeEntry', naming(2));
    expect(made.status).toBe(200);
    expect(await made.json()).toMatchObject([
      {
        personId: 2,
        citation: { id: 3, text: 'Baptism', madeInApp: true },
        link: { image: 13, precision: 'entry', certainty: 'marked' }
      }
    ]);
    // Person 1's reference is Estimated on Image 12.
    const linked = { ...entry, image: 12, fileId: 'juva-1-f12' };
    expect((await op('juva', 'citeEntry', naming(1, linked))).status).toBe(400);
    expect((await op('juva', 'citeEntry', naming(9))).status).toBe(404);
    const { box: _, ...unboxed } = entry;
    expect((await op('juva', 'citeEntry', naming(1, unboxed))).status).toBe(
      400
    );
    expect((await op('juva', 'citePerson', entry)).status).toBe(404);

    const volume = await op('juva', 'volumeCitations', { volumeId: 'juva-1' });
    expect(((await volume.json()) as unknown[]).length).toBe(2);

    expect((await op('juva', 'uncite', { citationId: 3 })).status).toBe(204);
    expect((await op('juva', 'uncite', { citationId: 3 })).status).toBe(404);

    // Made, then deleted: the deleted one's Change falls back on its person.
    const changes = (await (await op('juva', 'changes')).json()) as Array<{
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

  test('looks for references on an Image with the vision model', async () => {
    await seedDataset();
    async function find(body: unknown) {
      const res = await op('juva', 'findAllOnImage', body);
      const text = await res.text();
      return {
        status: res.status,
        body: (res.ok ? JSON.parse(text) : text) as unknown
      };
    }
    const at = { volumeId: 'juva-1', image: 12 };
    const asked = { citationIds: [1], at, model: 'claude-haiku-5-5' };
    const first = await find(asked);
    expect(first).toMatchObject({
      status: 200,
      body: {
        tries: [{ links: { citationId: 1 }, missed: 'name not found' }],
        model: 'claude-haiku-5-5',
        cached: 0,
        dollars: 0
      }
    });
    const { readings } = first.body as { readings: number };
    expect(readings).toBeGreaterThan(0);
    // Asked again, the readings kept answer it.
    const before = visionAsked.length;
    expect((await find(asked)).body).toMatchObject({
      readings,
      cached: readings
    });
    expect(visionAsked.length).toBe(before);
    expect((await find({ ...asked, model: 'gpt' })).status).toBe(400);
    expect((await find({ ...asked, citationIds: [] })).status).toBe(400);
  });

  test("locates a Volume's estimates a line a step", async () => {
    await seedDataset();
    const body = {
      volumeId: 'juva-1',
      volume: 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
      model: 'claude-haiku-5-5'
    };
    const res = await op('juva', 'locateVolume', body);
    expect(res.headers.get('content-type')).toBe('application/x-ndjson');
    const lines = (await res.text())
      .trim()
      .split('\n')
      .map((l) => Object.keys(JSON.parse(l) as object)[0]);
    expect(lines).toEqual([
      'surveying',
      'surveyed',
      'searching',
      'tried',
      'done'
    ]);
    expect(
      (await op('juva', 'locateVolume', { ...body, model: 'gpt' })).status
    ).toBe(400);
  });

  test('says when Astia fails', async () => {
    await seedDataset();
    serveWith(memoryAstia({}, { down: true }));
    const scans = await op('juva', 'personLinks', { personId: 1 });
    expect(JSON.parse(await scans.text())).toEqual({
      citationId: 1,
      unlinked: 'astia-error'
    });
    expect(await mark(1, { volumeId: 'juva-1', image: 7 })).toBe(502);
    expect(
      (await op('juva', 'volumeCitations', { volumeId: 'juva-1' })).status
    ).toBe(502);
  });
});
