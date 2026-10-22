// Citations made in the app, through the dataset's Citations: making one
// on an Astia Image, deleting it, and reading it back where Citations show.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { CitationLinks, Link, VolumeCitation } from '@common/types';

import { openAnnotations } from './annotations';
import { fileId, memoryAstia } from './citation-scans/memory-astia';
import type { MemoryAstia } from './citation-scans/memory-astia';
import { openScans } from './citation-scans/scans';
import {
  IMAGES,
  JUVA,
  juvaAstia,
  rippiCitation,
  VOLUMES
} from './citation-scans/test-parish';
import { pinsOf } from './citation-scans/test-pins';
import { createCitations } from './citations';
import { openDb } from './db';

let dir = '';
let astia: MemoryAstia = juvaAstia();

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'app-citations-'));
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

function cite(personId: number, c: { page: string | null; text: string }) {
  return { personId, ...c };
}

async function linesOf(lines: AsyncIterable<CitationLinks>) {
  const out: CitationLinks[] = [];
  for await (const line of lines) out.push(line);
  return out;
}

const BOX = { left: 100, top: 200, width: 500, height: 50 };

// Where each person's row is, in the order listed.
function placesOf(rows: VolumeCitation[] | null) {
  return rows!.map((r) => ({
    personId: r.personId,
    image: 'image' in r.link ? r.link.image : null,
    at: `${r.link.certainty} ${r.link.precision}`
  }));
}

// A dataset of the citations given, numbered from 1 in order, with a
// person for each id up to `people`, and Images 1000×800 pixels.
function withPeople(cited: Cited[], people = 3) {
  const db = openDb(join(dir, 'db.sqlite'));
  for (let id = 1; id <= people; id += 1) {
    db.run('INSERT INTO persons (id, xref) VALUES (?, ?)', [id, `@I${id}@`]);
  }
  const insert = db.prepare(
    `INSERT INTO citations (scope_type, scope_id, page, text, sort_order)
     VALUES ('person', ?, ?, ?, ?)`
  );
  for (const [i, c] of cited.entries()) {
    insert.run(c.personId, c.page, c.text, i);
  }
  const scans = openScans({
    pins: pinsOf(dir, db, { astia }),
    astia,
    sizeOf: () => Promise.resolve({ width: 1000, height: 800 })
  });
  return { db, citations: createCitations(db, scans) };
}

// An entry on Image `image` of juva-1, as the Scan viewer gives it.
function entry(image: number, text: string | null = null) {
  return {
    volumeId: 'juva-1',
    image,
    fileId: fileId('juva-1', image, 'full'),
    box: BOX,
    text
  };
}

const JUVA_1 = 'I Aa:1 Pää- ja rippikirjat (1790-1796)';
const ENTRY_LINK: Link = {
  volumeId: 'juva-1',
  volume: JUVA_1,
  url: 'https://astia.narc.fi/uusiastia/viewer/?fileId=juva-1-f13&aineistoId=juva-1',
  precision: 'entry',
  image: 13,
  box: BOX,
  certainty: 'marked'
};

function sources(db: Database) {
  return db
    .query('SELECT id, xref, title, publisher FROM sources ORDER BY id')
    .all();
}

