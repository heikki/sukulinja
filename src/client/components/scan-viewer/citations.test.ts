import { expect, test } from 'bun:test';

import type { Link, VolumeCitation } from '@common/types';

import {
  certaintyHint,
  certaintyLabel,
  entriesOn,
  groupCitations,
  pickedLink,
  splitLabel
} from './citations';

// A row linking `image`, or only the Volume when it's null.
function row(
  personId: number,
  image: number | null,
  certainty: Link['certainty'],
  more: Partial<Link> = {}
): VolumeCitation {
  return {
    personId,
    citation: {
      id: personId * 10,
      source: null,
      reference: 'Juva · Pää- ja rippikirjat 1790–1796 · p. 12',
      entry: 'p. 12',
      page: null,
      url: null,
      record: null,
      text: null,
      churchBook: true,
      citedPage: 12
    },
    link: {
      volumeId: 'v1',
      volume: 'I Aa:5',
      image: image ?? 1,
      url: `astia/${image ?? 1}`,
      certainty: image === null ? 'volume' : certainty,
      archive: 'Juvan seurakunnan arkisto',
      ...more
    },
    split: false
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

test("groups the Image's rows by how sure each is", () => {
  const rows = [
    row(1, 7, 'estimated', { from: 'pins' }),
    row(2, 7, 'exact'),
    row(3, 7, 'estimated', { from: 'numbering' }),
    row(4, 8, 'vision'),
    row(5, null, 'volume'),
    row(6, 7, 'vision')
  ];
  expect(shown(rows, 7)).toEqual([
    { label: 'Exact', people: ['Liisa'] },
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
    row(1, 7, 'vision', { box: at(0.6) }),
    row(2, 7, 'exact'),
    row(3, 7, 'vision', { box: at(0.2) })
  ];
  expect(shown(rows, 7)).toEqual([
    { label: 'Exact', people: ['Liisa'] },
    { label: 'Vision match', people: ['Anna', 'Matti'] }
  ]);
});

test('says how a link was found, and that a Split may be elsewhere', () => {
  expect(certaintyLabel({ certainty: 'exact' })).toBe('Exact');
  expect(certaintyLabel({ certainty: 'vision' })).toBe('Vision match');
  expect(certaintyLabel({ certainty: 'estimated' })).toBe('Estimated');
  expect(certaintyLabel({ certainty: 'volume' })).toBe('Volume only');
  expect(certaintyHint({ certainty: 'estimated', from: 'pins' })).toMatch(
    /^Counted from page numbers/
  );
  expect(certaintyHint({ certainty: 'estimated', from: 'numbering' })).toMatch(
    /^Guessed from the usual pages/
  );
  expect(splitLabel('Estimated')).toBe('Estimated · one of several Volumes');
});

test('marks one entry per Box on the Image, shared by those it records', () => {
  const box = { left: 0.1, top: 0.4, width: 0.3, height: 0.03 };
  const other = { ...box, top: 0.6 };
  const rows = [
    row(1, 7, 'vision', { box }),
    row(2, 7, 'vision', { box }),
    row(3, 7, 'vision', { box: other }),
    row(4, 8, 'vision', { box }),
    row(5, 7, 'exact')
  ];
  expect(
    entriesOn(rows, 7).map((e) => ({ box: e.box, people: e.rows.map(nameOf) }))
  ).toEqual([
    { box, people: ['Matti', 'Liisa'] },
    { box: other, people: ['Anna'] }
  ]);
});

test('opens a picked row on its own link, a Volume-only one on the Image shown', () => {
  const pinned = row(1, 7, 'vision');
  expect(pickedLink(pinned, 9, null)).toBe(pinned.link);
  const links = ['a', 'b', 'c'];
  expect(pickedLink(row(2, null, 'volume'), 3, links)).toEqual({
    volumeId: 'v1',
    volume: 'I Aa:5',
    image: 3,
    url: 'c',
    certainty: 'volume',
    archive: 'Juvan seurakunnan arkisto'
  });
});
