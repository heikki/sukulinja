// Sibship row packing: extents -> left-to-right kid pivots, separated by
// SIBLING_GAP.

import { SIBLING_GAP } from '../helpers';
import type { Extents } from '../helpers';

export interface Sibship {
  // Pivots in the packed frame: positions[0] = extents[0].left (not 0).
  readonly positions: readonly number[];
  readonly totalWidth: number;
  // Midpoint between the first and last pivots — the natural Bar anchor.
  readonly barMid: number;
  // Pivots shifted so the Bar midpoint lands at anchorX.
  kidXs(anchorX: number): number[];
}

export function buildSibship(extents: readonly Extents[]): Sibship {
  if (extents.length === 0) {
    return {
      positions: [],
      totalWidth: 0,
      barMid: 0,
      kidXs: () => []
    };
  }
  const positions: number[] = [];
  let cursor = 0;
  for (const [i, e] of extents.entries()) {
    if (i > 0) cursor += SIBLING_GAP;
    cursor += e.left;
    positions.push(cursor);
    cursor += e.right;
  }
  const barMid = (positions[0]! + positions[positions.length - 1]!) / 2;
  return {
    positions,
    totalWidth: cursor,
    barMid,
    kidXs(anchorX: number) {
      return positions.map((p) => p - barMid + anchorX);
    }
  };
}
