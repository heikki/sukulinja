// What an Entry would do to the tree (ADR-0033), each line to tick or not.
// Examples are invented.

import { expect, test } from 'bun:test';

import { NO_FIELDS } from './entry-events';
import {
  entryOffers,
  entryPlace,
  offerWords,
  tickedFirst
} from './entry-offers';

const PLACE = 'Esimerkkilä 2, Juva, Suomi';
const BAPTISM = {
  ...NO_FIELDS,
  lifeDate: '3 MAR 1761',
  date: '5 MAR 1761',
  place: 'Esimerkkilä 2'
};

function birth(date: string | null, place: string | null = PLACE, id = 1) {
  return { id, tag: 'BIRT', date, place };
}

test('a date with no Fact of its kind adds one, ticked; an empty one does nothing', () => {
  const offers = entryOffers('CHR', BAPTISM, PLACE, []);
  expect(offers).toEqual([
    { tag: 'BIRT', action: 'add', now: { date: '3 MAR 1761', place: PLACE } },
    { tag: 'CHR', action: 'add', now: { date: '5 MAR 1761', place: PLACE } }
  ]);
  expect(offers.every(tickedFirst)).toBe(true);
  expect(entryOffers('CHR', { ...BAPTISM, date: null }, PLACE, [])).toEqual([
    { tag: 'BIRT', action: 'add', now: { date: '3 MAR 1761', place: PLACE } }
  ]);
  expect(entryOffers(null, BAPTISM, PLACE, [])).toEqual([]);
});

test('a Fact that agrees is supported', () => {
  expect(
    entryOffers('CHR', BAPTISM, PLACE, [birth('3 MAR 1761')])[0]
  ).toMatchObject({
    tag: 'BIRT',
    action: 'support',
    factId: 1
  });
  // The Entry with no place agrees with any.
  expect(
    entryOffers('CHR', BAPTISM, null, [birth('3 MAR 1761', 'Juva')])[0]
  ).toMatchObject({ tag: 'BIRT', action: 'support', factId: 1 });
});

test('a Fact that agrees but says less is supported, and its change offered unticked', () => {
  for (const date of ['1761', 'ABT 1761', 'BET 1760 AND 1762', null]) {
    const [support, change] = entryOffers('CHR', BAPTISM, PLACE, [birth(date)]);
    expect(support).toMatchObject({
      tag: 'BIRT',
      action: 'support',
      factId: 1
    });
    expect(change).toMatchObject({
      action: 'change',
      was: { date },
      now: { date: '3 MAR 1761', place: PLACE }
    });
    expect(tickedFirst(change!)).toBe(false);
  }
  // A place filled.
  expect(
    entryOffers('CHR', BAPTISM, PLACE, [birth('3 MAR 1761', null)])[1]
  ).toMatchObject({ action: 'change', now: { place: PLACE } });
});

test('a Fact that differs is offered only its change, unticked', () => {
  expect(
    entryOffers('CHR', BAPTISM, PLACE, [birth('1762')]).slice(0, 1)
  ).toEqual([
    {
      tag: 'BIRT',
      action: 'change',
      factId: 1,
      was: { date: '1762', place: PLACE },
      now: { date: '3 MAR 1761', place: PLACE }
    }
  ]);
  expect(
    entryOffers('CHR', BAPTISM, PLACE, [birth('3 MAR 1761', 'Juva')])
  ).toMatchObject([{ action: 'change', now: { place: PLACE } }, {}]);
});

test('two Facts of a kind are left to choose between in Sources', () => {
  const two = [birth('1761'), birth('1762', null, 2)];
  expect(entryOffers('CHR', BAPTISM, PLACE, two)[0]).toEqual({
    tag: 'BIRT',
    action: 'two'
  });
});

test('the place is as the book writes it, in its parish, in Finland', () => {
  expect(entryPlace(BAPTISM, 'Juva')).toBe(PLACE);
  expect(entryPlace(BAPTISM, null)).toBe('Esimerkkilä 2, Suomi');
  // One typed with a comma says where it is itself.
  expect(
    entryPlace({ ...BAPTISM, place: 'Esimerkkilä 2, Malliranta' }, 'Juva')
  ).toBe('Esimerkkilä 2, Malliranta');
  expect(entryPlace(NO_FIELDS, 'Juva')).toBeNull();
});

test('a line is written as the card shows it', () => {
  const now = { date: '3 MAR 1761', place: 'Esimerkkilä 2, Juva, Suomi' };
  expect(offerWords({ tag: 'BIRT', action: 'add', now })).toBe(
    'Add Birth 3.3.1761 at Esimerkkilä 2, Juva, Suomi'
  );
  const was = { date: '5 MAR 1761', place: null };
  expect(offerWords({ tag: 'CHR', action: 'support', factId: 1, was })).toBe(
    'Christening 5.3.1761 matches: use as its source'
  );
  expect(
    offerWords({
      tag: 'BIRT',
      action: 'change',
      factId: 1,
      was: { date: '1761', place: null },
      now
    })
  ).toBe('Change Birth 1761 → 3.3.1761, at Esimerkkilä 2, Juva, Suomi');
  expect(
    offerWords({
      tag: 'BIRT',
      action: 'change',
      factId: 1,
      was: { date: '3 MAR 1761', place: 'Juva' },
      now
    })
  ).toBe('Change Birth place Juva → Esimerkkilä 2, Juva, Suomi');
  expect(offerWords({ tag: 'BIRT', action: 'two' })).toBe(
    'Two Births: choose in Sources'
  );
});
