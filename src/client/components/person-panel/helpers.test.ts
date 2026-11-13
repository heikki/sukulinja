import { expect, test } from 'bun:test';

import type { LinkStatus } from '@/client/state';
import type { CitationRow, FactRow, Link } from '@/common/types';

import {
  archiveAction,
  factBrief,
  factText,
  headingOf,
  siteName,
  sourcesOf,
  titleText
} from './helpers';

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
  id: 1,
  familyId: null,
  tag: 'DEAT',
  type: null,
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

test('names a Fact briefly by its kind and date, a marriage by the spouse too', () => {
  expect(factBrief({ ...DEATH, date: '7 APR 2025' })).toBe('Death 7.4.2025');
  expect(factBrief(DEATH)).toBe('Death');
  expect(
    factBrief({ ...DEATH, tag: 'MARR', date: '1820', spouse: 'Liisa Malli' })
  ).toBe('Marriage 1820 with Liisa Malli');
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
const MARKED: LinkStatus = {
  label: 'Marked',
  link: LINK,
  browse: null,
  unlinked: null
};

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
  cited: null,
  supports: [],
  transcribed: []
};

test('names a Citation of an Image by its Volume, whatever its text', () => {
  expect(titleText(OF_IMAGE, MARKED)).toBe('Pää- ja rippikirjat (1790-1796)');
  // Its text isn't its heading, so it unfolds below.
  expect(headingOf(OF_IMAGE)).toBe(VOLUME);
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

test("a reference's archive is found where none is known, else changed", () => {
  const imported = {
    ...OF_IMAGE,
    madeInApp: false,
    cited: { parish: 'Puumala', kind: 'rippi' as const, years: null }
  };
  const none: LinkStatus = {
    label: 'No scan',
    link: null,
    browse: null,
    unlinked: 'no-archive'
  };
  expect(archiveAction(imported, none)).toBe('find');
  expect(archiveAction(imported, MARKED)).toBe('change');
  const failed = { ...none, unlinked: 'astia-error' as const };
  expect(archiveAction(imported, failed)).toBeNull();
  // A Citation of an Image has no parish's spelling to link.
  expect(archiveAction(OF_IMAGE, MARKED)).toBeNull();
});

test("finds a Fact's sources among the person's, by the Facts each supports", () => {
  const birth = { ...DEATH, id: 7, tag: 'BIRT' };
  const one = { citation: { ...OF_IMAGE, supports: [3, 7] } };
  const other = { citation: { ...OF_IMAGE, id: 5, supports: [3] } };
  expect(sourcesOf(birth, [one, other])).toEqual([one]);
});
