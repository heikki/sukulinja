// Resolution after Astia re-scans a Volume: pins made on the filming it
// replaced are left out.

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MemoryAstia } from '../astia/memory-astia';
import { juvaAstia, rippiCitation as citation } from '../astia/test-parish';
import { churchBookRefOf } from './record';
import { citing, scansOf } from './test-pins';

let dir = '';
let db: Database = citing([]);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rescanned-'));
  db = citing([]);
});
afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

function scans(astia: MemoryAstia) {
  return scansOf(dir, db, { astia });
}

// The citation's reference, the dataset citing it.
function refOf(c: { page: string; text: string }) {
  const cited = db
    .query('SELECT 1 FROM citations WHERE COALESCE(original_page, page) = ?')
    .get(c.page);
  if (cited === null) {
    db.run(
      "INSERT INTO citations (scope_type, scope_id, page, text) VALUES ('person', 1, ?, ?)",
      [c.page, c.text]
    );
  }
  return churchBookRefOf(c.page, c.text)!;
}

async function linksOf(c: { page: string; text: string }, astia: MemoryAstia) {
  const resolved = await scans(astia).resolveRef(refOf(c));
  return 'links' in resolved ? resolved.links : resolved;
}

// Astia's Juva archive, with juva-1 and juva-2 filmed anew and their
// lists already fetched again.
async function rescanned(astia: MemoryAstia) {
  for (const id of ['juva-1', 'juva-2']) {
    astia.rescan(id, 20);
    // eslint-disable-next-line no-await-in-loop -- two Volumes
    await astia.refreshImages(id);
  }
}

test('pins made on a filming Astia has replaced are left out', async () => {
  const astia = juvaAstia();
  const marked = citation(5000, '1790 - 1796', 12);
  const neighbour = citation(9000, '1790 - 1796', 15);
  await scans(astia).markRef(refOf(marked), { volumeId: 'juva-1', image: 7 });
  // Counted from the Page pin the Mark saved.
  expect(await linksOf(neighbour, astia)).toEqual([
    expect.objectContaining({ image: 10, certainty: 'estimated' })
  ]);
  await rescanned(astia);
  // Both counted from the Book's usual numbering again.
  expect(await linksOf(marked, astia)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-1',
      image: 12,
      certainty: 'estimated',
      from: 'numbering'
    })
  ]);
  expect(await linksOf(neighbour, astia)).toEqual([
    expect.objectContaining({ image: 15, from: 'numbering' })
  ]);
});

test("a Reference pin made on a replaced filming is left out, the Record range it set isn't", async () => {
  const astia = juvaAstia();
  const marked = citation(5000, '1790 - 1796', null);
  await scans(astia).markRef(refOf(marked), { volumeId: 'juva-2', image: 3 });
  await rescanned(astia);
  expect(await linksOf(marked, astia)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-2',
      precision: 'volume',
      certainty: 'estimated'
    })
  ]);
});

test('a Volume found re-scanned is read-only until switched', async () => {
  const astia = juvaAstia();
  const marked = citation(5000, '1790 - 1796', 12);
  const app = scans(astia);
  await app.markRef(refOf(marked), { volumeId: 'juva-1', image: 7 });
  astia.rescan('juva-1', 20);
  // Not known yet: a change still goes through.
  expect(
    await app.markRef(refOf(marked), { volumeId: 'juva-1', image: 8 })
  ).toHaveProperty('links');
  await astia.peekImages('juva-1');
  const refused = {
    rejected:
      'Astia has re-scanned this Volume. It can be changed once switched to the new filming.'
  };
  expect(
    await app.markRef(refOf(marked), { volumeId: 'juva-1', image: 9 })
  ).toEqual(refused);
  expect(await app.markRef(refOf(marked), { volumeId: 'juva-1' })).toEqual(
    refused
  );
  expect(
    await app.discardRef(refOf(marked), { volumeId: 'juva-1', image: 8 })
  ).toEqual(refused);
  await astia.refreshImages('juva-1');
  expect(
    await app.markRef(refOf(marked), { volumeId: 'juva-1', image: 9 })
  ).toHaveProperty('links');
});
