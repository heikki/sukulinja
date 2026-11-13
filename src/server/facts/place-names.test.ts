import { expect, test } from 'bun:test';

import { tidyPlace } from './place-names';

test('leaves out the province before the country, which is Suomi', () => {
  expect(
    tidyPlace('Laukola, Haukivuori, Haukivuori, Mikkeli (St. Michel), Finland')
  ).toBe('Laukola, Haukivuori, Suomi');
  expect(tidyPlace('Juva, Mikkeli, Finland')).toBe('Juva, Suomi');
  expect(tidyPlace('Mikkeli,Mikkeli,Finland')).toBe('Mikkeli, Suomi');
  expect(tidyPlace('Helsinki, Uusimaa, Suomi')).toBe('Helsinki, Suomi');
});

test('names a village named as its parish once', () => {
  expect(
    tidyPlace('Haukivuori, Haukivuori, Mikkeli (St. Michel), Finland')
  ).toBe('Haukivuori, Suomi');
  expect(tidyPlace('Hankinoni, Haukivuori, Suomi')).toBe(
    'Hankinoni, Haukivuori, Suomi'
  );
});

test('names the parish in Finnish only', () => {
  expect(
    tidyPlace('No. 3, Karkianmaa, Juva (Jockas), Mikkeli (St. Michel), Finland')
  ).toBe('No. 3, Karkianmaa, Juva, Suomi');
});

test("leaves out a cemetery's region", () => {
  expect(
    tidyPlace(
      'Lepolan Hautausmaa, Hankasalmi, Hankasalmi, Keski-Suomi, Finland'
    )
  ).toBe('Lepolan Hautausmaa, Hankasalmi, Suomi');
});

test('keeps a town of the same name, and places outside Finland', () => {
  expect(tidyPlace('Mikkeli, Finland')).toBe('Mikkeli, Suomi');
  expect(tidyPlace('Finland')).toBe('Suomi');
  expect(tidyPlace('Juva')).toBe('Juva');
  expect(tidyPlace('Portland, Multnomah, Oregon, USA')).toBe(
    'Portland, Multnomah, Oregon, USA'
  );
  expect(tidyPlace('Haukivuori 5')).toBe('Haukivuori 5');
});

test('spells a parish one way', () => {
  expect(tidyPlace('Pieksamaki, Mikkeli, Finland')).toBe('Pieksämäki, Suomi');
  expect(
    tidyPlace(
      'No. 4, Wanhamäki, Mikkeli Maaseurakunta, Mikkeli (St. Michel), Finland'
    )
  ).toBe('No. 4, Wanhamäki, Mikkelin maaseurakunta, Suomi');
  expect(tidyPlace('Pyhäjärvi Pieksämäki, Mikkeli, Finland')).toBe(
    'Pyhäjärvi, Pieksämäki, Suomi'
  );
});

test('writes a place it wrote the same way again', () => {
  for (const place of [
    'Haukivuoren Hautausmaa, Mikkeli, Etelä-Savo, Finland',
    'Laukola, Haukivuori, Haukivuori, Mikkeli (St. Michel), Finland',
    'Mikkeli, Mikkeli, Finland',
    'Pyhäjärvi Pieksämäki, Mikkeli, Finland'
  ]) {
    const once = tidyPlace(place);
    expect(tidyPlace(once)).toBe(once);
  }
  expect(
    tidyPlace('Haukivuoren Hautausmaa, Mikkeli, Etelä-Savo, Finland')
  ).toBe('Haukivuoren Hautausmaa, Mikkeli, Suomi');
  expect(tidyPlace('Kirvu, Viipuri, Suomi')).toBe('Kirvu, Viipuri, Suomi');
});
