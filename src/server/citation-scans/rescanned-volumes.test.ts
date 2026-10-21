// Resolution after Astia re-scans a Volume: pins made on the filming it
// replaced are left out.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { MemoryAstia } from './memory-astia';
import { openPins } from './pins';
import { churchBookRefOf } from './record';
import { openScans } from './scans';
import { rippiCitation as citation, juvaAstia } from './test-parish';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rescanned-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function scans(astia: MemoryAstia) {
  return openScans({ pins: openPins(dir, { astia }), astia });
}

function refOf(c: { page: string; text: string }) {
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
