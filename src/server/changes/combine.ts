// When a Change follows one like it on the same thing, the list keeps only
// the newer: moving a Tag's Box five times, or editing a Fact's date over
// and over, shows as the last move or edit. Only the newest Change can be
// replaced, and only when both are on the same thing (changes.ts checks
// that); this says whether their kinds go together.

import type { ChangeWhat } from '@/common/types';

// Whether `next` takes the place of `last`.
export function replaces(last: ChangeWhat, next: ChangeWhat): boolean {
  if (last.kind !== next.kind) return false;
  switch (next.kind) {
    // A Tag made or moved, a Mark moved again, a portrait chosen again.
    case 'tag':
    case 'mark':
    case 'portrait':
      return true;
    // The same Fact edited again: an edit that starts from what the last
    // Change left, of the same tag (Changes don't keep a Fact's id).
    // Adding or deleting one stays a Change of its own, so the edits
    // after adding one leave the add in the list.
    case 'fact':
      return (
        last.kind === 'fact' &&
        last.did === 'edit' &&
        next.did === 'edit' &&
        last.tag === next.tag &&
        last.now === next.was
      );
    default:
      return false;
  }
}
