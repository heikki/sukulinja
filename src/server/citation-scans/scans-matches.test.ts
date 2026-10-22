// Matches, saved through a dataset's Scans: what resolution then
// reads, and what the dataset's citations hold.

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Pins } from './locate';
import { openMarks } from './marks';
import type { BoxAt, MarkTarget } from './pins';
import { markKey } from './record';
import {
  BASE,
  BOX,
  CITED,
  citing,
  LABELS,
  match,
  pinsParish,
  ref,
  scansOf,
  SIZE
} from './test-pins';

let dir = '';
// The dataset citing CITED, and the parish its Scans read.
let cited: Database = citing([]);
let parish = pinsParish();

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scans-'));
  cited = citing(CITED, join(dir, 'cited.sqlite'));
  parish = pinsParish();
});
afterEach(async () => {
  cited.close();
  await rm(dir, { recursive: true, force: true });
});

function open(base = BASE, on = cited) {
  return scansOf(dir, on, {
    astia: parish,
    base,
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

// ---------------------------------------------------------------- matches

test('a Match is saved in pixels of its Image', async () => {
  const scans = open();
  const read = { left: 0.1234, top: 0.4, width: 0.5, height: 0.0501 };
  expect(
    await scans.saveMatch(ref(150), { ...match('a', 11), box: read })
  ).toEqual({ saved: true });
  expect((await scans.snapshot()).volumes.a!.records).toEqual([
    {
      record: 150,
      image: 11,
      by: 'vision',
      box: { left: 123, top: 400, width: 500, height: 50 },
      fileId: 'a-f11'
    }
  ]);
});

test('a Match is refused where a Mark would be', async () => {
  const scans = open();
  expect(await scans.saveMatch(ref(150), match('a', 51))).toEqual({
    rejected: 'The volume has images 1–50.'
  });
  expect(await scans.saveMatch(ref(150), match('elsewhere', 4))).toEqual({
    rejected: "That Volume isn't in this parish's church books."
  });
  parish.rescan('a', 50);
  await parish.peekImages('a');
  expect(await scans.saveMatch(ref(150), match('a', 11))).toEqual({
    rejected:
      'Astia has re-scanned this Volume. It can be changed once switched to the new filming.'
  });
  expect((await scans.snapshot()).volumes.a!.records).toBeUndefined();
});

test("a Match's Box is cut at its Image's edges, and refused off it", async () => {
  const scans = open();
  const past = { left: 0.9, top: 0.4, width: 0.5, height: 1.2 };
  expect(
    await scans.saveMatch(ref(150), { ...match('a', 11), box: past })
  ).toEqual({ saved: true });
  // Rounded within the Image's edges, a Box past them is cut short.
  expect((await scans.snapshot()).volumes.a!.records![0]!.box).toEqual({
    left: 900,
    top: 400,
    width: 100,
    height: 600
  });
  const before = { left: -0.1, top: 0.4, width: 0.5, height: 0.05 };
  expect(
    await scans.saveMatch(ref(160), { ...match('a', 12), box: before })
  ).toEqual({
    rejected: 'The entry box must lie on the Image, in whole pixels.'
  });
});

test('a dry run checks a Match and saves nothing', async () => {
  const scans = open();
  expect(
    await scans.saveMatch(ref(150), match('a', 11), { dryRun: true })
  ).toEqual({ saved: true });
  expect(
    await scans.saveMatch(ref(150), match('a', 51), { dryRun: true })
  ).toEqual({ rejected: 'The volume has images 1–50.' });
  expect((await scans.snapshot()).volumes.a!.records).toBeUndefined();
});

// ---------------------------------------------------------------- precedence

test('a Match never replaces a hand pin', async () => {
  const scans = open();
  await scans.markRef(ref(150, 21), at('a', 11));
  await scans.saveMatch(ref(150, 21), match('a', 12, true));
  // Nor a Page pin of the base, which counts as by hand.
  await scans.saveMatch(ref(160, 20), match('a', 10, true));
  const index = ref(null);
  await scans.markRef(index, at('b', 5));
  await scans.saveMatch(index, match('b', 6));

  const { volumes, references } = await scans.snapshot();
  expect(volumes.a!.pages).toEqual([
    { image: 10, pages: [20] },
    {
      image: 11,
      pages: [21],
      note: 'marked in the app',
      by: 'hand',
      fileId: 'a-f11'
    }
  ]);
  expect(volumes.a!.records).toEqual([
    { record: 150, image: 11, by: 'hand', fileId: 'a-f11' },
    { record: 160, image: 10, by: 'vision', box: BOX, fileId: 'a-f10' }
  ]);
  expect(references[index.url]).toEqual({
    volumeId: 'b',
    volume: LABELS.b,
    image: 5,
    by: 'hand',
    fileId: 'b-f5'
  });
});

test('a hand pin replaces a Match', async () => {
  const scans = open();
  await scans.saveMatch(ref(150, 21), match('a', 11, true));
  await scans.markRef(ref(150, 21), at('a', 12));
  const index = ref(null);
  await scans.saveMatch(index, match('b', 6));
  await scans.markRef(index, at('b', 5));

  const { volumes, references } = await scans.snapshot();
  expect(volumes.a!.pages).toEqual([
    { image: 10, pages: [20] },
    {
      image: 12,
      pages: [21],
      note: 'marked in the app',
      by: 'hand',
      fileId: 'a-f12'
    }
  ]);
  expect(volumes.a!.records).toEqual([
    { record: 150, image: 12, by: 'hand', fileId: 'a-f12' }
  ]);
  expect(references[index.url]).toEqual({
    volumeId: 'b',
    volume: LABELS.b,
    image: 5,
    by: 'hand',
    fileId: 'b-f5'
  });
});

test('a record pinned again moves to its new Image, in any Volume', async () => {
  const scans = open({});
  await scans.saveMatch(ref(12), match('x', 4));
  await scans.saveMatch(ref(12), match('y', 9));
  const { volumes } = await scans.snapshot();
  expect(volumes.x?.records).toBeUndefined();
  expect(volumes.y!.records).toEqual([
    { record: 12, image: 9, by: 'vision', box: BOX, fileId: 'y-f9' }
  ]);
});

// ---------------------------------------------------------------- ranges

test('a Record pin extends the nearest Record range of its Volume', async () => {
  const scans = open({
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
  await scans.saveMatch(ref(250), match('a', 4));
  await scans.saveMatch(ref(150), match('a', 3));
  await scans.saveMatch(ref(650), match('a', 40));
  // Records 401–499 lie between b's range and a's: a's grows down to them.
  await scans.saveMatch(ref(450), match('a', 30));
  // c's nearest range is past a's 450–650: it can't grow over it.
  await scans.saveMatch(ref(50), match('c', 2));
  await scans.saveMatch(ref(800), match('d', 2));

  const { volumes } = await scans.snapshot();
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

test('a hand pin made on another filming never keeps a Match out', async () => {
  await writePins({
    volumes: {
      a: {
        pages: [
          { image: 12, pages: [30], by: 'hand', fileId: 'a-old12' },
          { image: 20, pages: [40], by: 'hand', fileId: 'a-f20' }
        ]
      }
    },
    references: {}
  });
  const marks = openMarks(cited);
  const on = { volumeId: 'a', volume: LABELS.a, by: 'hand' as const };
  marks.write(markKey(ref(150)), { ...on, image: 12, fileId: 'a-old12' });
  marks.write(markKey(ref(160)), { ...on, image: 20, fileId: 'a-f20' });
  const scans = open();
  await scans.saveMatch(ref(150, 30), match('a', 13, true));
  await scans.saveMatch(ref(160, 40), match('a', 21, true));
  const a = (await scans.snapshot()).volumes.a!;
  expect(a.records).toEqual([
    { record: 150, image: 13, by: 'vision', box: BOX, fileId: 'a-f13' },
    { record: 160, image: 20, by: 'hand', fileId: 'a-f20' }
  ]);
  expect(a.pages).toEqual([
    { image: 10, pages: [20] },
    {
      image: 13,
      pages: [30],
      note: 'read by the vision model',
      by: 'vision',
      fileId: 'a-f13'
    },
    { image: 20, pages: [40], by: 'hand', fileId: 'a-f20' }
  ]);
});

test('a Rejection holds on the filming it was made on', async () => {
  const scans = open();
  await scans.saveMatch(ref(150), match('a', 12));
  expect(await scans.discardRef(ref(150), spot('a', 12))).toHaveProperty(
    'links'
  );
  expect(await scans.isRejected(ref(150), spot('a', 12))).toBe(true);
  expect(openMarks(cited).rejections()[ref(150).url]).toEqual([
    { volumeId: 'a', image: 12, fileId: 'a-f12' }
  ]);
  // Switched to Astia's new filming.
  parish.rescan('a', 50);
  await parish.refreshImages('a');
  expect(await scans.isRejected(ref(150), spot('a', 12))).toBe(false);
  expect(await scans.saveMatch(ref(150), match('a', 12))).toEqual({
    saved: true
  });
  expect((await scans.snapshot()).volumes.a!.records).toEqual([
    { record: 150, image: 12, by: 'vision', box: BOX, fileId: 'a-2-f12' }
  ]);
});
