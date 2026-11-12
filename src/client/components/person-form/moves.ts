import type { MoveTarget } from '@/common/tree-cut';
import type { FamilyRow, PersonRow } from '@/common/types';

import { formatName } from '../tree-view/renderer';

interface Tree {
  persons: Map<number, PersonRow>;
  families: readonly FamilyRow[];
}

// A family the person can be moved out of, as the card menu offers it: as
// a child to other parents, or as a parent to another spouse.
export interface Moving {
  from: number;
  asParent: boolean;
  label: string;
}

// Where the person can be moved to with someone picked, as the move form
// offers it.
export interface MoveChoice {
  to: MoveTarget;
  label: string;
}

function nameOf(id: number | null, tree: Tree) {
  const p = id === null ? undefined : tree.persons.get(id);
  return p === undefined ? null : formatName(p);
}

function otherParent(f: FamilyRow, personId: number) {
  return f.husband_id === personId ? f.wife_id : f.husband_id;
}

// The person's families to move out of: the one they're a child in, and
// each they're a parent in, the spouse named when there are several.
export function movings(personId: number, tree: Tree): Moving[] {
  const asChild = tree.families.filter((f) => f.child_ids.includes(personId));
  const asParent = tree.families.filter(
    (f) => f.husband_id === personId || f.wife_id === personId
  );
  return [
    ...asChild.map((f) => ({
      from: f.id,
      asParent: false,
      label: 'Move to other parents…'
    })),
    ...asParent.map((f) => {
      const spouse = nameOf(otherParent(f, personId), tree);
      return {
        from: f.id,
        asParent: true,
        label:
          asParent.length > 1 && spouse !== null
            ? `Move from ${spouse} to another spouse…`
            : 'Move to another spouse…'
      };
    })
  ];
}

// Where the person can go with `otherId`, picked: as a child, into one of
// their families, named by its other parent, or a new one of theirs; as a
// parent, into one of their families with a place free, or a new one with
// them.
export function moveChoices(
  otherId: number,
  moving: Moving,
  tree: Tree
): MoveChoice[] {
  const theirs = tree.families.filter(
    (f) =>
      f.id !== moving.from &&
      (f.husband_id === otherId || f.wife_id === otherId)
  );
  const into = moving.asParent
    ? theirs.filter((f) => f.husband_id === null || f.wife_id === null)
    : theirs;
  return [
    ...into.map((f) => {
      const other = nameOf(otherParent(f, otherId), tree);
      return {
        to: { familyId: f.id },
        label: other === null ? 'With no other parent' : `With ${other}`
      };
    }),
    {
      to: { personId: otherId },
      label: moving.asParent
        ? 'A new family with them'
        : 'A new family of theirs'
    }
  ];
}
