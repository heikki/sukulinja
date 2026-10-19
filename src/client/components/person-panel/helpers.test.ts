import { expect, test } from 'bun:test';

import type { CitationRow, Link, LinkResolution } from '@common/types';

import { volumeTitle } from '../scan-viewer/citations';
import { groupSources, linkStatus, siteName } from './helpers';

test('names a record link by its site', () => {
  expect(
    siteName('https://www.myheritage.fi/research/collection-10509/x?itemId=1')
  ).toBe('MyHeritage');
  expect(siteName('https://www.familysearch.org/ark:/61903/1:1:X')).toBe(
    'FamilySearch'
  );
  expect(siteName('https://www.example.org/records/1')).toBe('example.org');
  expect(siteName('not a link')).toBe('Record');
});

const link: Link = {
  volumeId: 'v1',
  volume: 'I Aa:5',
  image: 18,
  url: '',
  certainty: 'exact'
};

function label(s: Link) {
  return linkStatus({ links: [s] }, false).label;
}

test('says how sure a Link is, and what that means', () => {
  expect(label(link)).toBe('Exact');
  expect(label({ ...link, certainty: 'estimated', from: 'pins' })).toBe(
    'Estimated'
  );
  expect(label({ ...link, certainty: 'estimated' })).toBe('Estimated');
  expect(label({ ...link, certainty: 'volume' })).toBe('Volume only');
  const vision = { ...link, certainty: 'vision' as const };
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
  expect(status.label).toBe('Exact · one of several Volumes');
  expect(status.link).toEqual(link);
});

test('says why a source has no scan', () => {
  expect(linkStatus(undefined, true)).toMatchObject({
    label: 'Finding scan…',
    link: null
  });
  expect(linkStatus({ error: 'not digitized' }, false)).toMatchObject({
    label: 'Not found',
    link: null
  });
  expect(linkStatus({ error: 'no archive' }, false)).toMatchObject({
    label: 'No scan',
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
    [5, { error: 'not digitized' }],
    [7, { links: [there] }]
  ]);
  const groups = groupSources(rows, scans).map((g) => [
    g.label,
    g.rows.map((r) => r.id)
  ]);
  expect(groups).toEqual([
    ['Pieksämäen seurakunnan arkisto', [1, 3, 2, 4]],
    ['Church books', [5]],
    ['Other', [6]],
    ['Joroisten seurakunnan arkisto', [7]]
  ]);
  const others = groupSources([source(6, null, false)], new Map());
  expect(others.map((g) => g.label)).toEqual([null]);
});

test('names a Volume without its archive code', () => {
  expect(volumeTitle('I Aa:8 Pää- ja rippikirjat (1783-1790)')).toBe(
    'Pää- ja rippikirjat (1783-1790)'
  );
  expect(
    volumeTitle(
      'I Aa:15 Pää- ja rippikirjat, I Armisvesi - Pieksämäki (1827-1837)'
    )
  ).toBe('Pää- ja rippikirjat, I Armisvesi - Pieksämäki (1827-1837)');
  expect(
    volumeTitle('I C:4 Syntyneiden ja kastettujen luettelot (1744-1766)')
  ).toBe('Syntyneiden ja kastettujen luettelot (1744-1766)');
});
