import type { AppState, LinkOpen } from '@/client/state';

import { formatName } from '../tree-view/renderer';

// The others in the Volume sharing the source's Mark, whose Box moves or
// goes with it, by name.
export function alsoCiting(state: AppState, source: LinkOpen): string[] {
  const rows = state.viewer.citations.get();
  const { markKey, id } = source.citation;
  if (!Array.isArray(rows)) return [];
  const persons = state.chart.people.get().persons;
  return rows
    .filter((r) => r.citation.markKey === markKey && r.citation.id !== id)
    .map((r) => {
      const person = persons.get(r.personId);
      return person === undefined ? null : formatName(person);
    })
    .filter((n) => n !== null);
}
