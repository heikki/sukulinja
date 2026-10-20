import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { CitationLinks, VolumeCitation } from '@common/types';

import type { MemoryAstia } from './citation-scans/memory-astia';
import { openPins } from './citation-scans/pins';
import { openScans } from './citation-scans/scans';
import {
  baptismCitation,
  juvaAstia,
  rippiCitation
} from './citation-scans/test-parish';
import { createCitations, describeRef, entryOf } from './citations';
import { openDb } from './db';
import { importGedcom } from './gedcom-import';
import { parseGedcom } from './gedcom-parser';

let dir = '';
let astia: MemoryAstia = juvaAstia();

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'citations-'));
  astia = juvaAstia();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

interface Cited {
  personId: number;
  page: string | null;
  text: string;
}

// The dataset's citations, numbered from 1 in the order given.
function datasetOf(cited: Cited[]) {
  const db = openDb(':memory:');
  const insert = db.prepare(
    `INSERT INTO citations (scope_type, scope_id, page, text, sort_order)
     VALUES ('person', ?, ?, ?, ?)`
  );
  for (const [i, c] of cited.entries()) {
    insert.run(c.personId, c.page, c.text, i);
  }
  return createCitations(db, openScans({ pins: openPins(dir), astia }));
}

function cite(personId: number, c: { page: string | null; text: string }) {
  return { personId, ...c };
}

async function linesOf(lines: AsyncIterable<CitationLinks>) {
  const out: CitationLinks[] = [];
  for await (const line of lines) out.push(line);
  return out;
}

// Written as the vision pass writes it, from another process: the app isn't
// told.
async function writeLocal(volumes: unknown) {
  await Bun.write(join(dir, 'pins.local.json'), JSON.stringify({ volumes }));
}

const BOX = { left: 0.1, top: 0.2, width: 0.5, height: 0.05 };

// ---------------------------------------------------------------- a person's

const RIPPI =
  'https://www.myheritage.fi/research/collection-10509/x?itemId=1&action=showRecord';

test("serves a person's Citations, church books first", () => {
  const db = openDb(':memory:');
  const gedcom = [
    '0 @S1@ SOUR',
    '1 TITL Suomalaiset rippi- ja lastenkirjat, 1657-1915',
    '0 @I1@ INDI',
    '1 NAME Matti /Esimerkki/',
    '1 SOUR Family bible',
    '1 SOUR @S1@',
    `2 PAGE ${RIPPI}`,
    '2 DATA',
    '3 TEXT Matti EsimerkkiKirja: Rippikirja, 1794 - 1808Sivu: 139',
    ''
  ].join('\n');
  importGedcom(db, parseGedcom(gedcom), () => null);
  expect(
    createCitations(db, openScans({ pins: openPins(dir), astia })).ofPerson(1)
  ).toEqual([
    {
      id: 2,
      source: 'Suomalaiset rippi- ja lastenkirjat, 1657-1915',
      reference: 'Pää- ja rippikirjat 1794–1808\u00a0· p.\u00a0139',
      entry: 'p.\u00a0139',
      page: RIPPI,
      url: RIPPI,
      record: {
        name: 'Matti Esimerkki',
        fields: [
          { label: 'Kirja', value: 'Rippikirja, 1794 - 1808' },
          { label: 'Sivu', value: '139' }
        ],
        household: []
      },
      text: null,
      churchBook: true,
      citedPage: 139
    },
    {
      id: 1,
      source: null,
      reference: null,
      entry: null,
      page: null,
      url: null,
      record: null,
      text: 'Family bible',
      churchBook: false,
      citedPage: null
    }
  ]);
});

test('orders church books by their first year, the others as recorded', () => {
  const citations = datasetOf([
    cite(1, { page: null, text: 'Family bible' }),
    cite(1, rippiCitation(5002, '1797 - 1803', 4)),
    cite(1, { page: null, text: 'Census' }),
    cite(1, rippiCitation(5001, '1790 - 1796', 12))
  ]);
  expect(citations.ofPerson(1).map((c) => c.id)).toEqual([4, 2, 1, 3]);
});

