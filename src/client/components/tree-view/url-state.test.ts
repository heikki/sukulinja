import { describe, expect, test } from 'bun:test';

import { buildHash, parseHashView } from './url-state';
import type { Bounds, Defaults } from './url-state';

const BOUNDS: Bounds = { maxGen: 5, minZoom: 0.25, maxZoom: 2 };
const DEFAULTS: Defaults = { gen: 2 };

describe('parseHashView', () => {
  test('reads focus from minimal hash', () => {
    expect(parseHashView('#/person/123', BOUNDS)).toEqual({
      focusId: 123,
      gen: null,
      pan: null,
      zoom: null
    });
  });

  test('reads focus + gen', () => {
    expect(parseHashView('#/person/123?gen=3', BOUNDS)).toEqual({
      focusId: 123,
      gen: 3,
      pan: null,
      zoom: null
    });
  });

  test('clamps out-of-range gen', () => {
    expect(parseHashView('#/person/1?gen=99', BOUNDS).gen).toBe(5);
    expect(parseHashView('#/person/1?gen=0', BOUNDS).gen).toBe(1);
  });

  test('drops unparseable gen but keeps focus', () => {
    const parsed = parseHashView('#/person/123?gen=abc', BOUNDS);
    expect(parsed.focusId).toBe(123);
    expect(parsed.gen).toBeNull();
  });

  test('returns nulls for non-matching hash', () => {
    expect(parseHashView('#foo', BOUNDS)).toEqual({
      focusId: null,
      gen: null,
      pan: null,
      zoom: null
    });
    expect(parseHashView('', BOUNDS)).toEqual({
      focusId: null,
      gen: null,
      pan: null,
      zoom: null
    });
  });

  test('ignores unknown query params', () => {
    const parsed = parseHashView('#/person/7?gen=3&junk=foo', BOUNDS);
    expect(parsed.focusId).toBe(7);
    expect(parsed.gen).toBe(3);
  });
});

describe('parseHashView zoom', () => {
  test('reads zoom', () => {
    expect(parseHashView('#/person/1?zoom=1.5', BOUNDS).zoom).toBe(1.5);
    expect(parseHashView('#/person/1?zoom=0.87', BOUNDS).zoom).toBe(0.87);
    expect(parseHashView('#/person/1?zoom=1', BOUNDS).zoom).toBe(1);
  });

  test('clamps out-of-range zoom', () => {
    expect(parseHashView('#/person/1?zoom=10', BOUNDS).zoom).toBe(2);
    expect(parseHashView('#/person/1?zoom=0.001', BOUNDS).zoom).toBe(0.25);
  });

  test('drops unparseable zoom but keeps focus', () => {
    const parsed = parseHashView('#/person/1?zoom=abc', BOUNDS);
    expect(parsed.focusId).toBe(1);
    expect(parsed.zoom).toBeNull();
  });

  test('returns null for missing zoom', () => {
    expect(parseHashView('#/person/1', BOUNDS).zoom).toBeNull();
  });
});

describe('buildHash', () => {
  test('omits gen when equal to default', () => {
    expect(
      buildHash({ focusId: 123, gen: 2, pan: null, zoom: null }, DEFAULTS)
    ).toBe('#/person/123');
  });

  test('includes gen when not equal to default', () => {
    expect(
      buildHash({ focusId: 123, gen: 3, pan: null, zoom: null }, DEFAULTS)
    ).toBe('#/person/123?gen=3');
  });

  test('omits zoom when null (write-once stickiness opt-in)', () => {
    expect(
      buildHash({ focusId: 1, gen: 2, pan: null, zoom: null }, DEFAULTS)
    ).toBe('#/person/1');
  });

  test('writes zoom with trailing zeros stripped', () => {
    expect(
      buildHash({ focusId: 1, gen: 2, pan: null, zoom: 1 }, DEFAULTS)
    ).toBe('#/person/1?zoom=1');
    expect(
      buildHash({ focusId: 1, gen: 2, pan: null, zoom: 1.5 }, DEFAULTS)
    ).toBe('#/person/1?zoom=1.5');
  });

  test('writes zoom rounded to 2 decimals', () => {
    expect(
      buildHash({ focusId: 1, gen: 2, pan: null, zoom: 0.875 }, DEFAULTS)
    ).toBe('#/person/1?zoom=0.88');
    expect(
      buildHash({ focusId: 1, gen: 2, pan: null, zoom: 1.234 }, DEFAULTS)
    ).toBe('#/person/1?zoom=1.23');
  });

  test('writes zoom alongside gen', () => {
    expect(
      buildHash({ focusId: 1, gen: 3, pan: null, zoom: 1.5 }, DEFAULTS)
    ).toBe('#/person/1?gen=3&zoom=1.5');
  });
});

describe('round-trip', () => {
  const cases = [
    '#/person/123',
    '#/person/123?gen=3',
    '#/person/1?gen=5',
    '#/person/1?zoom=1',
    '#/person/1?zoom=1.5',
    '#/person/1?zoom=0.87',
    '#/person/1?gen=3&zoom=1.5'
  ];
  for (const s of cases) {
    test(s, () => {
      const parsed = parseHashView(s, BOUNDS);
      expect(parsed.focusId).not.toBeNull();
      const rebuilt = buildHash(
        {
          focusId: parsed.focusId!,
          gen: parsed.gen ?? DEFAULTS.gen,
          pan: null,
          zoom: parsed.zoom
        },
        DEFAULTS
      );
      expect(rebuilt).toBe(s);
    });
  }
});
