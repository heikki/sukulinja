import { expect, test } from 'bun:test';

import type { VolumeCitation } from '@common/types';

import {
  entriesOn,
  groupCitations,
  methodLabel,
  splitLabel
} from './citations';

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
      reference: 'Juva · Pää- ja rippikirjat 1790–1796 · p. 12',
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

test("groups the Image's rows by status", () => {
  const rows = [
    row(1, 7, 'anchored'),
    row(2, 7, 'placed', { by: 'hand' }),
    row(3, 7, 'estimated'),
    row(4, 8, 'placed', { by: 'vision' }),
    row(5, null, 'volume'),
    row(6, 7, 'placed', { by: 'vision' })
  ];
  expect(shown(rows, 7)).toEqual([
    { label: 'Verified', people: ['Liisa'] },
    { label: 'Vision match', people: ['Pekka'] },
    { label: 'Estimated', people: ['Anna', 'Matti'] }
  ]);
  expect(shown(rows, 8)).toEqual([{ label: 'Vision match', people: ['Juho'] }]);
});

test('lists entries in the order written on the Image', () => {
  function at(top: number) {
    return { left: 0, top, width: 1, height: 0.05 };
  }
  const rows = [
    row(1, 7, 'placed', { by: 'vision', box: at(0.6) }),
    row(2, 7, 'placed', { by: 'hand' }),
    row(3, 7, 'placed', { by: 'vision', box: at(0.2) })
  ];
  expect(shown(rows, 7)).toEqual([
    { label: 'Verified', people: ['Liisa'] },
    { label: 'Vision match', people: ['Anna', 'Matti'] }
  ]);
});

test('says how a link was found, and that a Split may be elsewhere', () => {
  expect(methodLabel('placed', 'vision')).toBe('Vision match');
  expect(methodLabel('placed', 'hand')).toBe('Verified');
  expect(methodLabel('placed')).toBe('Verified');
  expect(methodLabel('anchored')).toBe('Estimated');
  expect(methodLabel('estimated')).toBe('Estimated');
  expect(methodLabel('volume')).toBe('Volume only');
  expect(splitLabel('Estimated')).toBe('Estimated · one of several Volumes');
});

test('marks one entry per Box on the Image, shared by those it records', () => {
  const box = { left: 0.1, top: 0.4, width: 0.3, height: 0.03 };
  const other = { ...box, top: 0.6 };
  const rows = [
    row(1, 7, 'placed', { by: 'vision', box }),
    row(2, 7, 'placed', { by: 'vision', box }),
    row(3, 7, 'placed', { by: 'vision', box: other }),
    row(4, 8, 'placed', { by: 'vision', box }),
    row(5, 7, 'placed', { by: 'hand' })
  ];
  expect(
    entriesOn(rows, 7).map((e) => ({ box: e.box, people: e.rows.map(nameOf) }))
  ).toEqual([
    { box, people: ['Matti', 'Liisa'] },
    { box: other, people: ['Anna'] }
  ]);
});
