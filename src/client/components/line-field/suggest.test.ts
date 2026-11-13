import { expect, test } from 'bun:test';

import { suggestionsFor } from './suggest';

const LAUKOLA =
  'Laukola, Haukivuori, Haukivuori, Mikkeli (St. Michel), Finland';
const HAUKIVUORI = 'Haukivuori, Haukivuori, Mikkeli (St. Michel), Finland';
const JUVA = 'Juva, Mikkeli, Finland';
const PLACES = [LAUKOLA, HAUKIVUORI, JUVA];

test('suggests what holds every word typed, in any case', () => {
  expect(suggestionsFor('laukola hauki', PLACES, 8)).toEqual([LAUKOLA]);
  expect(suggestionsFor('Haukivuori,', PLACES, 8)).toEqual([
    LAUKOLA,
    HAUKIVUORI
  ]);
});

test('keeps to the most and leaves out what is typed already', () => {
  expect(suggestionsFor('mikkeli', PLACES, 2)).toEqual([LAUKOLA, HAUKIVUORI]);
  expect(suggestionsFor(JUVA, PLACES, 8)).toEqual([]);
});

test('suggests nothing for nothing typed', () => {
  expect(suggestionsFor('  ', PLACES, 8)).toEqual([]);
});
