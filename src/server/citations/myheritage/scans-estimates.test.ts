// Where a reference's page is estimated, with no pins but what the data
// folder has saved: none ship with the app (ADR-0031).

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { memoryParishes } from '../astia/parishes';
import { juvaAstia, rippiCitation, VOLUMES } from '../astia/test-parish';
import { openMarks } from './pins/marks';
import { churchBookRefOf, markKey } from './record';
import { openScanFolder } from './scans';
import { citing, scansOf } from './test-pins';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'estimates-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// The Images record 5000's cited page links in juva-1, a Volume of 20
// Images, with the Record pins `marked` gives (record → Image) in the
// dataset.
async function imagesAt(page: number, marked: Record<number, number> = {}) {
  const cited = rippiCitation(5000, '1790 - 1796', page);
  const others = Object.entries(marked).map(([record, image]) => ({
    image,
    citation: rippiCitation(Number(record), '1790 - 1796', null)
  }));
  const db = citing(
    [cited, ...others.map((o) => o.citation)],
    join(dir, `${page}-${others.length}.sqlite`)
  );
  const marks = openMarks(db);
  for (const { image, citation } of others) {
    const ref = churchBookRefOf(citation.page, citation.text)!;
    const on = { volumeId: 'juva-1', volume: 'I Aa:1', by: 'hand' as const };
    marks.write(markKey(ref), { ...on, image });
  }
  try {
    const scans = scansOf(dir, db, { astia: juvaAstia() });
    const resolved = await scans.resolveRef(
      churchBookRefOf(cited.page, cited.text)!
    );
    return 'links' in resolved
      ? resolved.links.map((l) => ('image' in l ? l.image : null))
      : resolved;
  } finally {
    db.close();
  }
}

test('a new data folder has no pins: a page is counted from the first Image', async () => {
  expect(await imagesAt(12)).toEqual([12]);
});

test("a page whose spreads wouldn't fit the Volume is counted by page", async () => {
  expect(await imagesAt(30)).toEqual([16]);
});

// juva-1 numbering pages 1–9 twice, on Images 1–9 and 11–19.
async function numberedTwice() {
  const pages = [1, 9, 11, 19].map((image) => ({
    image,
    pages: [image > 10 ? image - 10 : image]
  }));
  await Bun.write(
    join(dir, 'pins.local.json'),
    JSON.stringify({ volumes: { 'juva-1': { pages } }, references: {} })
  );
}

test('a Volume numbering its pages over again places a page in the first run', async () => {
  await numberedTwice();
  expect(await imagesAt(5)).toEqual([5]);
});

test('the Record pins around a record say which run its page is in', async () => {
  await numberedTwice();
  expect(await imagesAt(5, { 4000: 10 })).toEqual([15]);
  expect(await imagesAt(5, { 6000: 10 })).toEqual([5]);
});

test('a page survey saves what it read as Page pins, which the estimates count from', async () => {
  const folder = openScanFolder(dir, {
    astia: juvaAstia(),
    parishes: memoryParishes()
  });
  // Two covers, then one number a spread.
  const reader = {
    pageNumbers: async ({ image }: { image: number }) =>
      await Promise.resolve(
        image <= 2 ? { unreadable: true as const } : { pages: [image - 2] }
      )
  };
  const survey = await folder.surveyPages('juva-1', 'I Aa:1', reader);
  expect(survey).toMatchObject({ settled: true, pinned: 2 });
  expect(await imagesAt(12)).toEqual([14]);
});

test('a page survey replacing the last puts its Page pins in their place, hand ones too', async () => {
  const folder = openScanFolder(dir, {
    astia: juvaAstia(),
    parishes: memoryParishes()
  });
  function offBy(covers: number) {
    return {
      pageNumbers: async ({ image }: { image: number }) =>
        await Promise.resolve(
          image <= covers
            ? { unreadable: true as const }
            : { pages: [image - covers] }
        )
    };
  }
  await folder.surveyPages('juva-1', 'I Aa:1', offBy(2));
  // A page set by hand goes too: the Scan viewer warns of it first.
  const at = { volumeId: 'juva-1', volume: 'I Aa:1', image: 5 };
  await folder.setImagePage(at, [12]);
  expect(await imagesAt(12)).toEqual([5]);
  await folder.surveyPages('juva-1', 'I Aa:1', offBy(4), {
    replace: true
  });
  expect(await imagesAt(12)).toEqual([16]);
});

test("each Image's pages are those its Page pin gives, or counted from the pins around it", async () => {
  // A leaf missing after page 5: page 10 is on Image 9.
  const pages = [
    { image: 3, pages: [3], by: 'vision' },
    { image: 9, pages: [10] }
  ];
  await Bun.write(
    join(dir, 'pins.local.json'),
    JSON.stringify({ volumes: { 'juva-1': { pages } }, references: {} })
  );
  const db = citing([], join(dir, 'pages.sqlite'));
  try {
    const scans = scansOf(dir, db, { astia: juvaAstia() });
    const shown = await scans.pagesInVolume('juva-1', 'I Aa:1');
    expect(shown.find((p) => p.image === 3)).toEqual({
      image: 3,
      pages: [3],
      by: 'vision'
    });
    expect(shown.find((p) => p.image === 9)).toEqual({
      image: 9,
      pages: [10],
      by: 'hand'
    });
    // Before the first pin and after the last, at its pace; between them,
    // spread over the gap as an estimate is.
    expect(shown.find((p) => p.image === 1)).toMatchObject({ pages: [1] });
    expect(shown.find((p) => p.image === 6)).toMatchObject({
      pages: [7],
      by: null
    });
    expect(shown.find((p) => p.image === 20)).toMatchObject({ pages: [21] });
  } finally {
    db.close();
  }
});

