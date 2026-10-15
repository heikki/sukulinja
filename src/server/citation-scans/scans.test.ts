import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { loadAnchors, loadPlacements } from './anchors';
import { correctScan, resolveScans, useDataFolder } from './scans';

// Juva's parish archive, with two rippikirja Volumes of 20 Images each.
const ARCHIVE = '1212295491';
const VOLUMES = {
  'juva-1': 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
  'juva-2': 'I Aa:2 Pää- ja rippikirjat (1797-1803)'
};
const IMAGES = 20;

let dir = '';

function unit(id: string, level: string, label: string) {
  return {
    name: 'UNIT',
    children: [
      { name: 'ID', tagData: id },
      { name: 'TASO', tagData: level },
      { name: 'LABEL', tagData: label },
      { name: 'DIGI', tagData: 'true' }
    ]
  };
}

function file(id: string) {
  return { name: 'FILE', children: [{ name: 'URL', tagData: id }] };
}

// Astia's answers, put in its disk cache so no request goes out.
async function cacheAstia(cacheDir: string) {
  const answers: Record<string, unknown> = {
    [`ws/aineisto/readOne.php?id=${ARCHIVE}`]: {
      sisaltyvat: [unit('juva-register', 'series', 'I VÄESTÖREKISTERIARKISTO')]
    },
    'ws/aineisto/readOne.php?id=juva-register': {
      sisaltyvat: Object.entries(VOLUMES).map(([id, label]) =>
        unit(id, 'file', label)
      )
    }
  };
  for (const id of Object.keys(VOLUMES)) {
    const ns = Array.from({ length: IMAGES }, (_, i) => i + 1);
    answers[`ws/aineisto/digitoidut.php?id=${id}`] = {
      isot: ns.map((n) => file(`${id}-f${n}`)),
      pienet: ns.map((n) => file(`${id}-t${n}`))
    };
  }
  for (const [path, body] of Object.entries(answers)) {
    const key = createHash('sha1').update(path).digest('hex');
    // eslint-disable-next-line no-await-in-loop -- a handful of small files
    await Bun.write(join(cacheDir, `${key}.json`), JSON.stringify(body));
  }
}

const astia = spyOn(globalThis, 'fetch').mockImplementation((() => {
  throw new Error('no requests to Astia in these tests');
}) as unknown as typeof fetch);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scans-'));
  await cacheAstia(join(dir, '.astia-cache'));
  useDataFolder(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
afterAll(() => {
  astia.mockRestore();
});

// A rippikirja citation in the shape MyHeritage writes, with made-up people.
function citation(record: number, years: string, page: number | null) {
  return {
    page: `https://www.myheritage.fi/research/collection-10509/x?itemId=${record}&action=showRecord`,
    text: [
      'Matti Esimerkki',
      `Kirja:Rippikirja, ${years}`,
      `Hallintoalue:Juva${page === null ? '' : `Sivu:${page}`}`
    ].join('\n')
  };
}

async function writeLocal(anchors: unknown) {
  await Bun.write(join(dir, 'anchors.local.json'), JSON.stringify(anchors));
  useDataFolder(dir);
}

async function scanOf(c: { page: string; text: string }) {
  const resolved = await resolveScans(c.page, c.text);
  return 'scans' in resolved ? resolved.scans : resolved;
}

test('marking a record with a Record number saves a hand Seen record', async () => {
  const marked = citation(5000, '1790 - 1796', 12);
  await correctScan(marked.page, marked.text, { volumeId: 'juva-1', image: 7 });

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
  await correctScan(marked.page, marked.text, { volumeId: 'juva-2', image: 3 });

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
  await correctScan(marked.page, marked.text, { volumeId: 'juva-1', image: 9 });

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
  await correctScan(marked.page, marked.text, { volumeId: 'juva-1', image: 9 });

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
  await correctScan(marked.page, marked.text, { volumeId: 'juva-1', image: 7 });
  expect(await scanOf(marked)).toEqual([
    expect.objectContaining({ image: 7, method: 'placed', by: 'hand' })
  ]);
});
