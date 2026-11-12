import { expect, test } from 'bun:test';

import { deleteCuts, descendantsOf, moveCuts, unlinkCuts } from './tree-cut';
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

test('a move judged on its result: to parents in the tree it keeps it whole', () => {
  // Kalle (6) moved from Juho and Maria's family to Matti and Liisa's.
  expect(moveCuts(TREE, 6, 2, { familyId: 1 })).toBe(false);
  // Juho moved to Liisa's own family: Matti stays joined through Anna.
  expect(moveCuts(TREE, 3, 1, { familyId: 3 })).toBe(false);
  // Maria away from Juho, into a new family with someone unconnected.
  const apart = [...TREE, fam(9, 10, 11)];
  expect(moveCuts(apart, 5, 2, { personId: 10 })).toBe(true);
  // Anna (no one else hangs on her) to the unconnected part.
  expect(moveCuts(apart, 4, 1, { familyId: 9 })).toBe(true);
});

test('descendants through every family', () => {
  expect([...descendantsOf(TREE, 1)].sort((a, b) => a - b)).toEqual([3, 4, 6]);
  expect([...descendantsOf(TREE, 6)]).toEqual([]);
});
