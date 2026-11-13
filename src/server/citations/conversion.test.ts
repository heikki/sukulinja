// A reference Marked at the entry becomes a Citation of its Image
// (ADR-0016): through a dataset's Citations, as the Scan viewer saves a
// Mark, and what the dataset then holds.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb } from '../datasets/db';
import { memoryParishes } from './astia/parishes';
import { juvaAstia, rippiCitation, VOLUMES } from './astia/test-parish';
import { createCitations } from './citations';
import { CITATIONS_READ } from './entries';
import { openImages } from './images';
import { referencesFor } from './myheritage/test-pins';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'conversion-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const BOX = { left: 100, top: 200, width: 500, height: 50 };
const MOVED = { left: 50, top: 60, width: 400, height: 40 };

// Persons 1–3, the first two citing record 5001 under MyHeritage's source,
// the third record 5002; Images 1000×800 pixels.
function dataset() {
  const db = openDb(join(dir, 'db.sqlite'));
  db.run(
    "INSERT INTO sources (id, xref, title) VALUES (1, '@S1@', 'Suomalaiset rippi- ja lastenkirjat, 1657-1915')"
  );
  const insert = db.prepare(
    `INSERT INTO citations (scope_type, scope_id, source_id, page, text, sort_order)
     VALUES ('person', ?, 1, ?, ?, 0)`
  );
  for (const [person, record] of [
    [1, 5001],
    [2, 5001],
    [3, 5002]
  ] as const) {
    db.run('INSERT INTO persons (id, xref) VALUES (?, ?)', [
      person,
      `@I${person}@`
    ]);
    const c = rippiCitation(record, '1790 - 1796', 12);
    insert.run(person, c.page, c.text);
  }
  const astia = juvaAstia();
  async function sizeOf() {
    return await Promise.resolve({ width: 1000, height: 800 });
  }
  const references = referencesFor(dir, db, { astia, sizeOf });
  const images = openImages({ astia, parishes: memoryParishes(), sizeOf });
  return { db, citations: createCitations(db, { images, references }) };
}

interface Row {
  id: number;
  source: string;
  text: string | null;
  original_page: string | null;
  link_image: number | null;
  added_in_app: number;
}

function rows(db: ReturnType<typeof openDb>) {
  return db
    .query<Row, []>(
      `SELECT c.id, s.title AS source, c.text, c.original_page, c.link_image,
         c.added_in_app
       FROM ${CITATIONS_READ} c JOIN sources s ON s.id = c.source_id ORDER BY c.id`
    )
    .all();
}

const RECORD =
  'https://www.myheritage.fi/research/collection-10509/x?itemId=5001&action=showRecord';

test('a hand Mark at the entry converts every citation of the record', async () => {
  const { db, citations } = dataset();
  // MyHeritage's own EVEN and ROLE, which aren't GEDCOM's.
  db.run("UPDATE citations SET event = 'Record', role = '10509:5001-:ab'");
  await citations.mark(1, { volumeId: 'juva-1', image: 13, box: BOX });

  const converted = {
    source: VOLUMES['juva-1'],
    text: 'Matti Esimerkki\nKirja: Rippikirja, 1790 - 1796\nHallintoalue: Juva\nSivu: 12',
    original_page: RECORD,
    link_image: 13,
    added_in_app: 1
  };
  const [first, second, other] = rows(db);
  expect(first).toEqual({ id: 1, ...converted });
  expect(second).toEqual({ id: 2, ...converted });
  expect(other).toMatchObject({
    id: 3,
    source: 'Suomalaiset rippi- ja lastenkirjat, 1657-1915',
    original_page: null,
    link_image: null,
    added_in_app: 0
  });
  // A rippikirja's entry records a household: RESI, with no Role.
  expect(
    db.query(`SELECT event, role FROM ${CITATIONS_READ} ORDER BY id`).all()
  ).toEqual([
    { event: 'RESI', role: null },
    { event: 'RESI', role: null },
    { event: 'Record', role: '10509:5001-:ab' }
  ]);
  // No longer a reference: a Citation of its Image, which keeps its Box.
  expect(citations.ofPerson(1)).toMatchObject([
    {
      reference: null,
      entry: 'Image 13',
      record: null,
      madeInApp: true
    }
  ]);
  expect(await citations.volumeChoices(1)).toBeNull();
  expect(
    await citations.mark(1, { volumeId: 'juva-1', image: 14, box: MOVED })
  ).toHaveProperty('resolution.links');
  // Its Entry moves, for everyone citing it (ADR-0026).
  expect(rows(db).map((r) => r.link_image)).toEqual([14, 14, null]);
  // Nothing brings it back now (ADR-0021), so it can be deleted.
  expect(citations.uncite(1)).toMatchObject({ citation: { id: 1 } });
});

test('a Mark at the Image only leaves the reference as it is', async () => {
  const { db, citations } = dataset();
  await citations.mark(1, { volumeId: 'juva-1', image: 13, box: null });
  expect(rows(db).map((r) => [r.link_image, r.added_in_app])).toEqual([
    [13, 0],
    [13, 0],
    [null, 0]
  ]);
  expect(citations.ofPerson(1)).toMatchObject([{ madeInApp: false }]);
});

test('confirming a Match converts it', async () => {
  const { db, citations } = dataset();
  db.run(
    `UPDATE citations SET link_volume_id = 'juva-1', link_volume = ?,
       link_image = 13, link_file_id = 'juva-1-f13', link_box_left = 100,
       link_box_top = 200, link_box_width = 500, link_box_height = 50,
       link_by = 'vision'
     WHERE id = 3`,
    [VOLUMES['juva-1']]
  );
  await citations.mark(3, { volumeId: 'juva-1', image: 13 });
  expect(rows(db).at(-1)).toMatchObject({
    source: VOLUMES['juva-1'],
    link_image: 13,
    added_in_app: 1
  });
});
