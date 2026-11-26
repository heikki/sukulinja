// Where an Entry's people and the tree differ (ADR-0037): the rule the
// Entry pane says so by, and the tree-quality check "An Entry names the
// people the tree gives it" will, so the two can't drift apart. The Entry
// says whom the book names, the tree what's concluded; neither is put
// right by the app, as it can't tell which was taken wrongly.

import type { Named } from './entry-lock';

// The tree as the rule reads it.
export interface TreeOf {
  // Whether the two are a family's spouses.
  couple: (a: number, b: number) => boolean;
  // The person's father and mother in the tree, null for none.
  parents: (child: number) => { FATH: number | null; MOTH: number | null };
}

type ParentRole = 'FATH' | 'MOTH';

// - 'not-couple': a marriage's groom and bride aren't a family;
// - 'other-parent': a baptism's father or mother isn't the child's in the
//   tree, which gives them `theirs`, or none;
// - 'unnamed-parent': the tree gives the child a parent the baptism names
//   in no Role of theirs.
export type Difference =
  | { kind: 'not-couple'; groom: number; bride: number }
  | {
      kind: 'other-parent';
      role: ParentRole;
      child: number;
      theirs: number | null;
    }
  | { kind: 'unnamed-parent'; role: ParentRole; child: number; parent: number };

function inRole(named: Named, role: string) {
  const id = named.people.find((p) => p.role === role)?.personId;
  // Someone new isn't in the tree yet: they're made as the Entry says.
  return id === undefined || id < 0 ? undefined : id;
}

function baptismDifferences(named: Named, tree: TreeOf): Difference[] {
  const child = inRole(named, 'CHIL');
  if (child === undefined) return [];
  const theirs = tree.parents(child);
  return (['FATH', 'MOTH'] as const).flatMap((role): Difference[] => {
    const parent = inRole(named, role);
    const given = theirs[role];
    if (parent !== undefined) {
      return parent === given
        ? []
        : [{ kind: 'other-parent', role, child, theirs: given }];
    }
    return given === null ||
      named.people.some((p) => p.personId === given && p.role !== 'CHIL')
      ? []
      : [{ kind: 'unnamed-parent', role, child, parent: given }];
  });
}

// Each way the Entry's people and the tree differ; none for an Entry
// that agrees, or whose kind has no relations to differ in.
export function treeDifferences(named: Named, tree: TreeOf): Difference[] {
  if (named.event === 'CHR') return baptismDifferences(named, tree);
  if (named.event !== 'MARR') return [];
  const groom = inRole(named, 'HUSB');
  const bride = inRole(named, 'WIFE');
  if (groom === undefined || bride === undefined) return [];
  return tree.couple(groom, bride)
    ? []
    : [{ kind: 'not-couple', groom, bride }];
}

const PARENT = { FATH: 'father', MOTH: 'mother' } as const;

// A difference as the Entry pane says it: "Matti and Kaisa aren't a
// couple in the tree", "The tree gives Juho another father".
export function differenceWords(
  d: Difference,
  nameOf: (personId: number) => string
) {
  switch (d.kind) {
    case 'not-couple':
      return `${nameOf(d.groom)} and ${nameOf(d.bride)} aren't a couple in the tree`;
    case 'other-parent':
      return d.theirs === null
        ? `The tree gives ${nameOf(d.child)} no ${PARENT[d.role]}`
        : `The tree gives ${nameOf(d.child)} another ${PARENT[d.role]}`;
    case 'unnamed-parent':
      return `The tree gives ${nameOf(d.child)} a ${PARENT[d.role]} the entry doesn't name`;
  }
}