test('names a church-book reference by what it gives', () => {
  const ref = {
    url: RIPPI,
    collection: '30233',
    parish: 'Pitäjä',
    kind: 'kastetut' as const,
    years: { from: 1830, to: 1830 },
    page: null,
    places: [],
    recordId: null,
    name: null,
    date: null,
    household: null,
    named: []
  };
  expect(describeRef(ref)).toBe(
    'Pitäjä\u00a0· Syntyneiden ja kastettujen luettelot 1830'
  );
  expect(describeRef({ ...ref, kind: 'lasten', years: null, page: 2 })).toBe(
    'Pitäjä\u00a0· Lastenkirjat\u00a0· p.\u00a02'
  );
  expect(
    describeRef({ ...ref, parish: null, kind: null, years: null })
  ).toBeNull();
  expect(entryOf({ ...ref, date: '1761-03-03' })).toBe('3.3.1761');
  expect(entryOf({ ...ref, date: '1761-03' })).toBe('3/1761');
  expect(entryOf({ ...ref, date: '1761', page: 12 })).toBe('p.\u00a012');
  expect(entryOf(ref)).toBeNull();
});

test('every Citation served as a church book gets one scan line, and no other', async () => {
  const rippi = rippiCitation(5001, '1790 - 1796', 12);
  const citations = datasetOf([
    cite(1, rippi),
    cite(1, baptismCitation(9001, '29. Marras 1795', 'Juho Esimerkki')),
    // A church-book collection, but not a link.
    cite(1, { page: rippi.page.replace('https://', ''), text: rippi.text }),
    // A MyHeritage record in another collection.
    cite(1, {
      page: 'https://www.myheritage.fi/research/collection-1/x?itemId=7',
      text: 'Matti Esimerkki'
    }),
    cite(1, { page: null, text: 'Family bible' }),
    cite(2, rippiCitation(5002, '1790 - 1796', 13))
  ]);

  const served = citations.ofPerson(1);
  const churchBooks = served.filter((c) => c.churchBook).map((c) => c.id);
  expect(churchBooks.toSorted((a, b) => a - b)).toEqual([1, 2]);
  const lines = await linesOf(citations.linksOf(1));
  expect(lines.map((l) => l.citationId).toSorted((a, b) => a - b)).toEqual(
    churchBooks
  );
  expect(lines.find((l) => l.citationId === 1)).toMatchObject({
    links: [{ volumeId: 'juva-1', image: 12, certainty: 'estimated' }]
  });
});

test('a person with no church books gets no scan lines', async () => {
  const citations = datasetOf([cite(1, { page: null, text: 'Family bible' })]);
  expect(await linesOf(citations.linksOf(1))).toEqual([]);
  expect(await linesOf(citations.linksOf(99))).toEqual([]);
});

// ---------------------------------------------------------------- Marks

test('a Mark is saved, and the scan lines show it', async () => {
  const citations = datasetOf([
    cite(1, rippiCitation(5001, '1790 - 1796', 12))
  ]);

  expect(
    await citations.mark(1, { volumeId: 'juva-1', image: 7 })
  ).toMatchObject({
    links: [
      { volumeId: 'juva-1', image: 7, precision: 'image', certainty: 'marked' }
    ]
  });
  const [line] = await linesOf(citations.linksOf(1));
  expect(line).toMatchObject({
    citationId: 1,
    links: [{ image: 7, precision: 'image', certainty: 'marked' }]
  });
});

test('a Mark needs a church-book Citation and an Image in the Volume', async () => {
  const citations = datasetOf([
    cite(1, rippiCitation(5001, '1790 - 1796', 12)),
    cite(1, { page: null, text: 'Family bible' })
  ]);

  expect(await citations.mark(99, { volumeId: 'juva-1', image: 7 })).toBeNull();
  expect(await citations.mark(2, { volumeId: 'juva-1', image: 7 })).toBeNull();
  expect(await citations.mark(1, { volumeId: 'juva-1', image: 21 })).toEqual({
    rejected: 'The volume has images 1–20.'
  });
  expect(
    await citations.mark(1, { volumeId: 'elsewhere-1', image: 1 })
  ).toEqual({ rejected: "That Volume isn't in this parish's church books." });
});

// ---------------------------------------------------------------- a Volume's

function imageOf(r: VolumeCitation) {
  return 'image' in r.link ? r.link.image : null;
}

function boxOf(r: VolumeCitation) {
  return r.link.precision === 'entry' ? r.link.box : null;
}

