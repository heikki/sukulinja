// Marks and Discards, saved through a dataset's Scans: what resolution then
// reads, and what the dataset's citations hold.

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CITATIONS_READ } from '../entries/storage';
import type { Pins } from '../volume-facts';
import type { BoxAt, MarkTarget } from './pins/pins';
import {
  BOX,
  CITED,
  citing,
  LABELS,
  match,
  pinsParish,
  ref,
  scansOf,
  SIZE,
  writeBase
} from './test-pins';

let dir = '';
// The dataset citing CITED, and the parish its Scans read.
let cited: Database = citing([]);
let parish = pinsParish();

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scans-'));
  cited = citing(CITED, join(dir, 'cited.sqlite'));
  parish = pinsParish();
  await writeBase(dir);
});
afterEach(async () => {
  cited.close();
  await rm(dir, { recursive: true, force: true });
});

function open(on = cited) {
  return scansOf(dir, on, {
    astia: parish,
    sizeOf: async () => await Promise.resolve(SIZE)
  });
}

function at(volumeId: string, image: number): MarkTarget {
  return { volumeId, image };
}

function spot(volumeId: string, image: number): BoxAt {
  return { volumeId, image };
}

async function writePins(pins: Partial<Pins>) {
  await Bun.write(join(dir, 'pins.local.json'), JSON.stringify(pins));
}

test('reads the local pins, but no Record pins left there', async () => {
  await writePins({
    volumes: {
      a: {
        title: 'I Aa:1',
        pages: [{ image: 10, pages: [99] }],
        villages: ['Kylä'],
        ranges: [{ from: 300, to: 310 }],
        records: [{ record: 150, image: 10 }]
      },
      b: { title: 'I Aa:2', pages: [{ image: 2, pages: [3] }] }
    }
  });
  const { volumes, references } = await open().snapshot();
  // Filled in with file ids from the Volumes' lists, once read.
  expect(volumes.a).toEqual({
    title: 'I Aa:1',
    pages: [{ image: 10, pages: [99], fileId: 'a-f10' }],
    villages: ['Kylä'],
    ranges: [{ from: 300, to: 310 }]
  });
  expect(volumes.b).toEqual({
    title: 'I Aa:2',
    pages: [{ image: 2, pages: [3], fileId: 'b-f2' }]
  });
  expect(references).toEqual({});
});

test('starts with no pins in a new data folder', async () => {
  const fresh = await mkdtemp(join(tmpdir(), 'scans-fresh-'));
  try {
    const scans = scansOf(fresh, cited, { astia: parish });
    expect(await scans.snapshot()).toEqual({ volumes: {}, references: {} });
  } finally {
    await rm(fresh, { recursive: true, force: true });
  }
});

test('the stamp changes when another process saves, and so does the snapshot', async () => {
  const app = open();
  const other = citing([], join(dir, 'cited.sqlite'));
  const before = await app.stamp();
  expect((await app.snapshot()).volumes.b).toBeUndefined();
  await open(other).saveMatch(ref(5000), match('b', 4));
  expect(await app.stamp()).not.toBe(before);
  expect((await app.snapshot()).volumes.b?.records).toEqual([
    { record: 5000, image: 4, by: 'vision', box: BOX, fileId: 'b-f4' }
  ]);
  other.close();
});

// ---------------------------------------------------------------- the citations

test('a Mark is written into every citation of the record, which then cites the Image', async () => {
  const three = citing(
    [ref(150).url, `${ref(150).url}&lang=fi`, ref(150).url, ref(160).url],
    join(dir, 'three.sqlite')
  );
  const scans = open(three);
  expect(
    await scans.markRef(ref(150, 21), { ...at('a', 11), box: BOX })
  ).toMatchObject({
    resolution: { links: [{ image: 11 }] },
    done: { confirmed: false, citations: 3 }
  });
  const rows = three
    .query(
      'SELECT page, original_page, link_image, link_box_left, link_by FROM citations ORDER BY id'
    )
    .all();
  const astia =
    'https://astia.narc.fi/uusiastia/viewer/?fileId=a-f11&aineistoId=a';
  expect(rows).toEqual([
    {
      page: astia,
      original_page: ref(150).url,
      link_image: 11,
      link_box_left: 100,
      link_by: 'hand'
    },
    {
      page: astia,
      original_page: `${ref(150).url}&lang=fi`,
      link_image: 11,
      link_box_left: 100,
      link_by: 'hand'
    },
    {
      page: astia,
      original_page: ref(150).url,
      link_image: 11,
      link_box_left: 100,
      link_by: 'hand'
    },
    {
      page: ref(160).url,
      original_page: null,
      link_image: null,
      link_box_left: null,
      link_by: null
    }
  ]);
  // Every reference citing the record has the Link.
  const { references } = await scans.snapshot();
  expect(Object.keys(references).sort()).toEqual(
    [ref(150).url, `${ref(150).url}&lang=fi`].sort()
  );

  expect(await scans.discardRef(ref(150, 21), spot('a', 11))).toHaveProperty(
    'resolution.links'
  );
  expect(
    three
      .query('SELECT page, original_page, link_by FROM citations ORDER BY id')
      .all()
  ).toEqual([
    { page: ref(150).url, original_page: null, link_by: null },
    { page: `${ref(150).url}&lang=fi`, original_page: null, link_by: null },
    { page: ref(150).url, original_page: null, link_by: null },
    { page: ref(160).url, original_page: null, link_by: null }
  ]);
  three.close();
});

