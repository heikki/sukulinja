// Whether taking a person out of a family, out of the tree, or moving them
// to another family, would cut the tree in two: leave someone no longer
// connected, through families, to those they were connected to. Judged on
// the families as the change would leave them. A part already unconnected
// before doesn't count, only what the change itself cuts off (add-people
// spec, Decisions: Nothing cuts the tree in two). Worked out from the
// families alone, so the card menu and the server work it out alike.

import type { FamilyRow } from './types';

// Where a person is moved: into a family there is, or a new one with
// `personId` as its other parent.
export type MoveTarget = { familyId: number } | { personId: number };

// Who is in the family: its parents, then its children.
export function membersOf(f: FamilyRow) {
  return [f.husband_id, f.wife_id, ...f.child_ids].filter((id) => id !== null);
}

// The families with the person out of the family `from`, or out of every
// family when it's null.
function without(
  families: readonly FamilyRow[],
  personId: number,
  from: number | null
) {
  return families.map((f) => {
    if (from !== null && f.id !== from) return f;
    return {
      ...f,
      husband_id: f.husband_id === personId ? null : f.husband_id,
      wife_id: f.wife_id === personId ? null : f.wife_id,
      child_ids: f.child_ids.filter((id) => id !== personId)
    };
  });
}

// Whether everyone in `ends` is reached from the first, through families.
function joined(families: readonly FamilyRow[], ends: number[]) {
  const byPerson = new Map<number, FamilyRow[]>();
  for (const f of families) {
    for (const id of membersOf(f)) {
      byPerson.set(id, [...(byPerson.get(id) ?? []), f]);
    }
  }
  const seen = new Set<number>(ends.slice(0, 1));
  const queue = [...seen];
  for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
    for (const f of byPerson.get(at) ?? []) {
      for (const id of membersOf(f)) {
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push(id);
      }
    }
  }
  return ends.every((id) => seen.has(id));
}

// The others in the family `from`, with the person gone from it.
function othersIn(
  families: readonly FamilyRow[],
  personId: number,
  from: number
) {
  const family = families.find((f) => f.id === from);
  return family === undefined
    ? []
    : membersOf(family).filter((id) => id !== personId);
}

// Whether taking the person out of the family would cut the tree in two:
// they must stay connected to the others in it. A family they're alone in
// goes, cutting no one off.
export function unlinkCuts(
  families: readonly FamilyRow[],
  personId: number,
  familyId: number
) {
  const others = othersIn(families, personId, familyId);
  if (others.length === 0) return false;
  return !joined(without(families, personId, familyId), [personId, ...others]);
}

// Whether deleting the person would cut the tree in two: those they were
// in a family with must stay connected to each other without them.
export function deleteCuts(families: readonly FamilyRow[], personId: number) {
  const ends = new Set<number>();
  for (const f of families) {
    const members = membersOf(f);
    if (!members.includes(personId)) continue;
    for (const id of members) if (id !== personId) ends.add(id);
  }
  if (ends.size < 2) return false;
  return !joined(without(families, personId, null), [...ends]);
}

// Whether moving the person out of the family `from` to `to`, as a child or
// a parent there, would cut the tree in two: they, the others they leave
// and those they join must stay connected.
export function moveCuts(
  families: readonly FamilyRow[],
  personId: number,
  from: number,
  to: MoveTarget
) {
  const others = othersIn(families, personId, from);
  const after = without(families, personId, from);
  const joining =
    'personId' in to
      ? [to.personId]
      : othersIn(families, personId, to.familyId);
  // The new family joins them as if they were in it already.
  const bridge: FamilyRow = {
    id: -1,
    husband_id: personId,
    wife_id: null,
    child_ids: joining
  };
  return !joined([...after, bridge], [personId, ...others, ...joining]);
}

// The person's descendants: their children, and theirs, through every
// family they're a parent in.
export function descendantsOf(
  families: readonly FamilyRow[],
  personId: number
) {
  const found = new Set<number>();
  const queue = [personId];
  for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
    for (const f of families) {
      if (f.husband_id !== at && f.wife_id !== at) continue;
      for (const child of f.child_ids) {
        if (found.has(child)) continue;
        found.add(child);
        queue.push(child);
      }
    }
  }
  return found;
}
