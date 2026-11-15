// Where a reference's page is estimated, with no pins but what the data
// folder has saved: none ship with the app (ADR-0031).

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { juvaAstia, rippiCitation } from '../astia/test-parish';
import { openMarks } from './pins/marks';
import { churchBookRefOf, markKey } from './record';
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
