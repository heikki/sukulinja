import { expect, test } from 'bun:test';

import type { CitationRow, Link, LinkResolution } from '@common/types';

import { groupSources, linkStatus } from './sources';

const BASE = { volumeId: 'v1', volume: 'I Aa:5', url: '' };
const BOX = { left: 0, top: 0.5, width: 1, height: 0.05 };
const link: Link = {
  ...BASE,
  precision: 'entry',
  image: 18,
  box: BOX,
  certainty: 'marked'
};

function label(s: Link) {
  return linkStatus({ links: [s] }, false).label;
}

test('names a Link by who says so and how far down, and says what that means', () => {
  expect(label(link)).toBe('Marked');
  expect(
    label({ ...BASE, precision: 'image', image: 18, certainty: 'marked' })
  ).toBe('Marked Image');
  expect(
    label({
      ...BASE,
      precision: 'image',
      image: 18,
      certainty: 'estimated',
      from: 'pins'
    })
  ).toBe('Estimated Image');
  expect(label({ ...BASE, precision: 'volume', certainty: 'estimated' })).toBe(
    'Estimated Volume'
  );
  expect(label({ ...BASE, precision: 'volume', certainty: 'marked' })).toBe(
    'Marked Volume'
  );
  const vision: Link = { ...link, certainty: 'vision' };
  expect(label(vision)).toBe('Vision match');
  expect(linkStatus({ links: [link] }, false).title).toBe(
    'A person marked this record on this Image.'
  );
  expect(linkStatus({ links: [vision] }, false).title).toMatch(
    /^The vision model found the name on this Image\.[^\n]*$/
  );
});

test('opens a Split reference on its first Volume', () => {
  const other = { ...link, volumeId: 'v2', volume: 'I Aa:6' };
  const status = linkStatus({ links: [link, other] }, false);
  expect(status.label).toBe('Marked · one of several Volumes');
  expect(status.link).toEqual(link);
});

test('says why a source has no scan', () => {
  expect(linkStatus(undefined, true)).toMatchObject({
    label: 'Finding scan…',
    link: null
  });
  expect(linkStatus(undefined, false)).toMatchObject({
    label: 'Scan unavailable',
    link: null
  });
  expect(linkStatus({ unlinked: 'not-digitized' }, false)).toEqual({
    label: 'Not found',
    title: "Its Volume isn't digitized in Astia.",
    link: null
  });
  expect(linkStatus({ unlinked: 'astia-error' }, false)).toMatchObject({
    label: 'Astia error',
    link: null
  });
});

function source(id: number, citedPage: number | null, churchBook = true) {
  const row: CitationRow = {
    id,
    source: null,
    reference: null,
    entry: null,
    page: null,
    url: null,
    record: null,
    text: null,
    churchBook,
    citedPage
  };
  return row;
}

test('groups sources by archive, each Volume together by page', () => {
  const rows = [
    source(1, null),
    source(2, 364),
    source(3, 135),
    source(4, 193),
    source(5, null),
    source(6, null, false),
    source(7, 12)
  ];
  const here = { ...link, archive: 'Pieksämäen seurakunnan arkisto' };
  const v8 = { ...here, volumeId: 'v8', volume: 'I Aa:8' };
  const v15 = { ...here, volumeId: 'v15', volume: 'I Aa:15' };
  const there = {
    ...link,
    volumeId: 'j1',
    archive: 'Joroisten seurakunnan arkisto'
  };
  const scans = new Map<number, LinkResolution>([
    [1, { links: [here] }],
    [2, { links: [v8] }],
    [3, { links: [v8, v15] }],
    [4, { links: [v15] }],
    [5, { unlinked: 'not-digitized' }],
    [7, { links: [there] }]
  ]);
  const groups = groupSources(rows, scans, false).map((g) => [
    g.label,
    g.sources.map((s) => s.citation.id)
  ]);
  expect(groups).toEqual([
    ['Pieksämäen seurakunnan arkisto', [1, 3, 2, 4]],
    ['Church books', [5]],
    ['Other', [6]],
    ['Joroisten seurakunnan arkisto', [7]]
  ]);
  const others = groupSources([source(6, null, false)], new Map(), false);
  expect(others.map((g) => g.label)).toEqual([null]);
});
