// Where a reference's page is estimated, with no pins but what the data
// folder has saved: none ship with the app (ADR-0031).

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { memoryParishes } from '../astia/parishes';
import { juvaAstia, rippiCitation } from '../astia/test-parish';
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

test('a page survey replacing the last puts its Page pins in their place', async () => {
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
    const shown = await scans.pagesInVolume('juva-1');
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
