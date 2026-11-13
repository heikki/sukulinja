import { expect, test } from 'bun:test';

import { suggestionsFor } from './suggest';

const TALO = 'Mäkelä, Kylä, Pitäjä, Suomi';
const KYLA = 'Kylä, Pitäjä, Suomi';
const MUU = 'Toinen, Suomi';
const PLACES = [TALO, KYLA, MUU];

test('suggests what holds every word typed, in any case', () => {
  expect(suggestionsFor('mäkelä pitä', PLACES, 8)).toEqual([TALO]);
  expect(suggestionsFor('Kylä,', PLACES, 8)).toEqual([TALO, KYLA]);
});

test('keeps to the most and leaves out what is typed already', () => {
  expect(suggestionsFor('suomi', PLACES, 2)).toEqual([TALO, KYLA]);
  expect(suggestionsFor(MUU, PLACES, 8)).toEqual([]);
});

test('suggests nothing for nothing typed', () => {
  expect(suggestionsFor('  ', PLACES, 8)).toEqual([]);
});