test('a Citation made in the app is stored with its Mark, page and source', async () => {
  const { db, citations } = withPeople([
    cite(1, rippiCitation(5001, '1790 - 1796', 12))
  ]);

  const made = await citations.cite(2, entry(13, '  Baptism\n12.3.1795 '));
  expect(made).toMatchObject({
    personId: 2,
    link: ENTRY_LINK,
    citation: {
      id: 2,
      source: JUVA_1,
      entry: 'Image\u00a013',
      page: ENTRY_LINK.url,
      text: 'Baptism 12.3.1795',
      churchBook: true,
      madeInApp: true
    }
  });
  expect(
    db
      .query(
        `SELECT scope_id, page, original_page, text, link_image, link_file_id,
           link_box_left, link_by, added_in_app FROM citations WHERE id = 2`
      )
      .get()
  ).toEqual({
    scope_id: 2,
    page: ENTRY_LINK.url,
    original_page: null,
    text: 'Baptism 12.3.1795',
    link_image: 13,
    link_file_id: 'juva-1-f13',
    link_box_left: BOX.left,
    link_by: 'hand',
    added_in_app: 1
  });
  expect(sources(db)).toEqual([
    {
      id: 1,
      xref: '@ASTIA_JUVA_1@',
      title: JUVA_1,
      publisher: 'Kansallisarkisto, Astia'
    }
  ]);

  // A second in the Volume cites its source; another Volume gets its own.
  await citations.cite(3, entry(14));
  await citations.cite(3, {
    ...entry(2),
    volumeId: 'juva-2',
    fileId: 'juva-2-f2'
  });
  const sourceIds = db
    .query<{ source_id: number }, []>(
      'SELECT source_id FROM citations WHERE added_in_app = 1 ORDER BY id'
    )
    .all()
    .map((r) => r.source_id);
  expect(sourceIds).toEqual([1, 1, 2]);
  expect(sources(db)).toHaveLength(2);
});

test('a Citation is refused off its Image, or where the person already links it', async () => {
  const { citations } = withPeople([
    cite(1, rippiCitation(5001, '1790 - 1796', 12))
  ]);

  expect(await citations.cite(9, entry(13))).toBeNull();
  expect(
    await citations.cite(2, { ...entry(13), box: { ...BOX, width: 950 } })
  ).toEqual({
    rejected: 'The entry box must lie on the Image, in whole pixels.'
  });
  expect(
    await citations.cite(2, { ...entry(13), fileId: 'juva-1-f12' })
  ).toEqual({ rejected: "That isn't the Image's file in Astia." });
  expect(await citations.cite(2, { ...entry(13), image: 21 })).toEqual({
    rejected: 'The volume has images 1–20.'
  });
  expect(
    await citations.cite(2, { ...entry(1), volumeId: 'elsewhere-1' })
  ).toEqual({ rejected: "That Volume isn't in this tree's church books." });

  // Person 1's reference is Estimated on Image 12.
  const already = { rejected: 'Their Citations already link this Image.' };
  expect(await citations.cite(1, entry(12))).toEqual(already);
  expect(await citations.cite(1, entry(13))).toMatchObject({ personId: 1 });
  expect(await citations.cite(1, entry(13))).toEqual(already);
});

test('a Citation made in the app is deleted with its notes, and its source with the last', async () => {
  const { db, citations } = withPeople([
    cite(1, rippiCitation(5001, '1790 - 1796', 12))
  ]);
  await citations.cite(2, entry(13));
  await citations.cite(3, entry(14));
  db.run(
    "INSERT INTO notes (owner_type, owner_id, text) VALUES ('citation', 2, 'Seen')"
  );

  expect(citations.uncite(1)).toBe(false);
  expect(citations.uncite(99)).toBeNull();
  expect(citations.uncite(2)).toBe(true);
  expect(db.query('SELECT id FROM citations ORDER BY id').all()).toEqual([
    { id: 1 },
    { id: 3 }
  ]);
  expect(db.query('SELECT * FROM notes').all()).toEqual([]);
  expect(sources(db)).toHaveLength(1);
  expect(citations.uncite(3)).toBe(true);
  expect(sources(db)).toEqual([]);
});

const ARCHIVE = 'Juvan seurakunnan arkisto';

// Juva's archive, titled as Astia titles it.
function titledJuva() {
  return memoryAstia({
    [JUVA]: {
      title: ARCHIVE,
      volumes: Object.entries(VOLUMES).map(([id, label]) => ({
        id,
        label,
        images: IMAGES
      }))
    }
  });
}

