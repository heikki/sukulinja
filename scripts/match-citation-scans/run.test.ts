import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { openPins } from '@server/citation-scans/pins';
import type { Reader } from '@server/citation-scans/reader';
import {
  churchBookRefOf,
  parseChurchBookRef
} from '@server/citation-scans/record';
import { openScans } from '@server/citation-scans/scans';
import {
  baptismCitation,
  juvaAstia,
  rippiCitation,
  VOLUMES
} from '@server/citation-scans/test-parish';

import { recordEvaluation } from '../vision/gate';
import { reviewMarkdown, runMatching } from './run';
import type { Books } from './run';

const DAY = 24 * 60 * 60 * 1000;

// Where the fake Reader says every entry it finds is.
const BOX = { left: 0.1, top: 0.6, width: 0.4, height: 0.03 };

function isoDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

// What the scans in the fake parish read as. juva-1 numbers each spread
// with its Image number, except that Images 3–7 are too faint to read;
// juva-2 writes only every fourth number; juva-3 is a baptism book whose
// Image n covers ten days from New Year 1795 + 10 (n - 1) days.
function scans() {
  const asked: string[] = [];
  const names: Record<string, Record<number, string>> = {
    'juva-1': { 12: 'Matti Esimerkki' },
    'juva-3': { 15: 'Juho Esimerkki' }
  };
  function faint(volumeId: string, image: number) {
    return volumeId === 'juva-1' && image >= 2 && image <= 8;
  }
  const reader: Reader = {
    models: { pages: 'fake', dates: 'fake', entry: 'fake' },
    pageNumbers: async ({ volumeId, image }) => {
      asked.push(`pages ${volumeId} ${image}`);
      if (faint(volumeId, image) || volumeId === 'juva-3') {
        return await Promise.resolve({ unreadable: true });
      }
      const page = volumeId === 'juva-2' ? image - (image % 4) : image;
      return await Promise.resolve({ pages: [page] });
    },
    dates: async ({ volumeId, image }) => {
      asked.push(`dates ${volumeId} ${image}`);
      if (volumeId !== 'juva-3') {
        return await Promise.resolve({ unreadable: true });
      }
      const from = Date.UTC(1795, 0, 1) + (image - 1) * 10 * DAY;
      return await Promise.resolve({
        earliest: isoDay(from),
        latest: isoDay(from + 9 * DAY),
        register: 'baptisms' as const
      });
    },
    findEntry: async ({ volumeId, image }, { name, date }) => {
      asked.push(`entry ${volumeId} ${image} ${name}`);
      if (faint(volumeId, image)) {
        return await Promise.resolve({ unreadable: true });
      }
      const found = names[volumeId]?.[image] === name;
      // An index entry is written with the date its reference cites.
      return await Promise.resolve({
        found,
        confidence: 0.9,
        date: found ? (date ?? null) : null,
        box: found ? BOX : null
      });
    }
  };
  return { reader, asked };
}

// Matti is on Image 12 of juva-1 and Juho in juva-3 (25 May 1795 is on
// Image 15); Liisa's page is in the faint stretch, and Anna's page 10 is
// never written in juva-2.
const MATTI = rippiCitation(5000, '1790 - 1796', 12, 'Matti Esimerkki');
const LIISA = rippiCitation(5001, '1790 - 1796', 5, 'Liisa Malli');
const ANNA = rippiCitation(6000, '1797 - 1803', 10, 'Anna Malli');
const JUHO = baptismCitation(9, '25. Touko 1795', 'Juho Esimerkki');
const CITATIONS = [MATTI, LIISA, ANNA, JUHO];
const REFS = CITATIONS.map((c) => parseChurchBookRef(c.page, c.text));

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vision-pass-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function passEvaluation(falseConfirmations = 0) {
  await recordEvaluation(dir, {
    fake: {
      entry: {
        tally: {
          questions: 400,
          exact: 400 - falseConfirmations,
          wrong: falseConfirmations,
          unreadable: 0,
          decoys: 200,
          falseConfirmations
        },
        dollarsPerReading: 0.01,
        evaluatedAt: '2026-10-15T00:00:00Z'
      }
    }
  });
}

async function run(
  options: { dryRun?: boolean; limit?: number; books?: Books } = {}
) {
  const { reader, asked } = scans();
  const result = await runMatching({
    root: dir,
    refs: REFS,
    reader,
    astia: juvaAstia(),
    log: () => undefined,
    ...options
  });
  return { result, asked };
}

async function linksOf(c: { page: string; text: string }) {
  const scans = openScans({ pins: openPins(dir), astia: juvaAstia() });
  const resolved = await scans.resolveRef(churchBookRefOf(c.page, c.text)!);
  return 'links' in resolved ? resolved.links : resolved;
}

