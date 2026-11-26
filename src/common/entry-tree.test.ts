import { expect, test } from 'bun:test';

import { differenceWords, treeDifferences } from './entry-tree';
import type { TreeOf } from './entry-tree';

// Matti (1) and Kaisa (2) a couple, Juho (3) their child; Liisa (4) and
// Antti (5) no one's.
const tree: TreeOf = {
  couple: (a, b) => (a === 1 && b === 2) || (a === 2 && b === 1),
  parents: (child) =>
    child === 3 ? { FATH: 1, MOTH: 2 } : { FATH: null, MOTH: null }
};
const NAMES = ['', 'Matti', 'Kaisa', 'Juho', 'Liisa', 'Antti'];
function nameOf(id: number) {
  return NAMES[id]!;
}

test("a marriage's couple who aren't a family differ", () => {
  function marriage(groom: number, bride: number) {
    return {
      event: 'MARR' as const,
      people: [
        { personId: groom, role: 'HUSB' },
        { personId: bride, role: 'WIFE' }
      ]
    };
  }
  expect(treeDifferences(marriage(1, 2), tree)).toEqual([]);
  const [d] = treeDifferences(marriage(1, 4), tree);
  expect(differenceWords(d!, nameOf)).toBe(
    "Matti and Liisa aren't a couple in the tree"
  );
  // Someone new is made into a family with the other.
  expect(treeDifferences(marriage(1, -1), tree)).toEqual([]);
});

test("a baptism's parents who aren't the child's in the tree differ", () => {
  function baptism(...people: Array<[number, string]>) {
    return {
      event: 'CHR' as const,
      people: people.map(([personId, role]) => ({ personId, role }))
    };
  }
  expect(
    treeDifferences(baptism([3, 'CHIL'], [1, 'FATH'], [2, 'MOTH']), tree)
  ).toEqual([]);
  expect(
    treeDifferences(baptism([3, 'CHIL'], [5, 'FATH'], [2, 'MOTH']), tree).map(
      (d) => differenceWords(d, nameOf)
    )
  ).toEqual(['The tree gives Juho another father']);
  expect(
    treeDifferences(baptism([3, 'CHIL'], [1, 'FATH']), tree).map((d) =>
      differenceWords(d, nameOf)
    )
  ).toEqual(["The tree gives Juho a mother the entry doesn't name"]);
  expect(
    treeDifferences(baptism([4, 'CHIL'], [5, 'FATH']), tree).map((d) =>
      differenceWords(d, nameOf)
    )
  ).toEqual(['The tree gives Liisa no father']);
});
