import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { Pins } from './locate';
import { openMarks } from './marks';
import type { BoxAt, MarkTarget } from './pins';
import shipped from './pins.json';
import { markKey } from './record';
import { BOX, citing, listedAstia, pinsOf, ref, vision } from './test-pins';

let dir = '';
let lists: Record<string, string[]> = {};
let db: Database = citing([]);
const ASTIA = listedAstia(() => lists);

// The records the tests mark, each cited once, and a reference with no
// Record number.
const CITED = [150, 160, 12, 50, 250, 450, 650, 800, 5000, null].map(
  (r) => ref(r).url
);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pins-'));
  lists = {};
  db = citing(CITED, join(dir, 'db.sqlite'));
});
afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const BASE: Pins['volumes'] = {
  a: {
    title: 'I Aa:1',
    pages: [{ image: 10, pages: [20] }],
    ranges: [{ from: 100, to: 200 }]
  }
};

function open(base = BASE) {
  return pinsOf(dir, db, { astia: ASTIA, base });
}

function localFile() {
  return join(dir, 'pins.local.json');
}

async function writeLocal(pins: Partial<Pins>) {
  await Bun.write(localFile(), JSON.stringify(pins));
}

function linked(volume = 'I Aa:1') {
  return { volume, linked: true };
}

function elsewhere(volume = 'I Aa:1') {
  return { volume, linked: false };
}

function at(volumeId: string, image: number): MarkTarget {
  return { volumeId, image };
}

function spot(volumeId: string, image: number): BoxAt {
  return { volumeId, image };
}

// ---------------------------------------------------------------- reading

test('reads the local pins over the base, but no Record pins left there', async () => {
  await writeLocal({
    volumes: {
      a: {
        pages: [{ image: 10, pages: [99] }],
        villages: ['Kylä'],
        ranges: [{ from: 300, to: 310 }],
        records: [{ record: 150, image: 10 }]
      },
      b: { title: 'I Aa:2', pages: [{ image: 2, pages: [3] }] }
    }
  });
  const { volumes, references } = await open().snapshot();
  expect(volumes.a).toEqual({
    title: 'I Aa:1',
    pages: [{ image: 10, pages: [99] }],
    villages: ['Kylä'],
    ranges: [
      { from: 100, to: 200 },
      { from: 300, to: 310 }
    ]
  });
  expect(volumes.b).toEqual({
    title: 'I Aa:2',
    pages: [{ image: 2, pages: [3] }]
  });
  expect(references).toEqual({});
  expect(BASE.a!.pages).toEqual([{ image: 10, pages: [20] }]);
});

test('reads over the shipped pins unless given a base', async () => {
  const { volumes } = await pinsOf(dir, db, { astia: ASTIA }).snapshot();
  expect(Object.keys(volumes)).toEqual(Object.keys(shipped.volumes));
});

test('ships only facts about Volumes, never Record or Reference pins', () => {
  expect(Object.keys(shipped)).toEqual(['volumes']);
  const volumes: Pins['volumes'] = shipped.volumes;
  for (const volume of Object.values(volumes)) {
    expect(volume.records).toBeUndefined();
  }
});

test('the stamp changes when another process saves, and so does the snapshot', async () => {
  const app = open();
  const other = citing([], join(dir, 'db.sqlite'));
  const pass = pinsOf(dir, other, { astia: ASTIA, base: BASE });
  const before = await app.stamp();
  expect((await app.snapshot()).volumes.b).toBeUndefined();
  await pass.recordVision(ref(5000), vision('b', 4));
  expect(await app.stamp()).not.toBe(before);
  expect((await app.snapshot()).volumes.b?.records).toEqual([
    { record: 5000, image: 4, by: 'vision', box: BOX }
  ]);
  other.close();
});

// ---------------------------------------------------------------- the citations

