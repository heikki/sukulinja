import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { loadAnchors, loadPlacements } from './anchors';
import { churchBookRefOf, parseChurchBookRef } from './record';
import { markRef, matchCandidates, resolveRef, useDataFolder } from './scans';
import { rippiCitation as citation, seedParish, VOLUMES } from './test-parish';

let dir = '';

const astia = spyOn(globalThis, 'fetch').mockImplementation((() => {
  throw new Error('no requests to Astia in these tests');
}) as unknown as typeof fetch);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scans-'));
  await seedParish(dir);
  useDataFolder(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
afterAll(() => {
  astia.mockRestore();
});

async function writeLocal(anchors: unknown) {
  await Bun.write(join(dir, 'anchors.local.json'), JSON.stringify(anchors));
  useDataFolder(dir);
}

function refOf(c: { page: string; text: string }) {
  return churchBookRefOf(c.page, c.text)!;
}

async function scanOf(c: { page: string; text: string }) {
  const resolved = await resolveRef(refOf(c));
  return 'scans' in resolved ? resolved.scans : resolved;
}

test('marking a record with a Record number saves a hand Seen record', async () => {
  const marked = citation(5000, '1790 - 1796', 12);
  await markRef(refOf(marked), { volumeId: 'juva-1', image: 7 });

  expect(await scanOf(marked)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-1',
      image: 7,
      method: 'placed',
      by: 'hand'
    })
  ]);
  const volume = (await loadAnchors())['juva-1']!;
  expect(volume.seen).toEqual([{ record: 5000, image: 7, by: 'hand' }]);
  expect(volume.anchors).toEqual([
    { image: 7, pages: [12], note: 'placed by hand in the app', by: 'hand' }
  ]);
});

test('a record marked in another Book is placed and seen there', async () => {
  const marked = citation(5000, '1790 - 1796', null);
  await markRef(refOf(marked), { volumeId: 'juva-2', image: 3 });

  expect(await scanOf(marked)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-2',
      image: 3,
      method: 'placed',
      by: 'hand'
    })
  ]);
  expect(Object.values(await loadPlacements())).toEqual([
    {
      volumeId: 'juva-2',
      volume: VOLUMES['juva-2'],
      image: 3,
      by: 'hand'
    }
  ]);
  expect((await loadAnchors())['juva-2']!.seen).toEqual([
    { record: 5000, image: 3, by: 'hand' }
  ]);
});

test('a hand marking extends the Record range, routing records in between', async () => {
  await writeLocal({
    'juva-1': { anchors: [], records: [{ from: 1000, to: 2000 }] },
    'juva-2': { anchors: [], records: [{ from: 4000, to: 5000 }] }
  });
  const marked = citation(2500, '1790 - 1796', 40);
  await markRef(refOf(marked), { volumeId: 'juva-1', image: 9 });

  // Record 2200 cites the later Book, but its number puts it in juva-1 now.
  const between = citation(2200, '1797 - 1803', 30);
  expect(await scanOf(between)).toEqual([
    expect.objectContaining({ volumeId: 'juva-1' })
  ]);
  expect((await loadAnchors())['juva-1']!.records).toEqual([
    { from: 1000, to: 2500 }
  ]);
});

test('a Record range is never extended across another Volume', async () => {
  await writeLocal({
    'juva-1': { anchors: [], records: [{ from: 1000, to: 2000 }] },
    'juva-2': { anchors: [], records: [{ from: 3000, to: 3500 }] }
  });
  const marked = citation(4000, '1790 - 1796', 40);
  await markRef(refOf(marked), { volumeId: 'juva-1', image: 9 });

  expect(await scanOf(marked)).toEqual([
    expect.objectContaining({ volumeId: 'juva-1', image: 9, method: 'placed' })
  ]);
  const anchors = await loadAnchors();
  expect(anchors['juva-1']!.records).toEqual([{ from: 1000, to: 2000 }]);
  expect(anchors['juva-2']!.records).toEqual([{ from: 3000, to: 3500 }]);
});

test('a hand marking replaces a vision match', async () => {
  await writeLocal({
    'juva-1': {
      anchors: [],
      seen: [{ record: 5000, image: 4, by: 'vision' }]
    }
  });
  const marked = citation(5000, '1790 - 1796', 12);
  expect(await scanOf(marked)).toEqual([
    expect.objectContaining({ image: 4, method: 'placed', by: 'vision' })
  ]);
  await markRef(refOf(marked), { volumeId: 'juva-1', image: 7 });
  expect(await scanOf(marked)).toEqual([
    expect.objectContaining({ image: 7, method: 'placed', by: 'hand' })
  ]);
});

test('confirming a vision match by hand keeps its box', async () => {
  const box = { left: 0.1, top: 0.4, width: 0.5, height: 0.05 };
  await writeLocal({
    'juva-1': {
      anchors: [],
      seen: [{ record: 5000, image: 4, by: 'vision', box }]
    }
  });
  const marked = citation(5000, '1790 - 1796', 12);
  await markRef(refOf(marked), { volumeId: 'juva-1', image: 4 });
  expect(await scanOf(marked)).toEqual([
    expect.objectContaining({ image: 4, method: 'placed', by: 'hand', box })
  ]);
});

test('a vision placement confirmed by hand keeps its box', async () => {
  const box = { left: 0.1, top: 0.4, width: 0.5, height: 0.05 };
  // Vision placements are of references with no Record number.
  const cited = citation(5000, '1790 - 1796', null);
  const marked = { ...cited, page: cited.page.replace('itemId=5000&', '') };
  await Bun.write(
    join(dir, 'placements.local.json'),
    JSON.stringify({
      [marked.page]: {
        volumeId: 'juva-2',
        volume: VOLUMES['juva-2'],
        image: 3,
        by: 'vision',
        box
      }
    })
  );
  useDataFolder(dir);
  await markRef(refOf(marked), { volumeId: 'juva-2', image: 3 });
  expect(Object.values(await loadPlacements())).toEqual([
    { volumeId: 'juva-2', volume: VOLUMES['juva-2'], image: 3, by: 'hand', box }
  ]);
});

test('the matcher searches the Volumes a reference links', async () => {
  const index = parseChurchBookRef(
    'https://www.myheritage.fi/research/collection-30233/x?itemId=9',
    'Juho Esimerkki\nRistiäiset: 29. Marras 1795 - Juva, Mikkeli, Finland'
  );
  expect(await matchCandidates(index)).toEqual([
    {
      volumeId: 'juva-3',
      volume: VOLUMES['juva-3'],
      images: 20,
      years: { from: 1790, to: 1810 },
      start: null
    }
  ]);
  const rippi = citation(5000, '1790 - 1796', 12);
  expect(
    await matchCandidates(parseChurchBookRef(rippi.page, rippi.text))
  ).toEqual([
    {
      volumeId: 'juva-1',
      volume: VOLUMES['juva-1'],
      images: 20,
      years: { from: 1790, to: 1796 },
      start: 12
    }
  ]);
});