test('a Match keeps its page, and a Mark of only the Volume too', async () => {
  const scans = open();
  await scans.saveMatch(ref(150), match('a', 11));
  await scans.markRef(ref(160), { volumeId: 'b' });
  expect(
    cited
      .query(
        'SELECT page, original_page, link_volume_id, link_by FROM citations WHERE link_by IS NOT NULL ORDER BY id'
      )
      .all()
  ).toEqual([
    {
      page: ref(150).url,
      original_page: null,
      link_volume_id: 'a',
      link_by: 'vision'
    },
    {
      page: ref(160).url,
      original_page: null,
      link_volume_id: 'b',
      link_by: 'hand'
    }
  ]);
});

// ---------------------------------------------------------------- marks

test('a Mark of a page in a linked Volume saves a hand Page pin and Record pin', async () => {
  const scans = open();
  await scans.markRef(ref(150, 21), at('a', 11));
  // Marking page 21 again moves it rather than adding a second claim.
  await scans.markRef(ref(150, 21), at('a', 12));

  const a = (await scans.snapshot()).volumes.a!;
  expect(a.pages).toEqual([
    { image: 10, pages: [20], fileId: 'a-f10' },
    {
      image: 12,
      pages: [21],
      note: 'marked in the app',
      by: 'hand',
      fileId: 'a-f12'
    }
  ]);
  expect(a.records).toEqual([
    { record: 150, image: 12, by: 'hand', fileId: 'a-f12' }
  ]);
});

test('a Volume numbered by page takes both pages of an Image', async () => {
  await writeBase(dir, {});
  const scans = open();
  const lasten = { ...ref(null, 40), kind: 'lasten' as const };
  await scans.markRef(lasten, at('c', 5));
  expect((await scans.snapshot()).volumes.c?.pages).toEqual([
    {
      image: 5,
      pages: [40, 41],
      note: 'marked in the app',
      by: 'hand',
      fileId: 'c-f5'
    }
  ]);
});

test('a Mark outside the linked Volumes saves a Reference pin, which a linked Mark takes back', async () => {
  const scans = open();
  const page = ref(null, 21);
  await scans.markRef(page, at('b', 3));
  expect((await scans.snapshot()).references).toEqual({
    [page.url]: {
      volumeId: 'b',
      volume: LABELS.b,
      image: 3,
      by: 'hand',
      fileId: 'b-f3'
    }
  });
  await scans.markRef(page, at('a', 11));
  const { volumes, references } = await scans.snapshot();
  expect(references).toEqual({});
  expect(volumes.a!.pages.map((p) => p.image)).toEqual([10, 11]);
});

test('confirming a Match by hand keeps its Box', async () => {
  const scans = open();
  await scans.saveMatch(ref(150), match('a', 11));
  await scans.markRef(ref(150, 21), at('a', 11));
  expect((await scans.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand', box: BOX, fileId: 'a-f11' }
  ]);
});

const DRAWN = { left: 200, top: 600, width: 400, height: 40 };

test('a Mark with a Box saves it on the Record pin', async () => {
  const scans = open();
  await scans.markRef(ref(150, 21), { ...at('a', 11), box: DRAWN });
  expect((await scans.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand', box: DRAWN, fileId: 'a-f11' }
  ]);
});

test('a Mark with a Box of a reference with no record id saves it on the Reference pin', async () => {
  const scans = open();
  const index = ref(null);
  await scans.markRef(index, { ...at('b', 5), box: DRAWN });
  expect((await scans.snapshot()).references[index.url]).toEqual({
    volumeId: 'b',
    volume: LABELS.b,
    image: 5,
    by: 'hand',
    box: DRAWN,
    fileId: 'b-f5'
  });
});

