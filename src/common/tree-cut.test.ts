import { expect, test } from 'bun:test';

import { deleteCuts, unlinkCuts } from './tree-cut';
import type { FamilyRow } from './types';

function fam(
  id: number,
  husband: number | null,
  wife: number | null,
  children: number[] = []
): FamilyRow {
  return { id, husband_id: husband, wife_id: wife, child_ids: children };
}

// Matti (1) and Liisa (2) with Juho (3) and Anna (4); Juho married to
// Maria (5) with Kalle (6); Liisa alone in a family of her own (3).
const TREE = [fam(1, 1, 2, [3, 4]), fam(2, 3, 5, [6]), fam(3, null, 2)];

test('an unlinking that would cut someone off is caught', () => {
  expect(unlinkCuts(TREE, 3, 1)).toBe(true);
  expect(unlinkCuts(TREE, 4, 1)).toBe(true);
  expect(unlinkCuts(TREE, 5, 2)).toBe(true);
});

test('one from a family they are alone in, or with another way round, goes through', () => {
  expect(unlinkCuts(TREE, 2, 3)).toBe(false);
  // Juho's son Kalle married his cousin's family: a second way round.
  const looped = [...TREE, fam(4, 6, 7), fam(5, 4, null, [7])];
  expect(unlinkCuts(looped, 3, 1)).toBe(false);
});

test('deleting someone between others is caught, at the edge it goes through', () => {
  expect(deleteCuts(TREE, 3)).toBe(true);
  expect(deleteCuts(TREE, 1)).toBe(false);
  expect(deleteCuts(TREE, 6)).toBe(false);
  expect(deleteCuts(TREE, 4)).toBe(false);
  expect(deleteCuts(TREE, 99)).toBe(false);
});

test('a part already unconnected doesn’t stop it', () => {
  const apart = [...TREE, fam(9, 10, 11)];
  expect(deleteCuts(apart, 6)).toBe(false);
  expect(unlinkCuts(apart, 2, 3)).toBe(false);
});
