// Where a reference's page is estimated, with no pins but what the data
// folder has saved: none ship with the app (ADR-0031).

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { juvaAstia, rippiCitation } from '../astia/test-parish';
import { churchBookRefOf } from './record';
import { citing, scansOf } from './test-pins';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'estimates-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// The Images the cited page links in a Volume of 20 Images with no pins.
async function imagesAt(page: number) {
  const cited = rippiCitation(5000, '1790 - 1796', page);
  const db = citing([cited], join(dir, `${page}.sqlite`));
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
