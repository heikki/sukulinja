import { expect, test } from 'bun:test';

import type { CitationRow, Scan, ScanResolution } from '@common/types';

import { volumeTitle } from '../scan-viewer/citations';
import { groupSources, scanStatus, siteName } from './helpers';

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

const scan: Scan = {
  volumeId: 'v1',
  volume: 'I Aa:5',
  image: 18,
  url: '',
  method: 'placed'
};

function label(s: Scan) {
  return scanStatus({ scans: [s] }, false).label;
}

test('says how a scan was found, what that means, and where', () => {
  expect(label(scan)).toBe('Verified');
  expect(label({ ...scan, by: 'hand' })).toBe('Verified');
  expect(label({ ...scan, method: 'anchored' })).toBe('Estimated');
  expect(label({ ...scan, method: 'estimated' })).toBe('Estimated');
  expect(label({ ...scan, method: 'volume' })).toBe('Volume only');
  const vision = { ...scan, by: 'vision' as const };
  expect(label(vision)).toBe('Vision match');
  expect(scanStatus({ scans: [scan] }, false).title).toBe(
    'A person marked this record on this Image.\nI Aa:5, image 18'
  );
  expect(scanStatus({ scans: [vision] }, false).title).toMatch(
    /^The vision model found the name on this Image\..*\nI Aa:5, image 18$/
  );
});

test('opens a Split reference on its first Volume', () => {
  const other = { ...scan, volumeId: 'v2', volume: 'I Aa:6' };
  const status = scanStatus({ scans: [scan, other] }, false);
  expect(status.label).toBe('Verified · one of several Volumes');
  expect(status.scan).toEqual(scan);
});

test('says why a source has no scan', () => {
  expect(scanStatus(undefined, true)).toMatchObject({
    label: 'Finding scan…',
    scan: null
  });
  expect(scanStatus({ error: 'not digitized' }, false)).toMatchObject({
    label: 'Not found',
    scan: null
  });
  expect(scanStatus({ error: 'no archive' }, false)).toMatchObject({
    label: 'No scan',
    scan: null
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
  const here = { ...scan, archive: 'Pieksämäen seurakunnan arkisto' };
  const v8 = { ...here, volumeId: 'v8', volume: 'I Aa:8' };
  const v15 = { ...here, volumeId: 'v15', volume: 'I Aa:15' };
  const there = {
    ...scan,
    volumeId: 'j1',
    archive: 'Joroisten seurakunnan arkisto'
  };
  const scans = new Map<number, ScanResolution>([
    [1, { scans: [here] }],
    [2, { scans: [v8] }],
    [3, { scans: [v8, v15] }],
    [4, { scans: [v15] }],
    [5, { error: 'not digitized' }],
    [7, { scans: [there] }]
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
