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

test('names a Link by who says so and how far down', () => {
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
  const vision: Link = { ...link, certainty: 'match' };
  expect(label(vision)).toBe('Match');
});

test('opens a Split reference on its first Volume', () => {
  const other = { ...link, volumeId: 'v2', volume: 'I Aa:6' };
  const status = linkStatus({ links: [link, other] }, false);
  expect(status.label).toBe('Marked');
  expect(status.link).toEqual(link);
});

test('counts the other Volumes an Estimated Volume could be', () => {
  const volume: Link = { ...BASE, precision: 'volume', certainty: 'estimated' };
  const others = ['v2', 'v3'].map((volumeId) => ({ ...volume, volumeId }));
  const status = linkStatus({ links: [volume, ...others] }, false);
  expect(status.label).toBe('Estimated Volume +2');
  expect(linkStatus({ links: [volume] }, false).label).toBe('Estimated Volume');
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
    link: null,
    browse: null
  });
  expect(linkStatus({ unlinked: 'astia-error' }, false)).toMatchObject({
    label: 'Astia error',
    link: null
  });
});

test("can be browsed for when its parish's books were looked through", () => {
  const looked = {
    unlinked: 'no-volume' as const,
    archive: 'Mikkelin maaseurakunnan arkisto'
  };
  expect(linkStatus(looked, false)).toMatchObject({
    label: 'Not found',
    link: null,
    browse: looked
  });
  expect(linkStatus({ unlinked: 'unparsed' }, false).browse).toBeNull();
  expect(linkStatus({ links: [link] }, false).browse).toBeNull();
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
    madeInApp: false,
    citedPage,
    cited: null
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

test("puts a reference its archive's books lack under that archive, after the linked", () => {
  const archive = 'Mikkelin maaseurakunnan arkisto';
  const here = { ...link, archive };
  const scans = new Map<number, LinkResolution>([
    [1, { unlinked: 'no-volume', archive }],
    [2, { links: [here] }],
    [3, { unlinked: 'unparsed' }]
  ]);
  const rows = [source(1, null), source(2, 12), source(3, null)];
  const groups = groupSources(rows, scans, false).map((g) => [
    g.label,
    g.sources.map((s) => s.citation.id)
  ]);
  expect(groups).toEqual([
    [archive, [2, 1]],
    ['Church books', [3]]
  ]);
});

// What an imported Church-book reference cites.
const CITED = {
  parish: 'Juva',
  kind: 'rippi' as const,
  years: { from: 1790, to: 1796 }
};

test('files a Citation of an Image under its archive, with the references there', () => {
  const archive = 'Juvan seurakunnan arkisto';
  const here = { ...link, archive };
  const ofImage = { ...source(2, null), madeInApp: true, text: 'Baptism' };
  const rows = [{ ...source(1, 12), cited: CITED }, ofImage];
  const scans = new Map<number, LinkResolution>([
    [1, { links: [here] }],
    [2, { links: [here] }]
  ]);
  const [group, ...rest] = groupSources(rows, scans, false);
  expect(rest).toEqual([]);
  expect(group!.label).toBe(archive);
  expect(group!.sources.map((s) => [s.citation.id, s.status?.label])).toEqual([
    [2, 'Marked'],
    [1, 'Marked']
  ]);
});
