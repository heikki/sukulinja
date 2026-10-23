import type { AppState } from '@/client/state';
import type { CitationRow, Link, Reminder } from '@/common/types';

import { formatName } from '../tree-view/renderer';

// What a header has found out for each app, by `citation <id>` and
// `volume <id>`, so it keeps it once the Scan viewer that showed it
// closes, or another person is selected.
const found = new WeakMap<AppState, Map<string, string>>();

// `value`, remembered under `key`; or while it's null, what was before.
function kept(state: AppState, key: string, value: string | null) {
  let known = found.get(state);
  if (known === undefined) {
    known = new Map();
    found.set(state, known);
  }
  if (value === null) return known.get(key) ?? null;
  known.set(key, value);
  return value;
}

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
function parishShown(state: AppState, volumeId: string) {
  if (state.viewer.volume.get()?.id !== volumeId) return null;
  const rows = state.viewer.citations.get();
  if (!Array.isArray(rows)) return null;
  const named = rows.map((r) => r.citation.cited?.parish ?? null);
  return named.find((p) => p !== null) ?? null;
}

function parishOf(state: AppState, volumeId: string) {
  return kept(state, `volume ${volumeId}`, parishShown(state, volumeId));
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
// has it or had it; null when it has none of them.
function citedAt(state: AppState, citationId: number) {
  return kept(state, `citation ${citationId}`, citedHere(state, citationId));
}

function citedHere(state: AppState, citationId: number) {
  const cited = citationOf(state, citationId);
  if (cited === null) return null;
  const { citation, link } = cited;
  return joined([
    citation.cited?.parish ?? null,
    link?.volume ?? null,
    pageOf(citation, link)
  ]);
}

function nameOf(state: AppState, personId: number) {
  const person = state.chart.people.get().persons.get(personId);
  return person === undefined ? 'Someone' : formatName(person);
}

// A person's Citation, as a header: their name, then the parish, Volume
// and page, or while those aren't in, `written` (its reference as written)
// or the Citation's own.
export function citationHeader(
  state: AppState,
  at: { personId: number; citationId: number },
  written: string | null = null
) {
  const cited = citationOf(state, at.citationId);
  const own = cited?.citation.reference ?? cited?.citation.source ?? null;
  const where = citedAt(state, at.citationId) ?? written ?? own;
  return [nameOf(state, at.personId), where ?? 'their Citation'];
}

// An Image, as a header: its parish, Volume and number.
export function imageHeader(
  state: AppState,
  at: { volumeId: string; volume: string; image: number }
) {
  const parish = parishOf(state, at.volumeId);
  return [joined([parish, at.volume, `Image ${at.image}`])!];
}

// What a Reminder is on, as its dialog heads it: the person's name, then
// the parish, Volume and page; what isn't known yet is left out.
export function headerOf(state: AppState, reminder: Reminder) {
  const { on } = reminder;
  if (on.kind === 'image') return imageHeader(state, on);
  if (on.kind === 'person') return [nameOf(state, on.personId)];
  return citationHeader(state, on, on.reference ?? on.source);
}
