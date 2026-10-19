import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { loadPins } from './pins';
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

async function writeLocal(volumes: unknown) {
  await Bun.write(join(dir, 'pins.local.json'), JSON.stringify({ volumes }));
  useDataFolder(dir);
}

function refOf(c: { page: string; text: string }) {
  return churchBookRefOf(c.page, c.text)!;
}

async function linksOf(c: { page: string; text: string }) {
  const resolved = await resolveRef(refOf(c));
  return 'links' in resolved ? resolved.links : resolved;
}

test('marking a record with a Record number saves a hand Record pin', async () => {
  const marked = citation(5000, '1790 - 1796', 12);
  await markRef(refOf(marked), { volumeId: 'juva-1', image: 7 });

  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-1',
      image: 7,
      certainty: 'exact'
    })
  ]);
  const volume = (await loadPins()).volumes['juva-1']!;
  expect(volume.records).toEqual([{ record: 5000, image: 7, by: 'hand' }]);
  expect(volume.pages).toEqual([
    { image: 7, pages: [12], note: 'marked in the app', by: 'hand' }
  ]);
});

test('a record marked in another Book gets a Reference pin and a Record pin there', async () => {
  const marked = citation(5000, '1790 - 1796', null);
  await markRef(refOf(marked), { volumeId: 'juva-2', image: 3 });

  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-2',
      image: 3,
      certainty: 'exact'
    })
  ]);
  expect(Object.values((await loadPins()).references)).toEqual([
    {
      volumeId: 'juva-2',
      volume: VOLUMES['juva-2'],
      image: 3,
      by: 'hand'
    }
  ]);
  expect((await loadPins()).volumes['juva-2']!.records).toEqual([
    { record: 5000, image: 3, by: 'hand' }
  ]);
});

test('a hand marking extends the Record range, routing records in between', async () => {
  await writeLocal({
    'juva-1': { pages: [], ranges: [{ from: 1000, to: 2000 }] },
    'juva-2': { pages: [], ranges: [{ from: 4000, to: 5000 }] }
  });
  const marked = citation(2500, '1790 - 1796', 40);
  await markRef(refOf(marked), { volumeId: 'juva-1', image: 9 });

  // Record 2200 cites the later Book, but its number puts it in juva-1 now.
  const between = citation(2200, '1797 - 1803', 30);
  expect(await linksOf(between)).toEqual([
    expect.objectContaining({ volumeId: 'juva-1' })
  ]);
  expect((await loadPins()).volumes['juva-1']!.ranges).toEqual([
    { from: 1000, to: 2500 }
  ]);
});

test('a Record range is never extended across another Volume', async () => {
  await writeLocal({
    'juva-1': { pages: [], ranges: [{ from: 1000, to: 2000 }] },
    'juva-2': { pages: [], ranges: [{ from: 3000, to: 3500 }] }
  });
  const marked = citation(4000, '1790 - 1796', 40);
  await markRef(refOf(marked), { volumeId: 'juva-1', image: 9 });

  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-1',
      image: 9,
      certainty: 'exact'
    })
  ]);
  const { volumes } = await loadPins();
  expect(volumes['juva-1']!.ranges).toEqual([{ from: 1000, to: 2000 }]);
  expect(volumes['juva-2']!.ranges).toEqual([{ from: 3000, to: 3500 }]);
});

test('a hand marking replaces a vision match', async () => {
  await writeLocal({
    'juva-1': {
      pages: [],
      records: [{ record: 5000, image: 4, by: 'vision' }]
    }
  });
  const marked = citation(5000, '1790 - 1796', 12);
  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({ image: 4, certainty: 'vision' })
  ]);
  await markRef(refOf(marked), { volumeId: 'juva-1', image: 7 });
  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({ image: 7, certainty: 'exact' })
  ]);
});

test('confirming a vision match by hand keeps its box', async () => {
  const box = { left: 0.1, top: 0.4, width: 0.5, height: 0.05 };
  await writeLocal({
    'juva-1': {
      pages: [],
      records: [{ record: 5000, image: 4, by: 'vision', box }]
    }
  });
  const marked = citation(5000, '1790 - 1796', 12);
  await markRef(refOf(marked), { volumeId: 'juva-1', image: 4 });
  expect(await linksOf(marked)).toEqual([
    expect.objectContaining({ image: 4, certainty: 'exact', box })
  ]);
});

test('a vision Reference pin confirmed by hand keeps its box', async () => {
  const box = { left: 0.1, top: 0.4, width: 0.5, height: 0.05 };
  // Vision Reference pins are of references with no Record number.
  const cited = citation(5000, '1790 - 1796', null);
  const marked = { ...cited, page: cited.page.replace('itemId=5000&', '') };
  await Bun.write(
    join(dir, 'pins.local.json'),
    JSON.stringify({
      volumes: {},
      references: {
        [marked.page]: {
          volumeId: 'juva-2',
          volume: VOLUMES['juva-2'],
          image: 3,
          by: 'vision',
          box
        }
      }
    })
  );
  useDataFolder(dir);
  await markRef(refOf(marked), { volumeId: 'juva-2', image: 3 });
  expect(Object.values((await loadPins()).references)).toEqual([
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
