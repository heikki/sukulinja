// What an Entry would do to the tree (ADR-0033), each line to tick or not.
// Examples are invented.

import { expect, test } from 'bun:test';

import { NO_FIELDS } from './entry-events';
import {
  entryOffers,
  entryPlace,
  isLine,
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
  const offers = entryOffers('CHR', { fields: BAPTISM, place: PLACE }, []);
  expect(offers).toEqual([
    { tag: 'BIRT', action: 'add', now: { date: '3 MAR 1761', place: PLACE } },
    { tag: 'CHR', action: 'add', now: { date: '5 MAR 1761', place: PLACE } }
  ]);
  expect(offers.every(tickedFirst)).toBe(true);
  expect(
    entryOffers('CHR', { fields: { ...BAPTISM, date: null }, place: PLACE }, [])
  ).toEqual([
    { tag: 'BIRT', action: 'add', now: { date: '3 MAR 1761', place: PLACE } }
  ]);
  expect(entryOffers(null, { fields: BAPTISM, place: PLACE }, [])).toEqual([]);
});

test('a Fact that agrees is supported', () => {
  expect(
    entryOffers('CHR', { fields: BAPTISM, place: PLACE }, [
      birth('3 MAR 1761')
    ])[0]
  ).toMatchObject({
    tag: 'BIRT',
    action: 'support',
    factId: 1
  });
  // The Entry with no place agrees with any.
  expect(
    entryOffers('CHR', { fields: BAPTISM, place: null }, [
      birth('3 MAR 1761', 'Juva')
    ])[0]
  ).toMatchObject({ tag: 'BIRT', action: 'support', factId: 1 });
});

test('a Fact that agrees but says less is supported, and its change offered unticked', () => {
  for (const date of ['1761', 'ABT 1761', 'BET 1760 AND 1762', null]) {
    const [support, change] = entryOffers(
      'CHR',
      { fields: BAPTISM, place: PLACE },
      [birth(date)]
    );
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
    entryOffers('CHR', { fields: BAPTISM, place: PLACE }, [
      birth('3 MAR 1761', null)
    ])[1]
  ).toMatchObject({ action: 'change', now: { place: PLACE } });
});

test('a Fact that differs is offered only its change, unticked', () => {
  expect(
    entryOffers('CHR', { fields: BAPTISM, place: PLACE }, [
      birth('1762')
    ]).slice(0, 1)
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
    entryOffers('CHR', { fields: BAPTISM, place: PLACE }, [
      birth('3 MAR 1761', 'Juva')
    ])
  ).toMatchObject([{ action: 'change', now: { place: PLACE } }, {}]);
});

test('of two Facts of a kind, the one that agrees is offered support; none agreeing, nothing to tick', () => {
  const said = { fields: BAPTISM, place: PLACE };
  const two = [birth('1761'), birth('1762', null, 2)];
  expect(entryOffers('CHR', said, two)[0]).toMatchObject({
    tag: 'BIRT',
    action: 'support',
    factId: 1
  });
  const neither = [birth('1760'), birth('1762', null, 2)];
  expect(entryOffers('CHR', said, neither)[0]).toEqual({
    tag: 'BIRT',
    action: 'two'
  });
});

