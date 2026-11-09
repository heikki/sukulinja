import { volumeTitle } from '@/client/link-labels';
import type { AppState } from '@/client/state';
import { bookLabel } from '@/common/books';
import type { CitationRow, Link, Reminder } from '@/common/types';

import { formatName } from '../tree-view/renderer';

// What a header has found out for each app, by `citation <id>`, so it
// keeps it once the Scan viewer that showed it closes, or another person
// is selected.
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

// The page a reference cites, or else the Image its Link is on.
function pageOf(citation: CitationRow, link: Link | null) {
  if (citation.citedPage !== null) return `page ${citation.citedPage}`;
  return link !== null && 'image' in link ? `Image ${link.image}` : null;
}

function joined(parts: Array<string | null>) {
  const known = parts.filter((p) => p !== null);
  return known.length === 0 ? null : known.join(' · ');
}

// Where a Citation points: the Volume its Link is in, named as the Scan
// viewer names it, and its page; as far as the app has it or had it, null
// with no Link.
function citedAt(state: AppState, citationId: number) {
  return kept(state, `citation ${citationId}`, citedHere(state, citationId));
}

function citedHere(state: AppState, citationId: number) {
  const cited = citationOf(state, citationId);
  if (cited === null) return null;
  const { citation, link } = cited;
  if (link === null) return null;
  return joined([volumeTitle(link.volume), pageOf(citation, link)]);
}

function nameOf(state: AppState, personId: number) {
  const person = state.chart.people.get().persons.get(personId);
  return person === undefined ? 'Someone' : formatName(person);
}

// A person, as a header: their name.
export function personHeader(state: AppState, personId: number) {
  return [nameOf(state, personId)];
}

// A Citation as its own says: a church book by its name, years and page,
// as the reference gives them, or else as written, or its source.
function ownOf(citation: CitationRow) {
  const { cited } = citation;
  const book = cited === null ? null : bookLabel(cited, citation.citedPage);
  return book ?? citation.reference ?? citation.source;
}

// A person's Citation, as a header: their name, then the Volume and page,
// or without a Link, its book as the reference gives it; while the
// Citation isn't in, `written`, as the Reminder gave it.
export function citationHeader(
  state: AppState,
  at: { personId: number; citationId: number },
  written: string | null = null
) {
  const cited = citationOf(state, at.citationId);
  const own = cited === null ? null : ownOf(cited.citation);
  const where = citedAt(state, at.citationId) ?? own ?? written;
  return [nameOf(state, at.personId), where ?? 'their Citation'];
}

// An Image, as a header: its Volume, named as the Scan viewer names it,
// and number.
export function imageHeader(at: { volume: string; image: number }) {
  return [`${volumeTitle(at.volume)} · Image ${at.image}`];
}

// What a Reminder is on, as its dialog heads it: the person's name, then
// the Volume and page; what isn't known yet is left out.
export function headerOf(state: AppState, reminder: Reminder) {
  const { on } = reminder;
  if (on.kind === 'image') {
    const image = imageHeader(on);
    if (on.personId === null) return image;
    return [nameOf(state, on.personId), ...image];
  }
  if (on.kind === 'person') return personHeader(state, on.personId);
  return citationHeader(state, on, on.reference ?? on.source);
}