test('a Citation made in the app is read back with its Link Marked at the entry', async () => {
  astia = titledJuva();
  const { citations } = withPeople([
    cite(1, { page: null, text: 'Family bible' }),
    cite(1, rippiCitation(5002, '1797 - 1803', 4)),
    cite(2, rippiCitation(5001, '1790 - 1796', 12))
  ]);
  await citations.cite(1, entry(13, 'Baptism'));
  const asked = astia.asked.length;

  // Among the church books by its Volume's years.
  expect(citations.ofPerson(1).map((c) => [c.id, c.madeInApp])).toEqual([
    [4, true],
    [2, false],
    [1, false]
  ]);
  const lines = await linesOf(citations.linksOf(1));
  expect(lines.find((l) => l.citationId === 4)).toEqual({
    citationId: 4,
    links: [{ ...ENTRY_LINK, archive: ARCHIVE }]
  });
  // Its Link is read as stored, without asking Astia about its Volume.
  expect(astia.asked.slice(asked)).not.toContain('images juva-1');
  expect(placesOf(await citations.inVolume('juva-1'))).toEqual([
    { personId: 2, image: 12, at: 'estimated image' },
    { personId: 1, image: 13, at: 'marked entry' }
  ]);
  const rows = (await citations.inVolume('juva-1'))!;
  expect(rows.at(-1)!.link).toEqual({ ...ENTRY_LINK, archive: ARCHIVE });
});

test('an imported Citation of an Astia Image, with no reference, is read by its stored Link', async () => {
  const { db, citations } = withPeople([]);
  openAnnotations(db).insert(
    {
      scopeType: 'person',
      scopeId: 1,
      sourceId: null,
      sortOrder: 0,
      page: ENTRY_LINK.url,
      event: null,
      role: null,
      quality: null,
      dataDate: null,
      text: null
    },
    {
      link: {
        volumeId: 'juva-1',
        volume: JUVA_1,
        image: 13,
        fileId: 'juva-1-f13',
        box: BOX,
        by: 'hand'
      },
      originalPage: null,
      madeInApp: false
    }
  );

  expect(citations.ofPerson(1)).toMatchObject([
    { churchBook: true, madeInApp: false }
  ]);
  expect(await linesOf(citations.linksOf(1))).toEqual([
    { citationId: 1, links: [ENTRY_LINK] }
  ]);
  expect(placesOf(await citations.inVolume('juva-1'))).toEqual([
    { personId: 1, image: 13, at: 'marked entry' }
  ]);
});

test('a Mark moves a Citation made in the app to another entry in its Volume', async () => {
  const { db, citations } = withPeople([
    cite(2, rippiCitation(5001, '1790 - 1796', 12))
  ]);
  await citations.cite(1, entry(13));
  const moved = { left: 50, top: 60, width: 400, height: 40 };

  expect(
    await citations.mark(2, { volumeId: 'juva-1', image: 14, box: moved })
  ).toEqual({
    links: [
      {
        ...ENTRY_LINK,
        url: ENTRY_LINK.url.replace('f13', 'f14'),
        image: 14,
        box: moved
      }
    ]
  });
  expect(
    db
      .query(
        `SELECT page, original_page, link_image, added_in_app FROM citations
         WHERE id = 2`
      )
      .get()
  ).toEqual({
    page: ENTRY_LINK.url.replace('f13', 'f14'),
    original_page: null,
    link_image: 14,
    added_in_app: 1
  });

  const stays = { rejected: 'A Citation of an Image stays in its Volume.' };
  expect(
    await citations.mark(2, { volumeId: 'juva-2', image: 2, box: moved })
  ).toEqual(stays);
  expect(await citations.mark(2, { volumeId: 'juva-1', image: 14 })).toEqual({
    rejected: 'A Citation of an Image needs its entry box.'
  });
  expect(
    await citations.mark(2, {
      volumeId: 'juva-1',
      image: 14,
      box: { ...moved, width: 990 }
    })
  ).toEqual({
    rejected: 'The entry box must lie on the Image, in whole pixels.'
  });
  // A Discard is for a reference's Box; this one is deleted instead.
  expect(
    await citations.discard(2, { volumeId: 'juva-1', image: 14 })
  ).toBeNull();
});