test('a page marked with a Box and no record id keeps the Box on a Reference pin beside the Page pin', async () => {
  const scans = open();
  const page = ref(null, 21);
  await scans.markRef(page, { ...at('a', 11), box: DRAWN });
  const { volumes, references } = await scans.snapshot();
  expect(volumes.a!.pages.map((p) => p.image)).toEqual([10, 11]);
  expect(references[page.url]).toEqual({
    volumeId: 'a',
    volume: LABELS.a,
    image: 11,
    by: 'hand',
    box: DRAWN,
    fileId: 'a-f11'
  });
  // Marked again without one, only the Page pin is left.
  await scans.markRef(page, { ...at('a', 11), box: null });
  expect((await scans.snapshot()).references).toEqual({});
});

test("a drawn Box replaces a Match's, and none drops it", async () => {
  const scans = open();
  await scans.saveMatch(ref(150), match('a', 11));
  await scans.markRef(ref(150, 21), { ...at('a', 11), box: DRAWN });
  expect((await scans.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand', box: DRAWN, fileId: 'a-f11' }
  ]);
  await scans.markRef(ref(150, 21), { ...at('a', 11), box: null });
  expect((await scans.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand', fileId: 'a-f11' }
  ]);
});

// ---------------------------------------------------------------- discarding

test("discarding a Mark's Box takes its pins back, leaving the Page pin", async () => {
  const scans = open();
  await scans.markRef(ref(150, 21), { ...at('a', 11), box: DRAWN });
  expect(await scans.discardRef(ref(150, 21), spot('a', 11))).toMatchObject({
    resolution: { links: [{ certainty: 'estimated' }] },
    done: { match: false }
  });
  const { volumes, references } = await scans.snapshot();
  expect(volumes.a!.records).toBeUndefined();
  expect(volumes.a!.pages.map((p) => p.image)).toEqual([10, 11]);
  expect(references).toEqual({});
  const index = ref(null);
  await scans.markRef(index, { ...at('b', 5), box: DRAWN });
  expect(await scans.discardRef(index, spot('b', 5))).toHaveProperty(
    'resolution.links'
  );
  expect((await scans.snapshot()).references).toEqual({});
});

test('discarding a Match only undoes it: it may be saved there again', async () => {
  const scans = open();
  await scans.saveMatch(ref(150, 21), match('a', 11));
  expect(await scans.discardRef(ref(150, 21), spot('a', 11))).toMatchObject({
    done: { match: true }
  });
  const { volumes } = await scans.snapshot();
  expect(volumes.a!.records).toBeUndefined();
  expect(await scans.saveMatch(ref(150, 21), match('a', 11))).toBeNull();
  expect((await scans.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'vision', box: BOX, fileId: 'a-f11' }
  ]);
});

test('a Discard finds no Box elsewhere, nor on a Mark without one', async () => {
  const scans = open();
  const none = { rejected: 'There is no box there to discard.' };
  await scans.saveMatch(ref(150), match('a', 11));
  expect(await scans.discardRef(ref(150), spot('a', 12))).toEqual(none);
  await scans.markRef(ref(160, 21), at('a', 11));
  expect(await scans.discardRef(ref(160, 21), spot('a', 11))).toEqual(none);
  expect((await scans.snapshot()).volumes.a!.records).toHaveLength(2);
});

test('a Citation converted from a reference is a Record pin no Mark writes to', async () => {
  const two = citing([ref(150).url, ref(160).url], join(dir, 'two.sqlite'));
  await open(two).markRef(ref(150, 21), { ...at('a', 11), box: BOX });
  // Converted (ADR-0016): made in the app, its original page kept.
  two.run(
    `INSERT INTO entries (id, volume_id, volume, image, file_id, box_left,
       box_top, box_width, box_height)
     SELECT 1, link_volume_id, link_volume, link_image, link_file_id,
       link_box_left, link_box_top, link_box_width, link_box_height
     FROM citations WHERE id = 1`
  );
  two.run('UPDATE citations SET entry_id = 1 WHERE id = 1');

  const scans = open(two);
  const { volumes } = await scans.snapshot();
  const pins = (volumes.a?.records ?? []).map((r) => [r.record, r.image]);
  expect(pins).toContainEqual([150, 11]);
  await scans.markRef(ref(150, 21), { ...at('a', 12), box: BOX });
  const row = two
    .query(`SELECT link_image FROM ${CITATIONS_READ} WHERE id = 1`)
    .get();
  expect(row).toEqual({ link_image: 11 });
  two.close();
});
