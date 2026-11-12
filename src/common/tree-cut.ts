// Whether taking a person out of a family, or out of the tree, would cut
// the tree in two: leave someone no longer connected, through families,
// to those they were connected to. A part already unconnected before
// doesn't count, only what the change itself cuts off (add-people spec,
// Decisions: Nothing cuts the tree in two). Worked out from the families
// alone, so the card menu and the server work it out alike.

import type { FamilyRow } from './types';

// Who is in the family: its parents, then its children.
function membersOf(f: FamilyRow) {
  return [f.husband_id, f.wife_id, ...f.child_ids].filter((id) => id !== null);
}

// The families each person is in.
function familiesOfEach(families: readonly FamilyRow[]) {
  const byPerson = new Map<number, FamilyRow[]>();
  for (const f of families) {
    for (const id of membersOf(f)) {
      byPerson.set(id, [...(byPerson.get(id) ?? []), f]);
    }
  }
  return byPerson;
}

// Whether everyone in `ends` is reached from the first, through families,
// with `gone` out of the tree, or only out of the family `from`.
function joined(
  families: readonly FamilyRow[],
  ends: number[],
  gone: { personId: number; from: number | null }
) {
  const byPerson = familiesOfEach(families);
  function cut(personId: number, f: FamilyRow) {
    return (
      personId === gone.personId && (gone.from === null || gone.from === f.id)
    );
  }
  const seen = new Set<number>(ends.slice(0, 1));
  const queue = [...seen];
  for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
    for (const f of byPerson.get(at) ?? []) {
      if (cut(at, f)) continue;
      for (const id of membersOf(f)) {
        if (seen.has(id) || cut(id, f)) continue;
        seen.add(id);
        queue.push(id);
      }
    }
  }
  return ends.every((id) => seen.has(id));
}

// Whether taking the person out of the family would cut the tree in two:
// they must stay connected to the others in it. A family they're alone in
// goes, cutting no one off.
export function unlinkCuts(
  families: readonly FamilyRow[],
  personId: number,
  familyId: number
) {
  const family = families.find((f) => f.id === familyId);
  if (family === undefined) return false;
  const others = membersOf(family).filter((id) => id !== personId);
  if (others.length === 0) return false;
  return !joined(families, [personId, ...others], {
    personId,
    from: familyId
  });
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
  return !joined(families, [...ends], { personId, from: null });
}
