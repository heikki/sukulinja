import { expect, test } from 'bun:test';

import type { Scan } from '@common/types';

import { scanLabel, scanTitle, siteName } from './helpers';

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

test('marks a link the vision model matched', () => {
  const scan: Scan = {
    volumeId: 'v1',
    volume: 'I Aa:5',
    image: 18,
    url: '',
    method: 'placed'
  };
  expect(scanLabel(scan)).toBe('Astia');
  expect(scanLabel({ ...scan, by: 'hand' })).toBe('Astia');
  expect(scanLabel({ ...scan, method: 'estimated' })).toBe(
    'Astia (approximate)'
  );
  const vision = { ...scan, by: 'vision' as const };
  expect(scanLabel(vision)).toBe('Astia (vision match)');
  expect(scanTitle([scan])).toBe('I Aa:5, image 18');
  expect(scanTitle([vision])).toBe(
    'I Aa:5, image 18\nMatched by the vision model: mark the right Image to correct it.'
  );
});
