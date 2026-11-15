import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { juvaAstia, rippiCitation } from '../../astia/test-parish';
import { churchBookRefOf } from '../record';
import { citing, scansOf } from '../test-pins';
import { counting, findAllOnImage, findByVision } from './find';
import type { Reader } from './reader';

// juva-1 numbers each spread with its Image number; Matti is on Image 12.
function reader(on: Record<number, string>): Reader {
  return {
    models: { pages: 'fake', dates: 'fake', entry: 'fake' },
    pageNumbers: async ({ image }) => await Promise.resolve({ pages: [image] }),
    dates: async () => await Promise.resolve({ unreadable: true }),
    findEntry: async ({ image }, { name }) => {
      const found = on[image] === name;
      return await Promise.resolve({
        found,
        confidence: 0.9,
        box: found ? { left: 0.1, top: 0.6, width: 0.4, height: 0.03 } : null
      });
    }
  };
}

const MATTI = rippiCitation(5000, '1790 - 1796', 12, 'Matti Esimerkki');
const REF = churchBookRefOf(MATTI.page, MATTI.text)!;

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'find-by-vision-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function scans() {
  return scansOf(dir, citing([MATTI]), {
    astia: juvaAstia(),
    sizeOf: async () => await Promise.resolve({ width: 1000, height: 2000 })
  });
}

test('saves the Match it confirms, which the reference then links', async () => {
  const found = await findByVision(
    scans(),
    REF,
    reader({ 12: 'Matti Esimerkki' })
  );
  expect(found).toMatchObject({
    missed: null,
    resolution: {
      links: [{ volumeId: 'juva-1', image: 12, certainty: 'match' }]
    }
  });
});

test('says why it found none, and leaves the estimate', async () => {
  const found = await findByVision(scans(), REF, reader({}));
  expect(found).toMatchObject({
    missed: 'name not found',
    resolution: { links: [{ certainty: 'estimated' }] }
  });
});

test('counts the questions asked', async () => {
  const counted = counting(reader({ 12: 'Matti Esimerkki' }));
  await findByVision(scans(), REF, counted.reader);
  expect(counted.asked()).toBeGreaterThan(1);
});

const LIISA = rippiCitation(5001, '1790 - 1796', 12, 'Liisa Esimerkki');
const LIISA_REF = churchBookRefOf(LIISA.page, LIISA.text)!;

test('looks for everyone on the Image in one question', async () => {
  const asked: string[][] = [];
  const atOnce: Reader = {
    ...reader({}),
    findEntries: async (_at, people) => {
      asked.push(people.map((p) => p.name));
      return await Promise.resolve(
        people.map(({ name }) => ({
          found: name === 'Matti Esimerkki',
          confidence: 0.9,
          box:
            name === 'Matti Esimerkki'
              ? { left: 0.1, top: 0.6, width: 0.4, height: 0.03 }
              : null
        }))
      );
    }
  };
  const found = await findAllOnImage(
    scansOf(dir, citing([MATTI, LIISA]), {
      astia: juvaAstia(),
      sizeOf: async () => await Promise.resolve({ width: 1000, height: 2000 })
    }),
    { volumeId: 'juva-1', image: 12 },
    [REF, LIISA_REF],
    atOnce
  );
  expect(asked).toEqual([['Matti Esimerkki', 'Liisa Esimerkki']]);
  expect(found).toMatchObject([
    {
      missed: null,
      resolution: { links: [{ image: 12, certainty: 'match' }] }
    },
    {
      missed: 'name not found',
      resolution: { links: [{ certainty: 'estimated' }] }
    }
  ]);
});
