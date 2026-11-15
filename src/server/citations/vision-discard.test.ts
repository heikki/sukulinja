import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NewChange } from '../changes/changes';
import { openDb } from '../datasets/db';
import { memoryParishes } from './astia/parishes';
import { juvaAstia, rippiCitation } from './astia/test-parish';
import { createCitations } from './citations';
import { openImages } from './images';
import { referencesFor } from './myheritage/test-pins';
import type { Reader } from './myheritage/vision/reader';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vision-discard-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Finds anyone on Image 12, whose spreads are numbered as the Images.
const READER: Reader = {
  models: { pages: 'fake', dates: 'fake', entry: 'fake' },
  pageNumbers: async ({ image }) => await Promise.resolve({ pages: [image] }),
  dates: async () => await Promise.resolve({ unreadable: true }),
  findEntry: async ({ image }) =>
    await Promise.resolve({
      found: image === 12,
      confidence: 0.9,
      box: { left: 0.1, top: 0.5, width: 0.4, height: 0.05 }
    }),
  findEntries: async ({ image }, people) =>
    await Promise.resolve(
      people.map(() => ({
        found: image === 12,
        confidence: 0.9,
        box: { left: 0.1, top: 0.5, width: 0.4, height: 0.05 }
      }))
    )
};

test('a Match taken back is only undone, and writes no Change', async () => {
  const db = openDb(join(dir, 'db.sqlite'));
  db.run("INSERT INTO persons (id, xref) VALUES (1, '@I1@')");
  const c = rippiCitation(5000, '1790 - 1796', 12);
  db.run(
    `INSERT INTO citations (scope_type, scope_id, page, text, sort_order)
     VALUES ('person', 1, ?, ?, 0)`,
    [c.page, c.text]
  );
  const astia = juvaAstia();
  async function sizeOf() {
    return await Promise.resolve({ width: 1000, height: 800 });
  }
  const changes: NewChange[] = [];
  const citations = createCitations(db, {
    images: openImages({ astia, parishes: memoryParishes(), sizeOf }),
    references: referencesFor(dir, db, { astia, sizeOf }),
    changed: (change) => {
      changes.push(change);
    }
  });

  const at = { volumeId: 'juva-1', image: 12 };
  expect(await citations.findAllOnImage([1], at, READER)).toMatchObject([
    { citationId: 1, missed: null }
  ]);
  expect(await citations.discard(1, at)).toMatchObject({
    done: { match: true },
    resolution: { links: [{ certainty: 'estimated' }] }
  });
  expect(changes).toEqual([]);
  // Found again, as nothing of it was kept.
  expect(await citations.findAllOnImage([1], at, READER)).toMatchObject([
    {
      missed: null,
      resolution: { links: [{ certainty: 'match', image: 12 }] }
    }
  ]);
});
