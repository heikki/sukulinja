// Who can be named in an Entry (ADR-0026): the rule the server refuses an
// Entry by, and the Scan viewer's card offers people by, so the two can't
// drift apart.

import { eventRoles } from '@/common/entry-events';
import type { EntryEvent } from '@/common/entry-events';
import type { InEntry } from '@/common/operations';
import type { VolumeCitation } from '@/common/types';

export const ALREADY_LINKED = 'Their Citations already link this Image.';

// The people whose Citations link the Image, Marked, Match or Estimate,
// but for those of the Entry `except`: an entry isn't cited for them
// again.
export function citingImage(
  rows: VolumeCitation[],
  image: number,
  except: number | null = null
) {
  return new Set(
    rows
      .filter((r) => except === null || r.citation.entryId !== except)
      .filter((r) => 'image' in r.link && r.link.image === image)
      .map((r) => r.personId)
  );
}

// Why the people can't be named in an Entry of the Event (ADR-0033),
// whoever else cites the Image: no one named, no Event chosen, a Role not
// one of its Event's, someone named twice, or more than one in an Entry
// with no Roles. One made before naming more (`before`, by person) keeps
// them, but takes no one else. Null when they can.
export function namingRefusal(
  event: EntryEvent | null,
  people: InEntry[],
  before: number[] = []
) {
  if (people.length === 0) return 'Name someone in it.';
  if (event === null) return 'Choose what kind of entry it is.';
  const roles = eventRoles(event).map((r) => r.role);
  if (people.some((p) => p.role !== null && !roles.includes(p.role))) {
    return "That isn't a Role in this kind of entry.";
  }
  const named = new Set(people.map((p) => p.personId));
  if (named.size < people.length) return 'Someone is named twice.';
  const added = people.filter((p) => !before.includes(p.personId));
  if (roles.length === 0 && people.length > 1 && added.length > 0) {
    return 'This kind of entry names one person.';
  }
  return null;
}
