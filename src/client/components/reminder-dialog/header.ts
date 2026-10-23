import type { AppState } from '@/client/state';
import type { CitationRow, Link, Reminder } from '@/common/types';

import { formatName } from '../tree-view/renderer';

// A Citation, with its Link, as far as the app has it: among the Selected
// person's sources, or the rows of the Volume the Scan viewer shows.
function citationOf(state: AppState, citationId: number) {
  for (const group of state.selected.sources.get()) {
    for (const { citation, status } of group.sources) {
      if (citation.id === citationId) {
        return { citation, link: status?.link ?? null };
      }
    }
  }
  const rows = state.viewer.citations.get();
  const row = Array.isArray(rows)
    ? rows.find((r) => r.citation.id === citationId)
    : undefined;
  return row === undefined ? null : { citation: row.citation, link: row.link };
}

// The parish of a Volume the Scan viewer shows, as the references linking
// it name it.
function parishOf(state: AppState, volumeId: string) {
  if (state.viewer.volume.get()?.id !== volumeId) return null;
  const rows = state.viewer.citations.get();
  if (!Array.isArray(rows)) return null;
  const named = rows.map((r) => r.citation.cited?.parish ?? null);
  return named.find((p) => p !== null) ?? null;
}

// The page a reference cites, or else the Image its Link is on.
function pageOf(citation: CitationRow, link: Link | null) {
  if (citation.citedPage !== null) return `page ${citation.citedPage}`;
  return link !== null && 'image' in link ? `Image ${link.image}` : null;
}

function joined(parts: Array<string | null>) {
  const known = parts.filter((p) => p !== null);
  return known.length === 0 ? null : known.join(' · ');
}

// Where a Citation points: its parish, Volume and page, as far as the app
// has it; null when it has none of them.
function citedAt(state: AppState, citationId: number) {
  const found = citationOf(state, citationId);
  if (found === null) return null;
  const { citation, link } = found;
  return joined([
    citation.cited?.parish ?? null,
    link?.volume ?? null,
    pageOf(citation, link)
  ]);
}

// What a Reminder is on, as its dialog heads it: the person's name, then
// the parish, Volume and page; what isn't known yet is left out.
export function headerOf(state: AppState, reminder: Reminder) {
  const { on } = reminder;
  if (on.kind === 'image') {
    const parish = parishOf(state, on.volumeId);
    return [joined([parish, on.volume, `Image ${on.image}`])!];
  }
  const person = state.chart.people.get().persons.get(on.personId);
  const name = person === undefined ? 'Someone' : formatName(person);
  if (on.kind === 'person') return [name];
  const at = citedAt(state, on.citationId);
  return [name, at ?? on.reference ?? on.source ?? 'their Citation'];
}
