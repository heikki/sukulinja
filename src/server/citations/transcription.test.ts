import { describe, expect, test } from 'bun:test';

import {
  plainFields,
  transcribedDate,
  transcriptionEvents
} from './transcription';

describe('transcribedDate', () => {
  test('reads a date to the precision written', () => {
    expect(transcribedDate('29. Marras 1829')).toBe('1829-11-29');
    expect(transcribedDate('1. Tammi 1801')).toBe('1801-01-01');
    expect(transcribedDate('Joulu 1799')).toBe('1799-12');
    expect(transcribedDate('Toukokuu 1799')).toBe('1799-05');
    expect(transcribedDate('noin 1799')).toBe('1799');
    expect(transcribedDate('tuntematon')).toBeNull();
  });
});

describe('plainFields', () => {
  test("reads a converted Citation's labelled lines", () => {
    const text = [
      'Maria Juhontytär',
      'Syntymäpäivä: 15. Touko 1867',
      'Kirja: Rippikirja, 1867 - 1879',
      'Tytär; Maria; 15. Touko 1867'
    ].join('\n');
    expect(plainFields(text)).toEqual([
      { label: 'Syntymäpäivä', value: '15. Touko 1867' },
      { label: 'Kirja', value: 'Rippikirja, 1867 - 1879' }
    ]);
  });

  test('none for no text', () => {
    expect(plainFields(null)).toEqual([]);
  });
});

describe('transcriptionEvents', () => {
  test('names each event by its Fact, with its date', () => {
    expect(
      transcriptionEvents([
        { label: 'Syntymäpäivä', value: '8. Syys 1856' },
        { label: 'Asuinpaikka', value: 'päivämäärien 1867 ja 1879 välissä' },
        { label: 'Kuolinpäivä', value: '3. Maalis 1901' },
        { label: 'Avioliitto', value: '1880' }
      ])
    ).toEqual([
      { tag: 'BIRT', date: '1856-09-08' },
      { tag: 'DEAT', date: '1901-03-03' },
      { tag: 'MARR', date: '1880' }
    ]);
  });

  test("reads an index entry's date before its place", () => {
    expect(
      transcriptionEvents([
        { label: 'Ristiäiset', value: '29. Marras 1829 - Mikkeli, Finland' },
        { label: 'Syntymä', value: '20. Marras 1829 - Mikkeli' }
      ])
    ).toEqual([
      { tag: 'CHR', date: '1829-11-29' },
      { tag: 'BIRT', date: '1829-11-20' }
    ]);
  });

  test('keeps the first of a kind, and none without a year', () => {
    expect(
      transcriptionEvents([
        { label: 'Syntymäaika', value: 'tuntematon' },
        { label: 'Syntymäpäivä', value: '8. Syys 1856' },
        { label: 'Syntymä', value: '9. Elo 1856' }
      ])
    ).toEqual([{ tag: 'BIRT', date: '1856-09-08' }]);
  });
});