test('saves confirmed matches, which the app shows as vision matches', async () => {
  await passEvaluation();
  const { result } = await run();
  expect('outcomes' in result && result.outcomes.toSorted()).toEqual([
    'kastetut confirmed',
    'rippi confirmed',
    'rippi did not converge',
    'rippi unreadable'
  ]);

  expect(await linksOf(MATTI)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-1',
      image: 12,
      certainty: 'vision'
    })
  ]);
  expect(await linksOf(JUHO)).toEqual([
    expect.objectContaining({
      volumeId: 'juva-3',
      image: 15,
      certainty: 'vision'
    })
  ]);
  const pins = await openPins(dir).snapshot();
  const juva1 = pins.volumes['juva-1']!;
  expect(juva1.records).toEqual([
    { record: 5000, image: 12, by: 'vision', box: BOX }
  ]);
  expect(juva1.ranges).toEqual([{ from: 5000, to: 5000 }]);
  expect(juva1.pages).toEqual([
    { image: 12, pages: [12], note: 'read by the vision model', by: 'vision' }
  ]);
  expect(Object.keys(pins.references)).toEqual([JUHO.page]);
});

test('lists what it could not confirm, with where the search ended', async () => {
  await passEvaluation();
  const { result } = await run();
  if (!('review' in result)) throw new Error('refused');
  expect(result.review).toMatchObject([
    {
      reason: 'unreadable',
      parish: 'Juva',
      name: 'Liisa Malli',
      cited: 'p. 5',
      volume: VOLUMES['juva-1'],
      image: 5
    },
    {
      reason: 'did not converge',
      name: 'Anna Malli',
      volume: VOLUMES['juva-2']
    }
  ]);
  const markdown = reviewMarkdown(result.review);
  expect(markdown).toContain(
    `| unreadable | Juva | ${VOLUMES['juva-1']} | [5](https://astia.narc.fi/uusiastia/viewer/?fileId=juva-1-f5&aineistoId=juva-1) | Liisa Malli | p. 5 |`
  );
});

test('a re-run skips what was saved and asks the Reader nothing new', async () => {
  await passEvaluation();
  await run();
  const again = await run();
  expect(again.asked).toEqual([]);
  expect(
    'outcomes' in again.result && again.result.outcomes.toSorted()
  ).toEqual([
    'kastetut ✗ already pinned',
    'rippi did not converge',
    'rippi unreadable',
    'rippi ✗ already pinned'
  ]);
});

test('never overrides a hand pin', async () => {
  await passEvaluation();
  // Juho pinned by hand on Image 16; a Page pin read by hand on Image 12.
  await Bun.write(
    join(dir, 'pins.local.json'),
    JSON.stringify({
      volumes: { 'juva-1': { pages: [{ image: 12, pages: [12] }] } },
      references: {
        [JUHO.page]: {
          volumeId: 'juva-3',
          volume: VOLUMES['juva-3'],
          image: 16
        }
      }
    })
  );
  await run();
  expect(await linksOf(JUHO)).toEqual([
    expect.objectContaining({
      image: 16,
      precision: 'image',
      certainty: 'marked'
    })
  ]);
  expect((await openPins(dir).snapshot()).volumes['juva-1']!.pages).toEqual([
    { image: 12, pages: [12] }
  ]);
  // Matti is still matched, as a Record pin beside the hand Page pin.
  expect(await linksOf(MATTI)).toEqual([
    expect.objectContaining({ image: 12, certainty: 'vision' })
  ]);
});

test('writes nothing without a passing evaluation', async () => {
  expect((await run()).result).toEqual({
    refused: "fake hasn't been evaluated on finding entries"
  });
  await passEvaluation(5);
  expect((await run()).result).toEqual({
    refused: 'fake confirmed 2.5% of decoys; at most 1% is allowed'
  });
  expect(await Bun.file(join(dir, 'pins.local.json')).exists()).toBe(false);
});

test('a dry run reports what it would save, and writes nothing', async () => {
  const { result } = await run({ dryRun: true });
  expect('saved' in result && result.saved).toBe(2);
  expect(await Bun.file(join(dir, 'pins.local.json')).exists()).toBe(false);
  expect(await linksOf(MATTI)).toEqual([
    expect.objectContaining({ certainty: 'estimated' })
  ]);
});

test('limits a run to rippikirja or index references', async () => {
  await passEvaluation();
  const rippi = await run({ books: 'rippikirjat', dryRun: true });
  expect('outcomes' in rippi.result && rippi.result.outcomes).not.toContain(
    'kastetut confirmed'
  );
  expect(rippi.asked.some((a) => a.startsWith('dates'))).toBe(false);
  const index = await run({ books: 'index', dryRun: true });
  expect('outcomes' in index.result && index.result.outcomes).toEqual([
    'kastetut confirmed'
  ]);
});

test('stops after the given number of references', async () => {
  await passEvaluation();
  const { result } = await run({ limit: 1 });
  expect('outcomes' in result && result.outcomes).toEqual(['rippi confirmed']);
});
