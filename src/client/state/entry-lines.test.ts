import { expect, test } from 'bun:test';

import { editedTyped, recordTyped } from './entry-lines';

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
    place: ''
  });
  expect(recordTyped('MARR', record([['Avioliitto', 'Marras 1820']]))).toEqual({
    date: '11/1820',
    lifeDate: '',
    place: ''
  });
  expect(recordTyped('BURI', record([['Kuolema', '1850']]))).toEqual({
    date: '',
    lifeDate: '1850',
    place: ''
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
    place: 'Kylämaa 3'
  });
});

test("an Entry with nothing saved is edited from its Transcription's lines", () => {
  const text = 'Matti\nKylä: Kylämaa\nMaatila: No. 3';
  expect(editedTyped('RESI', null, text).place).toBe('Kylämaa 3');
  const saved = { date: null, lifeDate: null, place: 'Esimerkkilä 2' };
  expect(editedTyped('RESI', saved, text).place).toBe('Esimerkkilä 2');
});
