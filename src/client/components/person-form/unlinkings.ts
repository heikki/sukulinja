import { unlinkCuts } from '@/common/tree-cut';
import type { FamilyRow, PersonRow } from '@/common/types';

import { formatName } from '../tree-view/renderer';

// A family the person can be taken out of, as the card menu offers it.
export interface Unlinking {
  familyId: number;
  label: string;
}

interface Tree {
  persons: Map<number, PersonRow>;
  families: readonly FamilyRow[];
}

function namesOf(ids: Array<number | null>, persons: Map<number, PersonRow>) {
  return ids.flatMap((id) => {
    const p = id === null ? undefined : persons.get(id);
    return p === undefined ? [] : [formatName(p)];
  });
}

// What taking them out of the family is called: as a child of their
// parents, as a spouse of the other parent, or, with none, as a parent of
// the first child.
function labelOf(personId: number, f: FamilyRow, tree: Tree) {
  if (f.child_ids.includes(personId)) {
    const parents = namesOf([f.husband_id, f.wife_id], tree.persons);
    return parents.length === 0
      ? 'Remove as child'
      : `Remove as child of ${parents.join(' and ')}`;
  }
  const other = f.husband_id === personId ? f.wife_id : f.husband_id;
  const [spouse] = namesOf([other], tree.persons);
  if (spouse !== undefined) return `Remove as spouse of ${spouse}`;
  const [child] = namesOf(f.child_ids.slice(0, 1), tree.persons);
  if (child === undefined) return 'Remove from the family';
  return `Remove as parent of ${child}${f.child_ids.length > 1 ? ' and others' : ''}`;
}

// The families the person can be taken out of: each they're in, unless it
// would cut the tree in two (tree-cut.ts), which isn't offered at all.
export function unlinkings(personId: number, tree: Tree): Unlinking[] {
  return tree.families
    .filter(
      (f) =>
        f.husband_id === personId ||
        f.wife_id === personId ||
        f.child_ids.includes(personId)
    )
    .filter((f) => !unlinkCuts(tree.families, personId, f.id))
    .map((f) => ({ familyId: f.id, label: labelOf(personId, f, tree) }));
}
