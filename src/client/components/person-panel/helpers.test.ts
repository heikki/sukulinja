import { expect, test } from 'bun:test';

import type { Scan } from '@common/types';

import { scanStatus, siteName } from './helpers';

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
  expect(status.target).toEqual({ scan });
});

test('says why a source has no scan, and whether it can be looked for', () => {
  expect(scanStatus(undefined, true)).toMatchObject({
    label: 'Finding scan…',
    target: null
  });
  expect(scanStatus({ error: 'not digitized' }, false)).toMatchObject({
    label: 'Not found',
    target: { scan: null }
  });
  expect(scanStatus({ error: 'no archive' }, false)).toMatchObject({
    label: 'No scan',
    target: null
  });
});
