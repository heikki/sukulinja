import { expect, test } from 'bun:test';

import type { FactRow } from '@common/types';

import { factText, siteName } from './helpers';

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

const DEATH: FactRow = {
  tag: 'DEAT',
  date: null,
  place: null,
  address: null,
  value: 'Y',
  spouse: null
};

test('reads an event\'s text, leaving out GEDCOM\'s "it happened" flag', () => {
  expect(factText({ ...DEATH, date: '7 APR 2025' })).toBe('7.4.2025');
  expect(factText(DEATH)).toBe('—');
  expect(factText({ ...DEATH, tag: 'OCCU', value: 'torppari' })).toBe(
    'torppari'
  );
});
