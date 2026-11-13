import { expect, test } from 'bun:test';

import { placeOf } from './address';

test("an address standing alone is the Fact's place", () => {
  const chain = 'No. 16, Kylä, Pitäjä, Lääni (Län), Finland';
  expect(placeOf({ place: null, address: chain })).toEqual({
    place: chain,
    address: null
  });
});

test('a mailing address stays an address', () => {
  for (const address of [
    'Mannerheimintie 1, 00100 Helsinki, Suomi',
    '100 Main St, Springfield, Oregon 97000-1234, USA'
  ]) {
    expect(placeOf({ place: null, address })).toEqual({ place: null, address });
  }
});

test('an address beside a place stays an address', () => {
  expect(placeOf({ place: 'Helsinki', address: 'Kaisaniemi' })).toEqual({
    place: 'Helsinki',
    address: 'Kaisaniemi'
  });
});

test('no address leaves the place as it is', () => {
  expect(placeOf({ place: 'Juva', address: null })).toEqual({
    place: 'Juva',
    address: null
  });
});
