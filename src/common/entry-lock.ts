// A saved Entry's kind and owner stay as saved (ADR-0037): the rule the
// server refuses an edit by, and the Entry pane saves a new Entry by, so
// the two can't drift apart. Its owner is whom its Facts are of: a
// baptism's child, a marriage's groom and bride, a burial's or household
// line's one person. An empty kind, or an owner's Role no one is in, is
// filled once as an edit; then it stays too.

import type { EntryEvent } from './entry-events';
import type { InEntry } from './operations';

// Who an Entry is of, as it names them.
export interface Named {
  event: EntryEvent | null;
  people: InEntry[];
}

// The owner's Roles each with whom it names in them: none for an Entry
// with no kind, or a burial or household line made before naming more.
export function ownerRoles({ event, people }: Named) {
  function inRole(role: string) {
    return { role, personId: people.find((p) => p.role === role)?.personId };
  }
  if (event === 'CHR') return [inRole('CHIL')];
  if (event === 'MARR') return [inRole('HUSB'), inRole('WIFE')];
  const [only, ...more] = people;
  return event === null || more.length > 0
    ? []
    : [{ role: null, personId: only?.personId }];
}

// Whether the Entry as it is `now` has another kind or owner than as
// `saved`: then it's saved as a new Entry.
export function changesLock(saved: Named, now: Named) {
  if (saved.event === null) return false;
  if (now.event !== saved.event) return true;
  const after = ownerRoles(now);
  return ownerRoles(saved).some(
    ({ role, personId }) =>
      personId !== undefined &&
      after.find((a) => a.role === role)?.personId !== personId
  );
}

export const LOCKED =
  "An entry's kind and whom it's about stay as saved: changing them saves a new entry.";

// Why a save is refused when the tree changed since its lines were
// listed; the Entry pane lists them again.
export const TREE_CHANGED =
  'The tree has changed since; look at the list again.';