test('of two Facts of a kind, one the Entry supports is kept and another that agrees offered too, never changed into a twin', () => {
  const said = { fields: BAPTISM, place: PLACE };
  const wrong = { ...birth('1762', PLACE, 1), supported: true };
  const right = birth('3 MAR 1761', PLACE, 2);
  const offers = entryOffers('CHR', said, [wrong, right]);
  expect(offers.filter((o) => o.tag === 'BIRT')).toMatchObject([
    { action: 'support', factId: 1, kept: true },
    { action: 'support', factId: 2 }
  ]);
  // Each its own line, by its Fact.
  expect(
    isLine(offers[0]!, { tag: 'BIRT', action: 'support', factId: 2 })
  ).toBe(false);
  expect(
    isLine(offers[1]!, { tag: 'BIRT', action: 'support', factId: 2 })
  ).toBe(true);
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

test('a line is written as the Entry pane shows it', () => {
  const now = { date: '3 MAR 1761', place: 'Esimerkkilä 2, Juva, Suomi' };
  expect(offerWords({ tag: 'BIRT', action: 'add', now })).toBe(
    'Add fact: Birth 3.3.1761 at Esimerkkilä 2, Juva, Suomi'
  );
  const was = { date: '5 MAR 1761', place: null };
  expect(offerWords({ tag: 'CHR', action: 'support', factId: 1, was })).toBe(
    'Use as source: Christening 5.3.1761'
  );
  expect(
    offerWords({
      tag: 'BIRT',
      action: 'change',
      factId: 1,
      was: { date: '1761', place: null },
      now
    })
  ).toBe('Change fact: Birth 1761 → 3.3.1761, at Esimerkkilä 2, Juva, Suomi');
  expect(
    offerWords({
      tag: 'BIRT',
      action: 'change',
      factId: 1,
      was: { date: '3 MAR 1761', place: 'Juva' },
      now
    })
  ).toBe('Change fact: Birth place Juva → Esimerkkilä 2, Juva, Suomi');
  expect(offerWords({ tag: 'BIRT', action: 'two' })).toBe(
    'Two Births: none matches'
  );
});

function resi(date: string | null, place = PLACE) {
  return { id: 5, tag: 'RESI', date, place };
}

test("a household line's Residence agrees at the same place in overlapping years", () => {
  const years = { from: 1790, to: 1796 };
  const said = { fields: NO_FIELDS, place: PLACE, years };
  expect(entryOffers('RESI', said, [])).toEqual([
    {
      tag: 'RESI',
      action: 'add',
      now: { date: 'BET 1790 AND 1796', place: PLACE }
    }
  ]);
  for (const date of ['1795', 'BET 1780 AND 1791', 'AFT 1796', null]) {
    expect(entryOffers('RESI', said, [resi(date)])).toMatchObject([
      { action: 'support', factId: 5 }
    ]);
  }
  for (const fact of [resi('1789'), resi('1795', 'Juva, Suomi')]) {
    expect(entryOffers('RESI', said, [fact])).toMatchObject([
      { action: 'add' }
    ]);
  }
  expect(entryOffers('RESI', { ...said, place: null }, [])).toEqual([]);
});

test('a Residence the line supports already, its place changed since, is kept as its source, changed back unticked, not added again', () => {
  const years = { from: 1790, to: 1796 };
  const said = { fields: NO_FIELDS, place: PLACE, years };
  const moved = {
    ...resi('BET 1790 AND 1796', 'Kylämaa 4, Juva'),
    supported: true
  };
  const offers = entryOffers('RESI', said, [moved]);
  expect(offers).toEqual([
    {
      tag: 'RESI',
      action: 'support',
      factId: 5,
      was: { date: 'BET 1790 AND 1796', place: 'Kylämaa 4, Juva' },
      kept: true
    },
    {
      tag: 'RESI',
      action: 'change',
      factId: 5,
      was: { date: 'BET 1790 AND 1796', place: 'Kylämaa 4, Juva' },
      now: { date: 'BET 1790 AND 1796', place: PLACE }
    }
  ]);
  expect(offers.map(tickedFirst)).toEqual([true, false]);
  expect(offerWords(offers[0]!)).toBe('Keep as source: Residence 1790–1796');
});

test('a Fact the Entry supports that no line names, its date emptied or its kind changed, is kept to untick', () => {
  const birthOwn = { ...birth('3 MAR 1761', PLACE, 1), supported: true };
  const fields = { ...BAPTISM, lifeDate: null };
  expect(
    entryOffers('CHR', { fields, place: PLACE }, [birthOwn])
  ).toMatchObject([
    { tag: 'CHR', action: 'add' },
    { tag: 'BIRT', action: 'support', factId: 1, kept: true }
  ]);
  expect(
    entryOffers('BURI', { fields: NO_FIELDS, place: PLACE }, [birthOwn])
  ).toMatchObject([{ tag: 'BIRT', action: 'support', factId: 1, kept: true }]);
});

test('a Fact the Entry supports already, agreeing or not, is kept as its source', () => {
  const said = { fields: BAPTISM, place: PLACE };
  const same = { ...birth('3 MAR 1761', PLACE, 1), supported: true };
  expect(entryOffers('CHR', said, [same])).toMatchObject([
    { tag: 'BIRT', action: 'support', factId: 1, kept: true },
    { tag: 'CHR', action: 'add' }
  ]);
  const other = { ...birth('1762', PLACE, 1), supported: true };
  expect(entryOffers('CHR', said, [other])).toMatchObject([
    { tag: 'BIRT', action: 'support', factId: 1, kept: true },
    { tag: 'BIRT', action: 'change', factId: 1 },
    { tag: 'CHR', action: 'add' }
  ]);
});

test('a Residence the line supports already is found whatever its years, and another at the place supported rather than it changed into a twin', () => {
  const years = { from: 1790, to: 1796 };
  const said = { fields: NO_FIELDS, place: PLACE, years };
  // Its years and place both changed in the tree: kept, its place offered
  // back, its date as it is now; none added.
  const moved = { ...resi('1800', 'Kylämaa 4, Juva'), supported: true };
  expect(entryOffers('RESI', said, [moved])).toEqual([
    {
      tag: 'RESI',
      action: 'support',
      factId: 5,
      was: { date: '1800', place: 'Kylämaa 4, Juva' },
      kept: true
    },
    {
      tag: 'RESI',
      action: 'change',
      factId: 5,
      was: { date: '1800', place: 'Kylämaa 4, Juva' },
      now: { date: '1800', place: PLACE }
    }
  ]);
  // With no date, its place offered back gives it none.
  const undated = { ...resi(null, 'Kylämaa 4, Juva'), supported: true };
  expect(entryOffers('RESI', said, [undated])[1]).toMatchObject({
    action: 'change',
    now: { date: null, place: PLACE }
  });
  // Another at the place in the years: that one supported, its own kept.
  const there = { ...resi('BET 1790 AND 1796', PLACE), id: 6 };
  expect(entryOffers('RESI', said, [moved, there])).toMatchObject([
    { action: 'support', factId: 5, kept: true },
    { action: 'support', factId: 6 }
  ]);
});

test('of two Facts of its kind, the one the Entry supports already is its own', () => {
  const own = { ...birth('3 MAR 1761', PLACE, 1), supported: true };
  const other = birth('1762', PLACE, 2);
  expect(
    entryOffers('CHR', { fields: BAPTISM, place: PLACE }, [own, other])
  ).toMatchObject([
    { tag: 'BIRT', action: 'support', factId: 1 },
    { tag: 'CHR', action: 'add' }
  ]);
});
