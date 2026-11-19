import { expect, test } from 'bun:test';

import type { BookSuggestion, SuggestedVolume } from '@/common/types';

import { fitLines } from './fits';

const JUVA = {
  archiveId: '1',
  title: 'Juvan seurakunnan arkisto',
  parish: 'Juva'
};

function volume(near: boolean): SuggestedVolume {
  return {
    id: 'v',
    label: 'I C:1 Syntyneiden ja kastettujen luettelot (1790-1810)',
    years: { from: 1790, to: 1810 },
    archiveId: '1',
    archive: JUVA.title,
    parish: 'Juva',
    near
  };
}

function suggestion(more: Partial<BookSuggestion>): BookSuggestion {
  return {
    expected: {
      kind: 'kastetut',
      of: 'birth',
      years: { from: 1796, to: 1796 },
      estimated: false,
      places: ['Kaipola, Juva, Suomi']
    },
    parishes: [JUVA],
    volumes: [volume(true)],
    ...more
  };
}

test('says what is expected, when, and in which parish', () => {
  const [line] = fitLines([suggestion({})]);
  expect(line?.why).toBe('Baptism 1796 · Juva');
  expect(line?.none).toBeNull();
});

test('marks years a life with no death runs to', () => {
  const [line] = fitLines([
    suggestion({
      expected: {
        kind: 'rippi',
        of: 'life',
        years: { from: 1796, to: 1835 },
        estimated: true,
        places: []
      }
    })
  ]);
  expect(line?.why).toBe('Life ~1796–1835 · Juva');
});

test('says why no Volume fits', () => {
  const [none, nowhere] = fitLines([
    suggestion({ volumes: [] }),
    suggestion({ volumes: [], parishes: [] })
  ]);
  expect(none?.why).toBe('Baptism 1796');
  expect(none?.none).toBe('None digitized in Juva');
  expect(nowhere?.none).toBe('No parish known for Kaipola, Juva, Suomi');
});
