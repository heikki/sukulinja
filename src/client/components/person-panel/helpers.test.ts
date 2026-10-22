import { expect, test } from 'bun:test';

import type { LinkStatus } from '@/client/state';
import type { CitationRow, FactRow, Link } from '@/common/types';

import { factText, headingOf, siteName, titleText } from './helpers';

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

const VOLUME = 'I Aa:1 Pää- ja rippikirjat (1790-1796)';
const LINK: Link = {
  volumeId: 'juva-1',
  volume: VOLUME,
  url: 'https://astia.narc.fi/uusiastia/viewer/?fileId=f13&aineistoId=juva-1',
  precision: 'entry',
  image: 13,
  box: { left: 100, top: 200, width: 500, height: 50 },
  certainty: 'marked',
  archive: 'Juvan seurakunnan arkisto'
};
const MARKED: LinkStatus = { label: 'Marked', link: LINK, browse: null };

// A Citation of the Image, as the server gives one made in the app.
const OF_IMAGE: CitationRow = {
  id: 4,
  source: VOLUME,
  reference: null,
  entry: 'Image\u00a013',
  page: LINK.url,
  url: LINK.url,
  record: null,
  text: 'Baptism 12.3.1795',
  churchBook: true,
  madeInApp: true,
  markKey: 'citation 4',
  citedPage: null,
  cited: null
};

test('names a Citation of an Image by its text, or by its Volume', () => {
  expect(titleText(OF_IMAGE, MARKED)).toBe('Baptism 12.3.1795');
  expect(headingOf(OF_IMAGE)).toBe('Baptism 12.3.1795');
  const untold = { ...OF_IMAGE, text: null };
  expect(titleText(untold, MARKED)).toBe('Pää- ja rippikirjat (1790-1796)');
  expect(headingOf(untold)).toBe(VOLUME);
});

test('names a linked Church-book reference by its Volume, whatever its text', () => {
  const imported = {
    ...OF_IMAGE,
    reference: 'Juva · Pää- ja rippikirjat 1790–1796 · p. 12',
    madeInApp: false,
    cited: { parish: 'Juva', kind: 'rippi' as const, years: null }
  };
  expect(titleText(imported, MARKED)).toBe('Pää- ja rippikirjat (1790-1796)');
});
