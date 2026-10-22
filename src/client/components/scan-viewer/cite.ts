import type { PersonRow, VolumeCitation } from '@/common/types';

import type { MenuItem } from '../context-menu';
import { householdsOf } from '../person-panel/family';
import type { FamilyIndices } from '../person-panel/family';
import { formatDates, formatName } from '../tree-view/renderer';
import { imageOf } from './citations';

// Someone an entry can be cited for, named as the menu lists them: how
// they're related and their years muted beside the name.
export interface CiteChoice {
  personId: number;
  label: string;
  muted: MenuItem['muted'];
}

// The people listed beside the scan: their Citations link the Image shown,
// Marked, Match or Estimate. An entry isn't cited for them again.
export function citingImage(rows: VolumeCitation[], image: number) {
  return new Set(
    rows.filter((r) => imageOf(r) === image).map((r) => r.personId)
  );
}

// The Selected person, then their family as the person panel lists it:
// parents and siblings, then each spouse with their children, each named
// with how they're related and their years, as names repeat in a family.
// Those in `left` are left out.
export function citeChoices(
  selectedId: number,
  ix: FamilyIndices,
  left: Set<number>
) {
  const self = ix.persons.get(selectedId);
  const family = householdsOf(selectedId, ix).flat();
  const choices: CiteChoice[] = [];
  const seen = new Set(left);
  function add(p: PersonRow, relation: string | null) {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    const dates = formatDates(p);
    choices.push({
      personId: p.id,
      label: formatName(p),
      muted: {
        before: relation === null ? undefined : `${relation} ·`,
        after: dates === '' ? undefined : `(${dates})`
      }
    });
  }
  if (self !== undefined) add(self, null);
  for (const r of family) add(r.person, r.relation);
  return choices;
}

// Everyone the search can find to cite the entry for: all but `left`.
export function searchable(persons: Map<number, PersonRow>, left: Set<number>) {
  return new Map([...persons].filter(([id]) => !left.has(id)));
}
