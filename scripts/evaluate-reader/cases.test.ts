import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { Anchors } from '@server/citation-scans/locate';
import type { Reader } from '@server/citation-scans/reader';

import { gateRefusal, MIN_DECOYS, recordEvaluation } from '../vision/gate';
import type { EntryTally } from '../vision/gate';
import { entryCases, pageCases, scoreEntries, scorePages } from './cases';

// One Volume with hand Anchors and Seen records, and a vision match and a
// misread page that the evaluation leaves out.
const ANCHORS: Anchors = {
  v: {
    anchors: [
      { image: 10, pages: [8] },
      { image: 20, pages: [18] },
      { image: 30, pages: [28], note: 'written 82' },
      { image: 40, pages: [38], by: 'vision' }
    ],
    records: [{ from: 1000, to: 2000 }],
    seen: [
      { record: 1100, image: 10 },
      { record: 1500, image: 20 },
      { record: 1600, image: 30, by: 'vision' }
    ]
  }
};

const NAMES = new Map([
  [1100, 'Matti Esimerkki'],
  [1500, 'Liisa Malli'],
  [1600, 'Anna Malli'],
  [1900, 'Juho Kylä']
]);

// Reads Image n as page n - 2 except Image 20, unreadable; finds the names
// on their Images, and Liisa Malli on Image 10 too.
function fakeReader(): Reader {
  const on: Record<number, string[]> = {
    10: ['Matti Esimerkki', 'Liisa Malli'],
    20: ['Liisa Malli']
  };
  return {
    models: { pages: 'fake', dates: 'fake', entry: 'fake' },
    pageNumbers: async ({ image }) =>
      await Promise.resolve(
        image === 20 ? { unreadable: true } : { pages: [image - 2] }
      ),
    dates: async () => await Promise.resolve({ unreadable: true }),
    findEntry: async ({ image }, { name }) =>
      await Promise.resolve({
        found: (on[image] ?? []).includes(name),
        confidence: 0.9
      })
  };
}

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'evaluation-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('asks about hand Anchors read as cited', async () => {
  const cases = pageCases(ANCHORS);
  expect(cases).toEqual([
    { at: { volumeId: 'v', image: 10 }, pages: [8] },
    { at: { volumeId: 'v', image: 20 }, pages: [18] }
  ]);
  expect(await scorePages(fakeReader(), cases)).toEqual({
    questions: 2,
    exact: 1,
    wrong: 0,
    unreadable: 1
  });
});

test('asks about each hand Seen record and a decoy on its Image', async () => {
  const cases = entryCases(ANCHORS, NAMES);
  expect(cases).toEqual([
    {
      at: { volumeId: 'v', image: 10 },
      person: { name: 'Matti Esimerkki' },
      there: true
    },
    {
      at: { volumeId: 'v', image: 10 },
      person: { name: 'Liisa Malli' },
      there: false
    },
    {
      at: { volumeId: 'v', image: 20 },
      person: { name: 'Liisa Malli' },
      there: true
    },
    {
      at: { volumeId: 'v', image: 20 },
      person: { name: 'Matti Esimerkki' },
      there: false
    }
  ]);
  // Liisa Malli's decoy question on Image 10 is a false confirmation.
  expect(await scoreEntries(fakeReader(), cases)).toEqual({
    questions: 4,
    exact: 3,
    wrong: 1,
    unreadable: 0,
    decoys: 2,
    falseConfirmations: 1
  });
});

test('limits a run to a spread of cases', () => {
  expect(pageCases(ANCHORS, 1)).toHaveLength(1);
  expect(entryCases(ANCHORS, NAMES, 1)).toHaveLength(2);
});

function entryResult(tally: Partial<EntryTally>) {
  return {
    entry: {
      tally: {
        questions: 0,
        exact: 0,
        wrong: 0,
        unreadable: 0,
        decoys: 0,
        falseConfirmations: 0,
        ...tally
      },
      dollarsPerReading: 0.01,
      evaluatedAt: '2026-10-15T00:00:00Z'
    }
  };
}

test('the gate opens only on a false-confirmation rate of 1% or less', async () => {
  expect(await gateRefusal(dir, 'm')).toContain("hasn't been evaluated");
  await recordEvaluation(dir, { m: entryResult({ decoys: 10 }) });
  expect(await gateRefusal(dir, 'm')).toContain(`at least ${MIN_DECOYS}`);
  await recordEvaluation(dir, {
    m: entryResult({ decoys: 200, falseConfirmations: 3 })
  });
  expect(await gateRefusal(dir, 'm')).toContain('1.5% of decoys');
  await recordEvaluation(dir, {
    m: entryResult({ decoys: 200, falseConfirmations: 2 }),
    other: entryResult({ decoys: 200, falseConfirmations: 9 })
  });
  expect(await gateRefusal(dir, 'm')).toBeNull();
  expect(await gateRefusal(dir, 'other')).not.toBeNull();
});
