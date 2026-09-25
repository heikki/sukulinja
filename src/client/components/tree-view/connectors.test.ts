import { describe, expect, test } from 'bun:test';

import { edgePath } from './connectors';

function arcs(d: string) {
  return d.match(/ A /gu)?.length ?? 0;
}

describe('edgePath', () => {
  test('a Tie is a straight segment', () => {
    expect(
      edgePath('tie', [
        { x: 0, y: 0 },
        { x: 22, y: 0 }
      ])
    ).toBe('M 0 0 L 22 0');
  });

  test('rounds the Bar turning into its outermost Legs; the mid-Bar Drop and middle Leg stay square', () => {
    // Drop at x = 100 over kids at 0, 50 and 200.
    const d = edgePath('sibship', [
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 130 },
      { x: 50, y: 130 },
      { x: 200, y: 130 }
    ]);

    expect(d).toBe(
      'M 0 130 L 0 120 A 20 20 0 0 1 20 100 L 180 100 A 20 20 0 0 1 200 120 L 200 130' +
        ' M 100 100 L 100 0 M 50 100 L 50 130'
    );
  });

  test('rounds both turns of an ancestor L-bend, capped to half the short Bar run', () => {
    // The Tie sits 30 units right of the one kid: Drop, a short Bar, then Leg.
    const d = edgePath('sibship', [
      { x: 30, y: 0 },
      { x: 30, y: 100 },
      { x: 0, y: 130 }
    ]);

    expect(d).toBe(
      'M 0 130 L 0 115 A 15 15 0 0 1 15 100 L 15 100 A 15 15 0 0 0 30 85 L 30 0'
    );
  });

  test('a Drop straight over a lone kid is one straight run, no corners', () => {
    const d = edgePath('sibship', [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 0, y: 130 }
    ]);

    expect(arcs(d)).toBe(0);
  });

  test('a Drop and a Leg meeting the same Bar end make a square T there', () => {
    // Drop straight over the leftmost kid; the Bar turns only at its right end.
    const d = edgePath('sibship', [
      { x: 0, y: 70 },
      { x: 0, y: 100 },
      { x: 0, y: 130 },
      { x: 100, y: 130 }
    ]);

    expect(arcs(d)).toBe(1);
  });
});
