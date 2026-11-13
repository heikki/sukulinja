import { describe, expect, test } from 'bun:test';

import { dateAgrees, dateOrder, gedcomDate, isoDate, typedDate } from './dates';

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

describe('typedDate', () => {
  test('reads a day, month or year typed the Finnish way', () => {
    expect(typedDate('12.3.1850')).toBe('12 MAR 1850');
    expect(typedDate(' 03.03.1761 ')).toBe('3 MAR 1761');
    expect(typedDate('3/1850')).toBe('MAR 1850');
    expect(typedDate('3.1850')).toBe('MAR 1850');
    expect(typedDate('1850')).toBe('1850');
  });

  test('reads ranges, open spans and approximate dates', () => {
    expect(typedDate('1867–1879')).toBe('BET 1867 AND 1879');
    expect(typedDate('1867 - 1879')).toBe('BET 1867 AND 1879');
    expect(typedDate('2.9.1850–16.2.1851')).toBe(
      'BET 2 SEP 1850 AND 16 FEB 1851'
    );
    expect(typedDate('1867–')).toBe('FROM 1867');
    expect(typedDate('–1879')).toBe('TO 1879');
    expect(typedDate('n. 27.7.1850')).toBe('ABT 27 JUL 1850');
    expect(typedDate('N.1850')).toBe('ABT 1850');
    expect(typedDate('ennen 5/1850')).toBe('BEF MAY 1850');
    expect(typedDate('25.10.1850 jälkeen')).toBe('AFT 25 OCT 1850');
  });

  test("refuses what isn't a date of the calendar", () => {
    expect(typedDate('')).toBeNull();
    expect(typedDate('keväällä 1850')).toBeNull();
    expect(typedDate('31.2.1850')).toBeNull();
    expect(typedDate('29.2.1900')).toBeNull();
    expect(typedDate('29.2.1904')).toBe('29 FEB 1904');
    expect(typedDate('13/1850')).toBeNull();
    expect(typedDate('1850–spring')).toBeNull();
    expect(typedDate('n. ')).toBeNull();
  });

  test('reads back each date the panel shows', () => {
    for (const date of [
      '12 MAR 1850',
      'MAR 1850',
      '1850',
      'BET 2 SEP 1850 AND 16 FEB 1851',
      'FROM 1867',
      'TO 1879',
      'ABT 1850',
      'BEF MAY 1850',
      'AFT 25 OCT 1850'
    ]) {
      expect(typedDate(gedcomDate(date))).toBe(date);
    }
  });
});

test('dateOrder sorts dates by the first day they name', () => {
  expect(dateOrder('3 MAR 1761')).toBe(17610303);
  expect(dateOrder('MAR 1761')).toBe(17610300);
  expect(dateOrder('1761')).toBe(17610000);
  expect(dateOrder('BET 1867 AND 1879')).toBe(18670000);
  expect(dateOrder('ABT 12 JAN 1850')).toBe(18500112);
  expect(dateOrder('@#DJULIAN@ x')).toBeNull();
});

describe('dateAgrees', () => {
  test('agrees as far as both say', () => {
    expect(dateAgrees('1867-05-15', '15 MAY 1867')).toBe(true);
    expect(dateAgrees('1867', '15 MAY 1867')).toBe(true);
    expect(dateAgrees('1867-05-15', 'MAY 1867')).toBe(true);
    expect(dateAgrees('1856-08-09', '8 SEP 1856')).toBe(false);
    expect(dateAgrees('1868', '1867')).toBe(false);
  });

  test('reads ranges, bounds and approximate dates', () => {
    expect(dateAgrees('1870-03-01', 'BET 1867 AND 1879')).toBe(true);
    expect(dateAgrees('1879-12-31', 'BET 1867 AND 1879')).toBe(true);
    expect(dateAgrees('1880', 'FROM 1867 TO 1879')).toBe(false);
    expect(dateAgrees('1850-05-01', 'BEF MAY 1850')).toBe(true);
    expect(dateAgrees('1850-06', 'BEF MAY 1850')).toBe(false);
    expect(dateAgrees('1851', 'AFT 25 OCT 1850')).toBe(true);
    expect(dateAgrees('1850-03-02', 'ABT 1850')).toBe(true);
    expect(dateAgrees('1851', 'EST 1850')).toBe(false);
  });

  test("null when the Fact's date can't be read", () => {
    expect(dateAgrees('1850', '@#DJULIAN@ 1850')).toBeNull();
  });
});
