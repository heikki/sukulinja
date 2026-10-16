import { describe, expect, test } from 'bun:test';

import { buildHash, parseHashView } from './url-state';
import type { Bounds } from './url-state';

const BOUNDS: Bounds = { minZoom: 0.25, maxZoom: 2 };

describe('parseHashView', () => {
  test('reads focus from minimal hash', () => {
    expect(parseHashView('#/person/123', BOUNDS)).toEqual({
      focusId: 123,
      selectedId: null,
      pan: null,
      zoom: null
    });
  });

  test('returns nulls for non-matching hash', () => {
    expect(parseHashView('#foo', BOUNDS)).toEqual({
      focusId: null,
      selectedId: null,
      pan: null,
      zoom: null
    });
    expect(parseHashView('', BOUNDS)).toEqual({
      focusId: null,
      selectedId: null,
      pan: null,
      zoom: null
    });
  });

  test('ignores unknown query params, including a legacy gen', () => {
    expect(parseHashView('#/person/7?gen=3&junk=foo&zoom=1.5', BOUNDS)).toEqual(
      { focusId: 7, selectedId: null, pan: null, zoom: 1.5 }
    );
  });
});

describe('parseHashView pan', () => {
  test('reads pan as integer x,y', () => {
    expect(parseHashView('#/person/1?pan=120,-80', BOUNDS).pan).toEqual({
      x: 120,
      y: -80
    });
    expect(parseHashView('#/person/1?pan=-80,-120', BOUNDS).pan).toEqual({
      x: -80,
      y: -120
    });
    expect(parseHashView('#/person/1?pan=0,-80', BOUNDS).pan).toEqual({
      x: 0,
      y: -80
    });
  });

  test('drops unparseable or partial pan but keeps focus', () => {
    expect(parseHashView('#/person/1?pan=foo', BOUNDS).pan).toBeNull();
    expect(parseHashView('#/person/1?pan=120', BOUNDS).pan).toBeNull();
    expect(parseHashView('#/person/1?pan=1.5,2', BOUNDS).pan).toBeNull();
    expect(parseHashView('#/person/1?pan=a,b', BOUNDS).pan).toBeNull();
    expect(parseHashView('#/person/1?pan=foo', BOUNDS).focusId).toBe(1);
  });

  test('returns null for missing pan', () => {
    expect(parseHashView('#/person/1', BOUNDS).pan).toBeNull();
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
  test('omits zoom when null (write-once stickiness opt-in)', () => {
    expect(buildHash({ focusId: 1, pan: null, zoom: null })).toBe('#/person/1');
  });

  test('writes zoom with trailing zeros stripped', () => {
    expect(buildHash({ focusId: 1, pan: null, zoom: 1 })).toBe(
      '#/person/1?zoom=1'
    );
    expect(buildHash({ focusId: 1, pan: null, zoom: 1.5 })).toBe(
      '#/person/1?zoom=1.5'
    );
  });

  test('writes zoom rounded to 2 decimals', () => {
    expect(buildHash({ focusId: 1, pan: null, zoom: 0.875 })).toBe(
      '#/person/1?zoom=0.88'
    );
    expect(buildHash({ focusId: 1, pan: null, zoom: 1.234 })).toBe(
      '#/person/1?zoom=1.23'
    );
  });

  test('omits pan when null', () => {
    expect(buildHash({ focusId: 1, pan: null, zoom: null })).toBe('#/person/1');
  });

  test('writes pan rounded to integers', () => {
    expect(buildHash({ focusId: 1, pan: { x: 120, y: -80 }, zoom: null })).toBe(
      '#/person/1?pan=120,-80'
    );
    expect(
      buildHash({ focusId: 1, pan: { x: 120.4, y: -79.6 }, zoom: null })
    ).toBe('#/person/1?pan=120,-80');
  });

  test('writes the selection only when it is not Focus', () => {
    expect(
      buildHash({ focusId: 1, selectedId: 1, pan: null, zoom: null })
    ).toBe('#/person/1');
    expect(buildHash({ focusId: 1, selectedId: 9, pan: null, zoom: 1 })).toBe(
      '#/person/1?sel=9&zoom=1'
    );
  });

  test('emits pan, zoom in canonical order', () => {
    expect(buildHash({ focusId: 1, pan: { x: 10, y: 20 }, zoom: 1.5 })).toBe(
      '#/person/1?pan=10,20&zoom=1.5'
    );
  });
});

describe('round-trip', () => {
  const cases = [
    '#/person/123',
    '#/person/1?zoom=1',
    '#/person/1?zoom=1.5',
    '#/person/1?zoom=0.87',
    '#/person/1?pan=120,-80',
    '#/person/1?pan=0,-80',
    '#/person/1?pan=-80,-120',
    '#/person/123?pan=120,-80&zoom=1.5',
    '#/person/123?sel=45&pan=120,-80&zoom=1.5'
  ];
  for (const s of cases) {
    test(s, () => {
      const parsed = parseHashView(s, BOUNDS);
      expect(parsed.focusId).not.toBeNull();
      const rebuilt = buildHash({
        focusId: parsed.focusId!,
        selectedId: parsed.selectedId,
        pan: parsed.pan,
        zoom: parsed.zoom
      });
      expect(rebuilt).toBe(s);
    });
  }
});
