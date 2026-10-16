import { expect, test } from 'bun:test';

import type { VolumeCitation } from '@common/types';

import { citationLabel, citedAs, groupCitations } from './citations';

function row(
  personId: number,
  image: number | null,
  method: VolumeCitation['method'],
  more: Partial<VolumeCitation> = {}
): VolumeCitation {
  return {
    personId,
    citation: {
      id: personId * 10,
      source: null,
      reference: 'Juva · Communion book 1790–1796 · p. 12',
      page: null,
      url: null,
      record: null,
      text: null,
      churchBook: true,
      citedPage: 12
    },
    image,
    method,
    split: false,
    ...more
  };
}

const NAMES: Record<number, string> = {
  1: 'Matti',
  2: 'Liisa',
  3: 'Anna',
  4: 'Juho',
  5: 'Kaisa',
  6: 'Pekka'
};

function nameOf(r: VolumeCitation) {
  return NAMES[r.personId]!;
}

function shown(rows: VolumeCitation[], image: number) {
  return groupCitations(rows, image, nameOf).map((g) => ({
    label: g.label,
    people: g.rows.map(nameOf)
  }));
}

test("groups the Image's rows by how they were found", () => {
  const rows = [
    row(1, 7, 'anchored'),
    row(2, 7, 'placed', { by: 'hand' }),
    row(3, 7, 'estimated'),
    row(4, 8, 'placed', { by: 'vision' }),
    row(5, null, 'volume'),
    row(6, 7, 'placed', { by: 'vision' })
  ];
  expect(shown(rows, 7)).toEqual([
    { label: 'Placed', people: ['Liisa', 'Pekka'] },
    { label: 'Probably here', people: ['Anna', 'Matti'] },
    { label: 'In this Volume', people: ['Kaisa'] }
  ]);
  expect(shown(rows, 8)).toEqual([
    { label: 'Placed', people: ['Juho'] },
    { label: 'In this Volume', people: ['Kaisa'] }
  ]);
});

test('lists Placed entries in the order written on the Image', () => {
  function at(top: number) {
    return { left: 0, top, width: 1, height: 0.05 };
  }
  const rows = [
    row(1, 7, 'placed', { by: 'vision', box: at(0.6) }),
    row(2, 7, 'placed', { by: 'hand' }),
    row(3, 7, 'placed', { by: 'vision', box: at(0.2) })
  ];
  expect(shown(rows, 7)).toEqual([
    { label: 'Placed', people: ['Anna', 'Matti', 'Liisa'] }
  ]);
});

test('says how a row was found, and that a Split may be elsewhere', () => {
  expect(citationLabel(row(1, 7, 'placed', { by: 'vision' }))).toBe(
    'Vision match'
  );
  expect(citationLabel(row(1, 7, 'placed', { by: 'hand' }))).toBe('Placed');
  expect(citationLabel(row(1, 7, 'estimated', { split: true }))).toBe(
    'Estimated · one of several Volumes'
  );
  expect(citationLabel(row(1, null, 'volume'))).toBe('Volume only');
});

test('names the cited page, or the reference where there is none', () => {
  expect(citedAs(row(1, 7, 'anchored'))).toBe('p. 12');
  const unpaged = row(1, null, 'volume');
  unpaged.citation = {
    ...unpaged.citation,
    citedPage: null,
    reference: 'Juva · Baptisms 1790–1810'
  };
  expect(citedAs(unpaged)).toBe('Juva · Baptisms 1790–1810');
});