test('without Page pins, each Image has the page its book is numbered with', async () => {
  const db = citing([], join(dir, 'numbered.sqlite'));
  try {
    const scans = scansOf(dir, db, { astia: juvaAstia() });
    const rippi = await scans.pagesInVolume('juva-1', VOLUMES['juva-1']);
    expect(rippi.slice(0, 2)).toEqual([
      { image: 1, pages: [1], by: null },
      { image: 2, pages: [2], by: null }
    ]);
    const lasten = await scans.pagesInVolume('juva-2', 'I Ab:1 Lastenkirjat');
    expect(lasten[0]).toEqual({ image: 2, pages: [2, 3], by: null });
  } finally {
    db.close();
  }
});

test('a page set by hand on an Image keeps the same page on another', async () => {
  // A page filmed twice: page 12 on Images 12 and 13.
  const folder = openScanFolder(dir, {
    astia: juvaAstia(),
    parishes: memoryParishes()
  });
  const at = { volumeId: 'juva-1', volume: 'I Aa:1', image: 12 };
  await folder.setImagePage(at, [12]);
  await folder.setImagePage({ ...at, image: 13 }, [12]);
  const db = citing([], join(dir, 'twice.sqlite'));
  try {
    const scans = scansOf(dir, db, { astia: juvaAstia() });
    const shown = await scans.pagesInVolume('juva-1', 'I Aa:1');
    expect(shown.filter((p) => p.by === 'hand').map((p) => p.image)).toEqual([
      12, 13
    ]);
  } finally {
    db.close();
  }
});

test('an Image set to have no page is left out of the counting', async () => {
  const folder = openScanFolder(dir, {
    astia: juvaAstia(),
    parishes: memoryParishes()
  });
  const at = { volumeId: 'juva-1', volume: 'I Aa:1', image: 3 };
  // Counted from the book's first Image, then from a page set by hand.
  await folder.setImagePage(at, []);
  expect(await imagesAt(12)).toEqual([13]);
  await folder.setImagePage({ ...at, image: 5 }, [40]);
  await folder.setImagePage({ ...at, image: 7 }, []);
  expect(await imagesAt(45)).toEqual([11]);
  const db = citing([], join(dir, 'none.sqlite'));
  try {
    const scans = scansOf(dir, db, { astia: juvaAstia() });
    const shown = await scans.pagesInVolume('juva-1', 'I Aa:1');
    expect(shown.slice(4, 8)).toEqual([
      { image: 5, pages: [40], by: 'hand' },
      { image: 6, pages: [41], by: null },
      { image: 7, pages: [], by: 'hand' },
      { image: 8, pages: [42], by: null }
    ]);
  } finally {
    db.close();
  }
});

test("a Volume's page numbers cleared count it as its book is numbered", async () => {
  const folder = openScanFolder(dir, {
    astia: juvaAstia(),
    parishes: memoryParishes()
  });
  const at = { volumeId: 'juva-1', volume: 'I Aa:1', image: 5 };
  await folder.setImagePage(at, [40]);
  await folder.setImagePage({ ...at, image: 2 }, []);
  expect(await imagesAt(45)).toEqual([10]);
  expect(await folder.clearVolumePages('juva-1')).toBeNull();
  expect(await imagesAt(12)).toEqual([12]);
});

test('a page the vision model read can be taken away, leaving the Image counted', async () => {
  // Image 5 misread as page 40: the pages after it count from there.
  await Bun.write(
    join(dir, 'pins.local.json'),
    JSON.stringify({
      volumes: {
        'juva-1': { pages: [{ image: 5, pages: [40], by: 'vision' }] }
      },
      references: {}
    })
  );
  expect(await imagesAt(45)).toEqual([10]);
  const folder = openScanFolder(dir, {
    astia: juvaAstia(),
    parishes: memoryParishes()
  });
  const at = { volumeId: 'juva-1', volume: 'I Aa:1', image: 5 };
  expect(await folder.setImagePage(at, null)).toBeNull();
  expect(await imagesAt(12)).toEqual([12]);
});

test('a page set on an Image by hand counts the Volume from it, and taken away no longer', async () => {
  const folder = openScanFolder(dir, {
    astia: juvaAstia(),
    parishes: memoryParishes()
  });
  const at = { volumeId: 'juva-1', volume: 'I Aa:1', image: 5 };
  expect(await folder.setImagePage(at, [40])).toBeNull();
  expect(await imagesAt(45)).toEqual([10]);
  expect(await folder.setImagePage(at, null)).toBeNull();
  expect(await imagesAt(12)).toEqual([12]);
  // A spread's two pages: two an Image from there.
  expect(await folder.setImagePage(at, [40, 41])).toBeNull();
  expect(await imagesAt(44)).toEqual([7]);
  expect(await folder.setImagePage({ ...at, image: 99 }, [40])).toEqual({
    rejected: 'The volume has no such image.'
  });
});
