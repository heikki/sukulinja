import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { correctScan, useDataFolder } from './citation-scans/scans';
import { rippiCitation, seedParish } from './citation-scans/test-parish';
import { openDb } from './db';
import { createVolumeCitations } from './volume-citations';

let dir = '';

const astia = spyOn(globalThis, 'fetch').mockImplementation((() => {
  throw new Error('no requests to Astia in these tests');
}) as unknown as typeof fetch);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'volume-citations-'));
  await seedParish(dir);
  useDataFolder(dir);
  astia.mockClear();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
afterAll(() => {
  astia.mockRestore();
});

interface Cited {
  personId: number;
  page: string;
  text: string;
}

function datasetOf(cited: Cited[]) {
  const db = openDb(':memory:');
  const insert = db.prepare(
    `INSERT INTO citations (scope_type, scope_id, page, text, sort_order)
     VALUES ('person', ?, ?, ?, ?)`
  );
  for (const [i, c] of cited.entries()) {
    insert.run(c.personId, c.page, c.text, i);
  }
  return createVolumeCitations(db);
}

function cite(personId: number, c: { page: string; text: string }) {
  return { personId, ...c };
}

// Written as the vision pass writes it, from another process: the app isn't
// told.
async function writeLocal(anchors: unknown) {
  await Bun.write(join(dir, 'anchors.local.json'), JSON.stringify(anchors));
}

const BOX = { left: 0.1, top: 0.2, width: 0.5, height: 0.05 };

// Where each person's row is, in the order listed.
function placesOf(rows: Awaited<ReturnType<ReturnType<typeof datasetOf>>>) {
  return rows!.map((r) => ({
    personId: r.personId,
    image: r.image,
    method: r.method,
    split: r.split
  }));
}

test("lists the Volume's Placed, Anchored, Estimated and Volume-only citations", async () => {
  await writeLocal({
    'juva-1': {
      anchors: [{ image: 5, pages: [3] }],
      seen: [{ record: 5001, image: 9, by: 'vision', box: BOX }]
    }
  });
  const citations = datasetOf([
    cite(1, rippiCitation(5001, '1790 - 1796', 12)),
    cite(2, rippiCitation(5002, '1790 - 1796', 4)),
    cite(3, rippiCitation(5003, '1797 - 1803', 7)),
    cite(4, rippiCitation(5004, '1797 - 1803', null))
  ]);

  const first = await citations('juva-1');
  expect(first).toEqual([
    expect.objectContaining({
      personId: 1,
      image: 9,
      method: 'placed',
      by: 'vision',
      box: BOX,
      split: false
    }),
    expect.objectContaining({ personId: 2, image: 6, method: 'anchored' })
  ]);
  expect(first![0]!.citation).toMatchObject({
    churchBook: true,
    citedPage: 12
  });
  expect(placesOf(await citations('juva-2'))).toEqual([
    { personId: 3, image: 7, method: 'estimated', split: false },
    { personId: 4, image: null, method: 'volume', split: false }
  ]);
});

test('a Split reference is listed in each candidate Volume', async () => {
  const citations = datasetOf([cite(1, rippiCitation(5001, '1790 - 1803', 3))]);

  for (const volumeId of ['juva-1', 'juva-2']) {
    // eslint-disable-next-line no-await-in-loop -- two Volumes
    expect(placesOf(await citations(volumeId))).toEqual([
      { personId: 1, image: 3, method: 'estimated', split: true }
    ]);
  }
});

test('people citing one record get a row each, sharing its Image and box', async () => {
  await writeLocal({
    'juva-1': {
      anchors: [],
      seen: [{ record: 5001, image: 9, by: 'vision', box: BOX }]
    }
  });
  const record = rippiCitation(5001, '1790 - 1796', 12);
  const citations = datasetOf([
    cite(1, record),
    cite(2, record),
    cite(2, record)
  ]);

  const rows = await citations('juva-1');
  expect(rows!.map((r) => [r.personId, r.image, r.box])).toEqual([
    [1, 9, BOX],
    [2, 9, BOX]
  ]);
});

test('a hand correction shows in the next answer, dropping the vision box', async () => {
  const marked = rippiCitation(5001, '1790 - 1796', 12);
  const citations = datasetOf([cite(1, marked)]);
  expect(placesOf(await citations('juva-1'))).toEqual([
    { personId: 1, image: 12, method: 'estimated', split: false }
  ]);

  await writeLocal({
    'juva-1': {
      anchors: [],
      seen: [{ record: 5001, image: 9, by: 'vision', box: BOX }]
    }
  });
  expect(await citations('juva-1')).toEqual([
    expect.objectContaining({ image: 9, by: 'vision', box: BOX })
  ]);

  await correctScan(marked.page, marked.text, {
    volumeId: 'juva-1',
    image: 10
  });
  const [row] = (await citations('juva-1'))!;
  expect(row).toMatchObject({ image: 10, method: 'placed', by: 'hand' });
  expect(row!.box).toBeUndefined();
});

test("another parish's citations are never resolved", async () => {
  const elsewhere = rippiCitation(6001, '1790 - 1796', 12);
  const citations = datasetOf([
    cite(1, rippiCitation(5001, '1790 - 1796', 12)),
    cite(2, rippiCitation(5002, '1790 - 1796', 13)),
    cite(3, {
      page: elsewhere.page,
      text: elsewhere.text.replace('Juva', 'Haukivuori')
    })
  ]);

  expect((await citations('juva-1'))!.map((r) => r.personId)).toEqual([1, 2]);
  expect(astia).not.toHaveBeenCalled();
});

test('a Volume in none of the parishes cited is not found', async () => {
  const citations = datasetOf([
    cite(1, rippiCitation(5001, '1790 - 1796', 12))
  ]);
  expect(await citations('elsewhere-1')).toBeNull();
});
