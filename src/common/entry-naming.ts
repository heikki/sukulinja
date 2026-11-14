// Who can be named in an Entry (ADR-0026): the rule the server refuses an
// Entry by, and the Scan viewer's card offers people by, so the two can't
// drift apart.

import { entryRoles } from '@/common/books';
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

// Why the people can't be named in an entry of the Volume, by its label,
// whoever else cites the Image: no one named, a Role not one of its
// Book's, or someone named twice. Null when they can.
export function namingRefusal(volume: string, people: InEntry[]) {
  if (people.length === 0) return 'Name someone in it.';
  const roles = entryRoles(volume).map((r) => r.role);
  if (people.some((p) => p.role !== null && !roles.includes(p.role))) {
    return "That isn't a Role in this kind of entry.";
  }
  const named = new Set(people.map((p) => p.personId));
  return named.size < people.length ? 'Someone is named twice.' : null;
}
