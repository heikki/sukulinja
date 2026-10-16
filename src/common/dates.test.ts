import { describe, expect, test } from 'bun:test';

import { gedcomDate, isoDate } from './dates';

describe('gedcomDate', () => {
  test('writes a day, month or year the Finnish way', () => {
    expect(gedcomDate('12 MAR 1850')).toBe('12.3.1850');
    expect(gedcomDate('MAR 1850')).toBe('3/1850');
    expect(gedcomDate('1850')).toBe('1850');
    expect(gedcomDate('NOV 857')).toBe('11/857');
  });

  test('reads ranges and spans as dashed', () => {
    expect(gedcomDate('BET 1867 AND 1879')).toBe('1867–1879');
    expect(gedcomDate('BET 2 SEP 1850 AND 16 FEB 1851')).toBe(
      '2.9.1850–16.2.1851'
    );
    expect(gedcomDate('FROM 1867 TO 14 OCT 1879')).toBe('1867–14.10.1879');
    expect(gedcomDate('FROM 1867')).toBe('1867–');
    expect(gedcomDate('TO 1879')).toBe('–1879');
  });

  test('words approximate and bounded dates in Finnish', () => {
    expect(gedcomDate('ABT 1850')).toBe('n. 1850');
    expect(gedcomDate('EST 27 JUL 1850')).toBe('n. 27.7.1850');
    expect(gedcomDate('BEF MAY 1850')).toBe('ennen 5/1850');
    expect(gedcomDate('AFT 25 OCT 1850')).toBe('25.10.1850 jälkeen');
  });

  test('keeps a date it cannot read as recorded', () => {
    expect(gedcomDate('@#DFRENCH R@ 25 VEND 2')).toBe('@#DFRENCH R@ 25 VEND 2');
    expect(gedcomDate('BET 1850 AND spring')).toBe('BET 1850 AND spring');
    expect(gedcomDate('12 1850')).toBe('12 1850');
  });
});

describe('isoDate', () => {
  test('writes an entry date as precisely as it is given', () => {
    expect(isoDate('1761-03-03')).toBe('3.3.1761');
    expect(isoDate('1761-03')).toBe('3/1761');
    expect(isoDate('1761')).toBe('1761');
  });
});
