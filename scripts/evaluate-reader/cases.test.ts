import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Pins } from '@server/citation-scans/locate';
import type { Person, Reader } from '@server/citation-scans/reader';
import { parseChurchBookRef } from '@server/citation-scans/record';

import { gateRefusal, MIN_DECOYS, recordEvaluation } from '../vision/gate';
import type { EntryTally } from '../vision/gate';
import {
  dateCases,
  entryCases,
  indexEntryCases,
  pageCases,
  scoreDates,
  scoreEntries,
  scorePages
} from './cases';

// Two parishes' Volumes with hand Page pins and Record pins, and a vision
// match and a misread page that the evaluation leaves out.
const VOLUMES: Pins['volumes'] = {
  v: {
    title: 'Pitäjä I Aa:1 Rippikirja (1790-1796)',
    pages: [
      { image: 10, pages: [8] },
      { image: 20, pages: [18] },
      { image: 30, pages: [28], note: 'written 82' },
      { image: 40, pages: [38], by: 'vision' }
    ],
    ranges: [{ from: 1000, to: 2000 }],
    records: [
      { record: 1100, image: 10 },
      { record: 1600, image: 30, by: 'vision' }
    ]
  },
  w: {
    title: 'Naapuri I Aa:1 Rippikirja (1790-1796)',
    pages: [],
    records: [{ record: 1500, image: 20 }]
  }
};

const PEOPLE = new Map<number, Person>([
  [1100, { name: 'Matti Esimerkki' }],
  [1500, { name: 'Liisa Malli' }],
  [1600, { name: 'Anna Malli' }],
  [1900, { name: 'Juho Kylä' }]
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

test('asks about hand Page pins read as cited', async () => {
  const cases = pageCases(VOLUMES);
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

test('asks about each hand Record pin and a decoy from another parish', async () => {
  const cases = entryCases(VOLUMES, PEOPLE);
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
      at: { volumeId: 'w', image: 20 },
      person: { name: 'Liisa Malli' },
      there: true
    },
    {
      at: { volumeId: 'w', image: 20 },
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

function indexUrl(n: number) {
  return `https://www.myheritage.fi/research/collection-30233/x?itemId=${n}`;
}

function baptism(n: number, date: string) {
  return parseChurchBookRef(
    indexUrl(n),
    `Juho Esimerkki\nRistiäiset: ${date} - Pitäjä, Finland`
  );
}

function pinned(image: number, by?: 'vision') {
  return {
    volumeId: 'c',
    volume: 'I C:1',
    image,
    ...(by === undefined ? {} : { by })
  };
}

test('asks about index references pinned by hand', async () => {
  const refs = new Map(
    [baptism(1, '29. Marras 1829'), baptism(2, '3. Touko 1830')].map((r) => [
      r.url,
      r
    ])
  );
  const cases = dateCases(
    {
      [indexUrl(1)]: pinned(50),
      [indexUrl(2)]: pinned(60, 'vision'),
      x: pinned(70)
    },
    refs
  );
  expect(cases).toEqual([
    { at: { volumeId: 'c', image: 50 }, date: '1829-11-29' }
  ]);
  const reader: Reader = {
    ...fakeReader(),
    dates: async ({ image }) =>
      await Promise.resolve(
        image === 50
          ? {
              earliest: '1829-11-20',
              latest: '1829-12-04',
              register: 'baptisms' as const
            }
          : { unreadable: true }
      )
  };
  expect(await scoreDates(reader, cases)).toEqual({
    questions: 1,
    exact: 1,
    wrong: 0,
    unreadable: 0
  });
});

test("asks about each index reference's entry, and a decoy from the same family", () => {
  // A parent's citations of three children's baptisms: the decoy for one is
  // another child pinned at least two Images away.
  function child(n: number, date: string, name: string) {
    return parseChurchBookRef(
      indexUrl(n),
      `Matti Esimerkki\nRistiäiset: ${date} - Pitäjä, Finland\nIsä: Matti Esimerkki\nLapsi: ${name}`
    );
  }
  const refs = new Map(
    [
      child(1, '2. Helmi 1830', 'Juho Esimerkki'),
      child(2, '9. Helmi 1830', 'Anna Esimerkki'),
      child(3, '5. Touko 1832', 'Liisa Esimerkki')
    ].map((r) => [r.url, r])
  );
  const cases = indexEntryCases(
    {
      [indexUrl(1)]: pinned(50),
      [indexUrl(2)]: pinned(51),
      [indexUrl(3)]: pinned(80)
    },
    refs
  );
  const asked = cases.map((c) => ({
    image: c.at.image,
    child: c.person.named?.find((n) => n.relation === 'child')?.name,
    date: c.person.date,
    there: c.there
  }));
  expect(asked).toEqual([
    { image: 50, child: 'Juho Esimerkki', date: '1830-02-02', there: true },
    { image: 50, child: 'Liisa Esimerkki', date: '1832-05-05', there: false },
    { image: 51, child: 'Anna Esimerkki', date: '1830-02-09', there: true },
    { image: 51, child: 'Liisa Esimerkki', date: '1832-05-05', there: false },
    { image: 80, child: 'Liisa Esimerkki', date: '1832-05-05', there: true },
    { image: 80, child: 'Juho Esimerkki', date: '1830-02-02', there: false }
  ]);
});

test('limits a run to a spread of cases', () => {
  expect(pageCases(VOLUMES, 1)).toHaveLength(1);
  expect(entryCases(VOLUMES, PEOPLE, 1)).toHaveLength(2);
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