test('a Mark is written into every citation of the record, which then cites the Image', async () => {
  lists = { a: Array.from({ length: 20 }, (_, i) => `f${i + 1}`) };
  const three = citing(
    [ref(150).url, `${ref(150).url}&lang=fi`, ref(150).url, ref(160).url],
    join(dir, 'three.sqlite')
  );
  const pins = pinsOf(dir, three, { astia: ASTIA, base: BASE });
  await pins.recordMark(ref(150, 21), { ...at('a', 11), box: BOX }, linked());
  const rows = three
    .query(
      'SELECT page, original_page, link_image, link_box_left, link_by FROM citations ORDER BY id'
    )
    .all();
  const astia =
    'https://astia.narc.fi/uusiastia/viewer/?fileId=f11&aineistoId=a';
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
  const { references } = await pins.snapshot();
  expect(Object.keys(references).sort()).toEqual(
    [ref(150).url, `${ref(150).url}&lang=fi`].sort()
  );

  expect(await pins.recordDiscard(ref(150, 21), spot('a', 11))).toBe(true);
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

test('a Vision match keeps its page, and a Mark of only the Volume too', async () => {
  lists = { a: Array.from({ length: 20 }, (_, i) => `f${i + 1}`) };
  const pins = open();
  await pins.recordVision(ref(150), vision('a', 11));
  await pins.recordMark(ref(160), { volumeId: 'b' }, elsewhere('I Aa:2'));
  expect(
    db
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
  const pins = open();
  await pins.recordMark(ref(150, 21), at('a', 11), linked());
  // Marking page 21 again moves it rather than adding a second claim.
  await pins.recordMark(ref(150, 21), at('a', 12), linked());

  const a = (await pins.snapshot()).volumes.a!;
  expect(a.pages).toEqual([
    { image: 10, pages: [20] },
    { image: 12, pages: [21], note: 'marked in the app', by: 'hand' }
  ]);
  expect(a.records).toEqual([{ record: 150, image: 12, by: 'hand' }]);
});

test('a Volume numbered by page takes both pages of an Image', async () => {
  const pins = open({});
  const lasten = { ...ref(null, 40), kind: 'lasten' as const };
  await pins.recordMark(lasten, at('c', 5), linked('I Ab:1'));
  expect((await pins.snapshot()).volumes.c?.pages).toEqual([
    { image: 5, pages: [40, 41], note: 'marked in the app', by: 'hand' }
  ]);
});

test('a Mark outside the linked Volumes saves a Reference pin, which a linked Mark takes back', async () => {
  const pins = open();
  const cited = ref(null, 21);
  await pins.recordMark(cited, at('b', 3), elsewhere('I Aa:2'));
  expect((await pins.snapshot()).references).toEqual({
    [cited.url]: { volumeId: 'b', volume: 'I Aa:2', image: 3, by: 'hand' }
  });
  await pins.recordMark(cited, at('a', 11), linked());
  const { volumes, references } = await pins.snapshot();
  expect(references).toEqual({});
  expect(volumes.a!.pages.map((p) => p.image)).toEqual([10, 11]);
});

test('confirming a vision match by hand keeps its Box', async () => {
  const pins = open();
  await pins.recordVision(ref(150), vision('a', 11));
  await pins.recordMark(ref(150, 21), at('a', 11), linked());
  expect((await pins.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand', box: BOX }
  ]);
});

const DRAWN = { left: 200, top: 600, width: 400, height: 40 };

test('a Mark with a Box saves it on the Record pin', async () => {
  const pins = open();
  await pins.recordMark(ref(150, 21), { ...at('a', 11), box: DRAWN }, linked());
  expect((await pins.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand', box: DRAWN }
  ]);
});

test('a Mark with a Box of a reference with no record id saves it on the Reference pin', async () => {
  const pins = open();
  const index = ref(null);
  await pins.recordMark(
    index,
    { ...at('b', 5), box: DRAWN },
    elsewhere('I C:1')
  );
  expect((await pins.snapshot()).references[index.url]).toEqual({
    volumeId: 'b',
    volume: 'I C:1',
    image: 5,
    by: 'hand',
    box: DRAWN
  });
});

test('a page marked with a Box and no record id keeps the Box on a Reference pin beside the Page pin', async () => {
  const pins = open();
  const cited = ref(null, 21);
  await pins.recordMark(cited, { ...at('a', 11), box: DRAWN }, linked());
  const { volumes, references } = await pins.snapshot();
  expect(volumes.a!.pages.map((p) => p.image)).toEqual([10, 11]);
  expect(references[cited.url]).toEqual({
    volumeId: 'a',
    volume: 'I Aa:1',
    image: 11,
    by: 'hand',
    box: DRAWN
  });
  // Marked again without one, only the Page pin is left.
  await pins.recordMark(cited, { ...at('a', 11), box: null }, linked());
  expect((await pins.snapshot()).references).toEqual({});
});

test("a drawn Box replaces a vision match's, and none drops it", async () => {
  const pins = open();
  await pins.recordVision(ref(150), vision('a', 11));
  await pins.recordMark(ref(150, 21), { ...at('a', 11), box: DRAWN }, linked());
  expect((await pins.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand', box: DRAWN }
  ]);
  await pins.recordMark(ref(150, 21), { ...at('a', 11), box: null }, linked());
  expect((await pins.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand' }
  ]);
});

// ---------------------------------------------------------------- discarding

test("discarding a Mark's Box takes its pins back, leaving the Page pin", async () => {
  const pins = open();
  await pins.recordMark(ref(150, 21), { ...at('a', 11), box: DRAWN }, linked());
  expect(await pins.recordDiscard(ref(150, 21), spot('a', 11))).toBe(true);
  const { volumes, references } = await pins.snapshot();
  expect(volumes.a!.records).toBeUndefined();
  expect(volumes.a!.pages.map((p) => p.image)).toEqual([10, 11]);
  expect(references).toEqual({});
  const index = ref(null);
  await pins.recordMark(index, { ...at('b', 5), box: DRAWN }, elsewhere());
  expect(await pins.recordDiscard(index, spot('b', 5))).toBe(true);
  expect((await pins.snapshot()).references).toEqual({});
  // A Mark taken back is no Rejection: the model may match it again.
  expect(await pins.rejects(index, spot('b', 5))).toBe(false);
  expect(openMarks(db).rejections()).toEqual({});
});

test('discarding a Vision match rejects it there, and only there', async () => {
  const pins = open();
  await pins.recordVision(ref(150, 21), vision('a', 11, true));
  expect(await pins.recordDiscard(ref(150, 21), spot('a', 11))).toBe(true);
  const { volumes } = await pins.snapshot();
  expect(volumes.a!.records).toBeUndefined();
  // The Page pin the model read stays.
  expect(volumes.a!.pages.map((p) => p.image)).toEqual([10, 11]);
  expect(await pins.rejects(ref(150, 21), spot('a', 11))).toBe(true);
  expect(await pins.recordVision(ref(150, 21), vision('a', 11))).toBe(false);
  expect((await pins.snapshot()).volumes.a!.records).toBeUndefined();
  expect(await pins.recordVision(ref(150, 21), vision('a', 12))).toBe(true);
  expect((await pins.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 12, by: 'vision', box: BOX }
  ]);
});

test('a Discard finds no Box elsewhere, nor on a Mark without one', async () => {
  const pins = open();
  await pins.recordVision(ref(150), vision('a', 11));
  expect(await pins.recordDiscard(ref(150), spot('a', 12))).toBe(false);
  await pins.recordMark(ref(160, 21), at('a', 11), linked());
  expect(await pins.recordDiscard(ref(160, 21), spot('a', 11))).toBe(false);
  expect((await pins.snapshot()).volumes.a!.records).toHaveLength(2);
});

// ---------------------------------------------------------------- precedence

test('a vision pin never replaces a hand one', async () => {
  const pins = open();
  await pins.recordMark(ref(150, 21), at('a', 11), linked());
  await pins.recordVision(ref(150, 21), vision('a', 12, true));
  // Nor a Page pin of the base, which counts as by hand.
  await pins.recordVision(ref(160, 20), vision('a', 10, true));
  const index = ref(null);
  await pins.recordMark(index, at('b', 5), elsewhere('I C:1'));
  await pins.recordVision(index, vision('b', 6));

  const { volumes, references } = await pins.snapshot();
  expect(volumes.a!.pages).toEqual([
    { image: 10, pages: [20] },
    { image: 11, pages: [21], note: 'marked in the app', by: 'hand' }
  ]);
  expect(volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand' },
    { record: 160, image: 10, by: 'vision', box: BOX }
  ]);
  expect(references[index.url]).toEqual({
    volumeId: 'b',
    volume: 'I C:1',
    image: 5,
    by: 'hand'
  });
});

test('a hand pin replaces a vision one', async () => {
  const pins = open();
  await pins.recordVision(ref(150, 21), vision('a', 11, true));
  await pins.recordMark(ref(150, 21), at('a', 12), linked());
  const index = ref(null);
  await pins.recordVision(index, vision('b', 6));
  await pins.recordMark(index, at('b', 5), elsewhere('I C:1'));

  const { volumes, references } = await pins.snapshot();
  expect(volumes.a!.pages).toEqual([
    { image: 10, pages: [20] },
    { image: 12, pages: [21], note: 'marked in the app', by: 'hand' }
  ]);
  expect(volumes.a!.records).toEqual([{ record: 150, image: 12, by: 'hand' }]);
  expect(references[index.url]).toEqual({
    volumeId: 'b',
    volume: 'I C:1',
    image: 5,
    by: 'hand'
  });
});

test('a record pinned again moves to its new Image, in any Volume', async () => {
  const pins = open({});
  await pins.recordVision(ref(12), vision('x', 4));
  await pins.recordVision(ref(12), vision('y', 9));
  const { volumes } = await pins.snapshot();
  expect(volumes.x?.records).toBeUndefined();
  expect(volumes.y!.records).toEqual([
    { record: 12, image: 9, by: 'vision', box: BOX }
  ]);
});

// ---------------------------------------------------------------- ranges

test('a Record pin extends the nearest Record range of its Volume', async () => {
  const pins = open({
    a: {
      pages: [],
      ranges: [
        { from: 100, to: 200 },
        { from: 500, to: 600 }
      ]
    },
    b: { pages: [], ranges: [{ from: 300, to: 400 }] },
    c: { pages: [], ranges: [{ from: 1000, to: 1100 }] }
  });
  await pins.recordVision(ref(250), vision('a', 4));
  await pins.recordVision(ref(150), vision('a', 3));
  await pins.recordVision(ref(650), vision('a', 40));
  // Records 401–499 lie between b's range and a's: a's grows down to them.
  await pins.recordVision(ref(450), vision('a', 30));
  // c's nearest range is past a's 450–650: it can't grow over it.
  await pins.recordVision(ref(50), vision('c', 2));
  await pins.recordVision(ref(800), vision('d', 2));

  const { volumes } = await pins.snapshot();
  // The extended ranges stand in for the base ones they grew from.
  expect(volumes.a!.ranges).toEqual([
    { from: 100, to: 250 },
    { from: 450, to: 650 }
  ]);
  expect(volumes.c!.ranges).toEqual([{ from: 1000, to: 1100 }]);
  // A Volume with no range starts one.
  expect(volumes.d!.ranges).toEqual([{ from: 800, to: 800 }]);
});

// ---------------------------------------------------------------- filmings

// Volume a's file ids in one filming: `a-<filming><n>`.
function filming(name: string) {
  return Array.from({ length: 50 }, (_, i) => `a-${name}${i + 1}`);
}

test('a pin on an Image saves its file id', async () => {
  lists = { a: filming('new') };
  const pins = open();
  await pins.recordMark(ref(150, 21), at('a', 11), linked());
  await pins.recordMark(ref(null), { volumeId: 'b', image: 4 }, elsewhere());
  const { volumes, references } = await pins.snapshot();
  expect(volumes.a!.pages.at(-1)?.fileId).toBe('a-new11');
  expect(volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand', fileId: 'a-new11' }
  ]);
  // Astia lists no Images for b: no file id to save.
  expect(references[ref(null).url]).toEqual({
    volumeId: 'b',
    volume: 'I Aa:1',
    image: 4,
    by: 'hand'
  });
});

