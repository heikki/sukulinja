import { expect, test } from 'bun:test';

import {
  datesRefusal,
  editedTyped,
  fieldsOf,
  NO_TYPED,
  pageOfBox,
  recordTyped
} from './entry-lines';

function record(fields: Array<[string, string]>) {
  return {
    name: 'Matti Esimerkki',
    fields: fields.map(([label, value]) => ({ label, value })),
    household: []
  };
}

test("a record's dates start a baptism's, a marriage's or a burial's Entry pane", () => {
  const baptism = record([
    ['Syntymä', '1. Maalis 1795 - Juva, Mikkeli, Finland'],
    ['Ristiäiset', '3. Maalis 1795 - Juva, Mikkeli, Finland']
  ]);
  expect(recordTyped('CHR', baptism)).toEqual({
    date: '3.3.1795',
    lifeDate: '1.3.1795',
    place: '',
    page: ''
  });
  expect(recordTyped('MARR', record([['Avioliitto', 'Marras 1820']]))).toEqual({
    date: '11/1820',
    lifeDate: '',
    place: '',
    page: ''
  });
  expect(recordTyped('BURI', record([['Kuolema', '1850']]))).toEqual({
    date: '',
    lifeDate: '1850',
    place: '',
    page: ''
  });
  expect(recordTyped(null, baptism).date).toBe('');
});

test("a household line's record gives its village and farm as its place", () => {
  const line = record([
    ['Syntymäpäivä', '1757'],
    ['Maatila', 'No. 3'],
    ['Kylä', 'Kylämaa']
  ]);
  expect(recordTyped('RESI', line)).toEqual({
    date: '',
    lifeDate: '',
    place: 'Kylämaa 3',
    page: ''
  });
});

test("an Entry with nothing saved is edited from its Transcription's lines", () => {
  const text = 'Matti\nKylä: Kylämaa\nMaatila: No. 3';
  expect(editedTyped('RESI', null, text).place).toBe('Kylämaa 3');
  const saved = {
    date: null,
    lifeDate: null,
    place: 'Esimerkkilä 2',
    page: null
  };
  expect(editedTyped('RESI', saved, text).place).toBe('Esimerkkilä 2');
});

test("a rippikirja's record gives its page number, kept as one (ADR-0039)", () => {
  const line = record([['Sivu', '47']]);
  expect(recordTyped('RESI', line).page).toBe('47');
  expect(fieldsOf('RESI', { ...NO_TYPED, page: ' 47 ' }).page).toBe(47);
  expect(fieldsOf('RESI', NO_TYPED).page).toBeNull();
  expect(datesRefusal('RESI', { ...NO_TYPED, page: '47b' })).toBe(
    'Page: write the page as a number.'
  );
  // Only a page saved, the dates still start from the Transcription.
  const saved = { date: null, lifeDate: null, place: null, page: 47 };
  expect(
    editedTyped('CHR', saved, 'Matti\nRistiäiset: 3. Maalis 1795 - Juva')
  ).toMatchObject({ date: '3.3.1795', page: '47' });
});

test('a farm the record names in full is its place as written', () => {
  const named = record([['Maatila', 'No. 15 Haukivuori']]);
  expect(recordTyped('RESI', named).place).toBe('No. 15 Haukivuori');
  const both = record([
    ['Kylä', 'Haukivuori'],
    ['Maatila', 'No. 15 Haukivuori']
  ]);
  expect(recordTyped('RESI', both).place).toBe('No. 15 Haukivuori');
});

test("a Box's page is its Image's, a spread's by the half it's in", () => {
  const left = { left: 100, top: 10, width: 300, height: 40 };
  const right = { ...left, left: 1200 };
  expect(pageOfBox([12], right, 2000)).toBe('12');
  expect(pageOfBox([12, 13], left, 2000)).toBe('12');
  expect(pageOfBox([12, 13], right, 2000)).toBe('13');
  expect(pageOfBox([12, 13], right, null)).toBe('12');
  expect(pageOfBox([], left, 2000)).toBe('');
});
