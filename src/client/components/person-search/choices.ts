import type { PersonRow } from '@/common/types';

import type { MenuItem } from '../context-menu';
import { householdsOf } from '../person-panel/family';
import type { FamilyIndices } from '../person-panel/family';
import { formatDates, formatName } from '../tree-view/renderer';

// Someone a viewer can pick for what's under its menu, a Citation of an
// entry or a Tag, named as the menu lists them: how they're related and
// their years muted beside the name.
export interface PersonChoice {
  personId: number;
  label: string;
  muted: MenuItem['muted'];
}

// The Selected person, then their family as the person panel lists it:
// parents and siblings, then each spouse with their children, each named
// with how they're related and their years, as names repeat in a family.
// Those in `left` are left out.
export function familyChoices(
  selectedId: number,
  ix: FamilyIndices,
  left: Set<number>
) {
  const self = ix.persons.get(selectedId);
  const family = householdsOf(selectedId, ix).flat();
  const choices: PersonChoice[] = [];
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

// Everyone the search can find to pick: all but `left`.
export function searchable(persons: Map<number, PersonRow>, left: Set<number>) {
  return new Map([...persons].filter(([id]) => !left.has(id)));
}