test('a hand pin made on another filming never keeps a vision pin out', async () => {
  lists = { a: filming('new') };
  await writeLocal({
    volumes: {
      a: {
        pages: [
          { image: 12, pages: [30], by: 'hand', fileId: 'a-old12' },
          { image: 20, pages: [40], by: 'hand', fileId: 'a-new20' }
        ]
      }
    },
    references: {}
  });
  const marks = openMarks(db);
  const on = { volumeId: 'a', volume: 'I Aa:1', by: 'hand' as const };
  marks.write(markKey(ref(150)), { ...on, image: 12, fileId: 'a-old12' });
  marks.write(markKey(ref(160)), { ...on, image: 20, fileId: 'a-new20' });
  const pins = open();
  await pins.recordVision(ref(150, 30), vision('a', 13, true));
  await pins.recordVision(ref(160, 40), vision('a', 21, true));
  const a = (await pins.snapshot()).volumes.a!;
  expect(a.records).toEqual([
    { record: 150, image: 13, by: 'vision', box: BOX, fileId: 'a-new13' },
    { record: 160, image: 20, by: 'hand', fileId: 'a-new20' }
  ]);
  expect(a.pages).toEqual([
    { image: 10, pages: [20] },
    {
      image: 13,
      pages: [30],
      note: 'read by the vision model',
      by: 'vision',
      fileId: 'a-new13'
    },
    { image: 20, pages: [40], by: 'hand', fileId: 'a-new20' }
  ]);
});

test('a Rejection holds on the filming it was made on', async () => {
  lists = { a: filming('new') };
  const pins = open();
  await pins.recordVision(ref(150), vision('a', 12));
  expect(await pins.recordDiscard(ref(150), spot('a', 12))).toBe(true);
  expect(await pins.rejects(ref(150), spot('a', 12))).toBe(true);
  expect(openMarks(db).rejections()[ref(150).url]).toEqual([
    { volumeId: 'a', image: 12, fileId: 'a-new12' }
  ]);
  lists = { a: filming('newer') };
  expect(await pins.rejects(ref(150), spot('a', 12))).toBe(false);
  expect(await pins.recordVision(ref(150), vision('a', 12))).toBe(true);
  expect((await pins.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 12, by: 'vision', box: BOX, fileId: 'a-newer12' }
  ]);
});
