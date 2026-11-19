import { expect, test } from 'bun:test';

import type { FactRow } from '@/common/types';

import { expectedEntries, yearsOf } from './expected';

let next = 1;
function fact(tag: string, date: string | null, place: string | null = null) {
  next += 1;
  return {
    id: next,
    familyId: null,
    tag,
    type: null,
    date,
    place,
    address: null,
    value: null,
    spouse: null
  } satisfies FactRow;
}

test('reads the years a GEDCOM date can be in', () => {
  expect(yearsOf('3 MAR 1796')).toEqual({ from: 1796, to: 1796 });
  expect(yearsOf('BET 1794 AND 1808')).toEqual({ from: 1794, to: 1808 });
  expect(yearsOf('BEF 1761')).toEqual({ from: 1761, to: 1761 });
  expect(yearsOf('ABT 1800')).toEqual({ from: 1800, to: 1800 });
  expect(yearsOf('sometime')).toBeNull();
  expect(yearsOf(null)).toBeNull();
});

test("expects a life's entries in its order, from its Facts", () => {
  const expected = expectedEntries([
    fact('DEAT', '1850', 'Juva, Suomi'),
    fact('BIRT', '2 FEB 1796', 'Kaipola, Juva, Suomi'),
    fact('CHR', '3 FEB 1796', 'Juva, Suomi'),
    fact('RESI', 'BET 1830 AND 1840', 'Koikkala, Sääminki, Suomi'),
    fact('MARR', '1820', 'Juva, Suomi')
  ]);
  expect(expected).toEqual([
    {
      kind: 'kastetut',
      of: 'birth',
      years: { from: 1796, to: 1796 },
      estimated: false,
      places: ['Juva, Suomi', 'Kaipola, Juva, Suomi']
    },
    {
      kind: 'lasten',
      of: 'childhood',
      years: { from: 1796, to: 1811 },
      estimated: false,
      places: ['Kaipola, Juva, Suomi']
    },
    {
      kind: 'rippi',
      of: 'life',
      years: { from: 1796, to: 1850 },
      estimated: false,
      // Where they lived first.
      places: [
        'Koikkala, Sääminki, Suomi',
        'Juva, Suomi',
        'Kaipola, Juva, Suomi'
      ]
    },
    {
      kind: 'vihityt',
      of: 'marriage',
      years: { from: 1820, to: 1820 },
      estimated: false,
      places: ['Juva, Suomi']
    },
    {
      kind: 'haudatut',
      of: 'death',
      years: { from: 1850, to: 1850 },
      estimated: false,
      places: ['Juva, Suomi']
    }
  ]);
});

test('runs a life with no death to the last year a Fact gives', () => {
  const expected = expectedEntries([
    fact('BIRT', '1796', 'Juva'),
    fact('RESI', 'BET 1820 AND 1835', 'Juva')
  ]);
  expect(expected.find((e) => e.of === 'life')).toMatchObject({
    years: { from: 1796, to: 1835 },
    estimated: true
  });
  expect(expected.map((e) => e.of)).toEqual(['birth', 'childhood', 'life']);
});

test('takes a baptism for the birth, and a burial for the death', () => {
  const expected = expectedEntries([
    fact('CHR', '1796', 'Juva'),
    fact('BURI', '1850', 'Juva')
  ]);
  expect(expected.map((e) => [e.of, e.years])).toEqual([
    ['birth', { from: 1796, to: 1796 }],
    ['childhood', { from: 1796, to: 1811 }],
    ['life', { from: 1796, to: 1850 }],
    ['death', { from: 1850, to: 1850 }]
  ]);
});

test('expects nothing of Facts with no date', () => {
  expect(expectedEntries([fact('BIRT', null, 'Juva')])).toEqual([]);
});
