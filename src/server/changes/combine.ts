// When a Change follows one like it on the same thing, the list keeps one
// row for both: moving a Tag's Box five times, or editing a Fact's date
// over and over, is one thing done. Only the newest Change takes the next
// one in, and only when both are on the same thing (changes.ts checks
// that); this says whether their kinds go together, and what the one row
// then says.

import type { ChangeWhat } from '@/common/types';

type Fact = Extract<ChangeWhat, { kind: 'fact' }>;

// The one Change `last` and `next` make; null when they stay two.
export function combined(
  last: ChangeWhat,
  next: ChangeWhat
): ChangeWhat | null {
  // A Tag made, then moved, was made; moved, then moved again, was moved.
  if (last.kind === 'tag' && next.kind === 'tag') {
    return { ...next, moved: last.moved };
  }
  // A Mark moved again: it's where it went last.
  if (last.kind === 'mark' && next.kind === 'mark') return next;
  // The same portrait chosen again.
  if (last.kind === 'portrait' && next.kind === 'portrait') return next;
  if (last.kind === 'fact' && next.kind === 'fact') {
    return combinedFact(last, next);
  }
  return null;
}

// A Fact added or edited, then edited again: one Change from how it read
// first to how it reads now. It's the same Fact when the edit starts from
// what the last Change left, of the same tag (Changes don't keep a Fact's
// id). Adding or deleting one stays a Change of its own.
function combinedFact(last: Fact, next: Fact): Fact | null {
  if (last.did === 'delete' || next.did !== 'edit') return null;
  if (last.tag !== next.tag || last.now !== next.was) return null;
  return { ...next, did: last.did, was: last.was };
}
