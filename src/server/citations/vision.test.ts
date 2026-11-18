import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { VolumeLocating } from '@/common/types';

import { openDb } from '../datasets/db';
import { memoryParishes } from './astia/parishes';
import { juvaAstia, rippiCitation, VOLUMES } from './astia/test-parish';
import { createCitations } from './citations';
import { openImages } from './images';
import { openScanFolder } from './myheritage';
import { openVision } from './vision';
import type { SpendingReader } from './vision';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vision-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const BOX = { left: 0.1, top: 0.5, width: 0.4, height: 0.05 };

// A Volume numbered five pages ahead of its Images, its book counted from
// the first: page 12, estimated on Image 12, is on Image 7, where the
// person is found.
async function reader(model: string): Promise<SpendingReader> {
  function found(image: number) {
    return { found: image === 7, confidence: 0.9, box: BOX };
  }
  return await Promise.resolve({
    models: { pages: model, entry: model },
    versions: { pages: '1', entry: '1' },
    spend: () => ({
      [model]: { calls: 0, inputTokens: 0, outputTokens: 0, dollars: 0 }
    }),
    pageNumbers: async ({ image }) =>
      await Promise.resolve({ pages: [image + 5] }),
    findEntry: async ({ image }) => await Promise.resolve(found(image)),
    findEntries: async ({ image }, people) =>
      await Promise.resolve(people.map(() => found(image)))
  });
}

function setUp() {
  const db = openDb(join(dir, 'db.sqlite'));
  db.run("INSERT INTO persons (id, xref) VALUES (1, '@I1@')");
  db.run(
    "INSERT INTO names (person_id, full_text, sort_order) VALUES (1, 'Matti /Esimerkki/', 0)"
  );
  const c = rippiCitation(5000, '1790 - 1796', 12);
  db.run(
    `INSERT INTO citations (scope_type, scope_id, page, text, sort_order)
     VALUES ('person', 1, ?, ?, 0)`,
    [c.page, c.text]
  );
  const astia = juvaAstia();
  const parishes = memoryParishes();
  async function sizeOf() {
    return await Promise.resolve({ width: 1000, height: 800 });
  }
  const folder = openScanFolder(dir, { astia, parishes });
  const citations = createCitations(db, {
    images: openImages({ astia, parishes, sizeOf }),
    references: folder.references(db, { sizeOf }),
    changed: () => undefined
  });
  const vision = openVision({
    readers: reader,
    image: async () => await Promise.reject(new Error('no scans here')),
    readings: join(dir, '.vision-readings'),
    folder
  });
  return { db, citations, vision };
}

async function located(lines: AsyncIterable<VolumeLocating>) {
  const said: VolumeLocating[] = [];
  for await (const line of lines) said.push(line);
  return said;
}

const VOLUME = { volumeId: 'juva-1', volume: VOLUMES['juva-1'] };

test("a Volume's survey moves its estimates, and each is looked for where it then is", async () => {
  const { db, citations, vision } = setUp();
  try {
    const before = await citations.inVolume('juva-1');
    expect(before.map((r) => r.link)).toMatchObject([
      { certainty: 'estimated', image: 12 }
    ]);
    const said = await located(
      vision.locateVolume(citations, VOLUME, 'claude-haiku-5-5')
    );
    expect(said).toMatchObject([
      { surveying: true },
      { surveyed: { settled: true } },
      { searching: { nth: 1, images: 1, estimates: 1 } },
      { tried: [{ links: { citationId: 1 }, missed: null }] },
      { done: { model: 'claude-haiku-5-5' } }
    ]);
    const after = await citations.inVolume('juva-1');
    expect(after.map((r) => r.link)).toMatchObject([
      { certainty: 'match', image: 7 }
    ]);
  } finally {
    db.close();
  }
});

test('a Volume whose pages are known is located without a survey', async () => {
  const { db, citations, vision } = setUp();
  try {
    const at = { ...VOLUME, image: 9 };
    await openScanFolder(dir, {
      astia: juvaAstia(),
      parishes: memoryParishes()
    }).setImagePage(at, [14]);
    const said = await located(
      vision.locateVolume(citations, VOLUME, 'claude-haiku-5-5')
    );
    expect(said.map((l) => Object.keys(l)[0])).toEqual([
      'searching',
      'tried',
      'done'
    ]);
    expect(said[1]).toMatchObject({ tried: [{ missed: null }] });
  } finally {
    db.close();
  }
});

test('without a vision model, locating is refused', async () => {
  const { db, citations } = setUp();
  try {
    const vision = openVision({
      readers: undefined,
      image: async () => await Promise.reject(new Error('no scans here')),
      readings: join(dir, '.vision-readings'),
      folder: openScanFolder(dir, {
        astia: juvaAstia(),
        parishes: memoryParishes()
      })
    });
    expect(
      await located(vision.locateVolume(citations, VOLUME, 'claude-haiku-5-5'))
    ).toEqual([{ refused: 'Vision Match is not set up.', took: null }]);
  } finally {
    db.close();
  }
});