// Where each person's row is, in the order listed.
function placesOf(rows: VolumeCitation[] | null) {
  return rows!.map((r) => ({
    personId: r.personId,
    image: imageOf(r),
    at: `${r.link.certainty} ${r.link.precision}`
  }));
}

test("lists the Volume's Vision matches, Estimated Images and Estimated Volumes", async () => {
  await writeLocal({
    'juva-1': {
      pages: [{ image: 5, pages: [3] }],
      records: [{ record: 5001, image: 9, by: 'vision', box: BOX }]
    }
  });
  const citations = datasetOf([
    cite(1, rippiCitation(5001, '1790 - 1796', 12)),
    cite(2, rippiCitation(5002, '1790 - 1796', 4)),
    cite(3, rippiCitation(5003, '1797 - 1803', 7)),
    cite(4, rippiCitation(5004, '1797 - 1803', null))
  ]);

  const first = await citations.inVolume('juva-1');
  expect(placesOf(first)).toEqual([
    { personId: 1, image: 9, at: 'vision entry' },
    { personId: 2, image: 6, at: 'estimated image' }
  ]);
  expect(first![0]!.link).toMatchObject({ certainty: 'vision', box: BOX });
  expect(first![1]!.link).toMatchObject({ from: 'pins' });
  expect(first![0]!.citation).toMatchObject({
    churchBook: true,
    citedPage: 12
  });
  expect(placesOf(await citations.inVolume('juva-2'))).toEqual([
    { personId: 3, image: 7, at: 'estimated image' },
    { personId: 4, image: null, at: 'estimated volume' }
  ]);
});

test('a Split reference is listed in each candidate Volume', async () => {
  const citations = datasetOf([cite(1, rippiCitation(5001, '1790 - 1803', 3))]);

  for (const volumeId of ['juva-1', 'juva-2']) {
    // eslint-disable-next-line no-await-in-loop -- two Volumes
    expect(placesOf(await citations.inVolume(volumeId))).toEqual([
      { personId: 1, image: 3, at: 'estimated image' }
    ]);
  }
});

test('people citing one record get a row each, sharing its Image and box', async () => {
  await writeLocal({
    'juva-1': {
      pages: [],
      records: [{ record: 5001, image: 9, by: 'vision', box: BOX }]
    }
  });
  const record = rippiCitation(5001, '1790 - 1796', 12);
  const citations = datasetOf([
    cite(1, record),
    cite(2, record),
    cite(2, record)
  ]);

  const rows = await citations.inVolume('juva-1');
  expect(rows!.map((r) => [r.personId, imageOf(r), boxOf(r)])).toEqual([
    [1, 9, BOX],
    [2, 9, BOX]
  ]);
});

test('a Mark shows in the next answer, dropping the vision box', async () => {
  const citations = datasetOf([
    cite(1, rippiCitation(5001, '1790 - 1796', 12))
  ]);
  expect(placesOf(await citations.inVolume('juva-1'))).toEqual([
    { personId: 1, image: 12, at: 'estimated image' }
  ]);

  await writeLocal({
    'juva-1': {
      pages: [],
      records: [{ record: 5001, image: 9, by: 'vision', box: BOX }]
    }
  });
  const pinned = (await citations.inVolume('juva-1'))!;
  expect(pinned).toHaveLength(1);
  expect(pinned[0]!.link).toMatchObject({
    image: 9,
    certainty: 'vision',
    box: BOX
  });

  await citations.mark(1, { volumeId: 'juva-1', image: 10 });
  const [row] = (await citations.inVolume('juva-1'))!;
  expect(row!.link).toMatchObject({
    image: 10,
    precision: 'image',
    certainty: 'marked'
  });
  expect(boxOf(row!)).toBeNull();
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

  const rows = await citations.inVolume('juva-1');
  expect(rows!.map((r) => r.personId)).toEqual([1, 2]);
  // Haukivuori's archive was never asked for.
  expect(astia.asked).not.toContain('volumes 1202439501');
});

test('a Volume in none of the parishes cited is not found', async () => {
  const citations = datasetOf([
    cite(1, rippiCitation(5001, '1790 - 1796', 12))
  ]);
  expect(await citations.inVolume('elsewhere-1')).toBeNull();
});
