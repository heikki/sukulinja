import { expect, test } from 'bun:test';

import type { Box, LinkTarget, VolumeCitation } from '@common/types';

import {
  boxOf,
  entriesOn,
  groupCitations,
  imageOf,
  linkHint,
  linkLabel,
  splitLabel
} from './citations';

const BOX: Box = { left: 0, top: 0.5, width: 1, height: 0.05 };

function marked(image: number, box?: Box): LinkTarget {
  return box === undefined
    ? { precision: 'image', image, certainty: 'marked' }
    : { precision: 'entry', image, box, certainty: 'marked' };
}

function vision(image: number, box = BOX): LinkTarget {
  return { precision: 'entry', image, box, certainty: 'vision' };
}

function estimated(image: number, from: 'pins' | 'numbering'): LinkTarget {
  return { precision: 'image', image, certainty: 'estimated', from };
}

const VOLUME: LinkTarget = { precision: 'volume', certainty: 'estimated' };

// A row with its Link pointing at `target`.
function row(personId: number, target: LinkTarget): VolumeCitation {
  return {
    personId,
    citation: {
      id: personId * 10,
      source: null,
      reference: 'Juva · Pää- ja rippikirjat 1790–1796 · p. 12',
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
      url: 'astia/1',
      archive: 'Juvan seurakunnan arkisto',
      ...target
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

test("groups the Image's rows by who says so", () => {
  const rows = [
    row(1, estimated(7, 'pins')),
    row(2, marked(7)),
    row(3, estimated(7, 'numbering')),
    row(4, vision(8)),
    row(5, VOLUME),
    row(6, vision(7)),
    row(7, { precision: 'volume', certainty: 'marked' })
  ];
  expect(shown(rows, 7)).toEqual([
    { label: 'Marked', people: ['Liisa'] },
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
    row(1, vision(7, at(0.6))),
    row(2, marked(7)),
    row(3, vision(7, at(0.2)))
  ];
  expect(shown(rows, 7)).toEqual([
    { label: 'Marked', people: ['Liisa'] },
    { label: 'Vision match', people: ['Anna', 'Matti'] }
  ]);
});

test('names a Link by who says so, then how far down', () => {
  expect(linkLabel(marked(7, BOX))).toBe('Marked');
  expect(linkLabel(marked(7))).toBe('Marked Image');
  expect(linkLabel({ precision: 'volume', certainty: 'marked' })).toBe(
    'Marked Volume'
  );
  expect(linkLabel(vision(7))).toBe('Vision match');
  expect(linkLabel(estimated(7, 'pins'))).toBe('Estimated Image');
  expect(linkLabel(VOLUME)).toBe('Estimated Volume');
  expect(linkHint(marked(7))).toMatch(/where on it isn't marked\.$/);
  expect(linkHint(estimated(7, 'pins'))).toMatch(/^Counted from page numbers/);
  expect(linkHint(estimated(7, 'numbering'))).toMatch(
    /^Guessed from the usual pages/
  );
  expect(linkHint(VOLUME)).toMatch(/may be the wrong one/);
  expect(splitLabel('Estimated Image')).toBe(
    'Estimated Image · one of several Volumes'
  );
});

test('marks one entry per Box on the Image, shared by those it records', () => {
  const box = { left: 0.1, top: 0.4, width: 0.3, height: 0.03 };
  const other = { ...box, top: 0.6 };
  const rows = [
    row(1, vision(7, box)),
    row(2, vision(7, box)),
    row(3, vision(7, other)),
    row(4, vision(8, box)),
    row(5, marked(7))
  ];
  expect(
    entriesOn(rows, 7).map((e) => ({ box: e.box, people: e.rows.map(nameOf) }))
  ).toEqual([
    { box, people: ['Matti', 'Liisa'] },
    { box: other, people: ['Anna'] }
  ]);
});

test('a Box and an Image are there only as far down as the Link points', () => {
  expect(boxOf(row(1, vision(7)))).toEqual(BOX);
  expect(boxOf(row(1, marked(7)))).toBeNull();
  expect(imageOf(row(1, marked(7)))).toBe(7);
  expect(imageOf(row(1, VOLUME))).toBeNull();
  const boxed: LinkTarget = {
    precision: 'image',
    image: 7,
    // @ts-expect-error: a Box only at the entry
    box: BOX,
    certainty: 'marked'
  };
  const imaged: LinkTarget = {
    precision: 'volume',
    // @ts-expect-error: no Image on a Volume Link
    image: 7,
    certainty: 'estimated'
  };
  // @ts-expect-error: the vision model only pins an entry
  const vague: LinkTarget = {
    precision: 'image',
    image: 7,
    certainty: 'vision'
  };
  expect([boxed, imaged, vague]).toHaveLength(3);
});
