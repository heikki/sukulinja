import { volumeTitle } from '@/client/link-labels';
import type { LinkStatus } from '@/client/state';
import { BOOK_NAMES } from '@/common/books';
import { gedcomDate } from '@/common/dates';
import { factKindLabel, factWords } from '@/common/facts';
import { suggestedSupport } from '@/common/suggestions';
import type { CitationRow, FactRow } from '@/common/types';

export function factLabel(fact: FactRow) {
  return factKindLabel(fact.tag);
}

// The Fact in words; a marriage names the spouse. An event with nothing
// else reads as a dash.
export function factText(fact: FactRow) {
  const parts = [factWords(fact)];
  if (fact.spouse !== null) parts.push(`with ${fact.spouse}`);
  const said = parts.filter((x) => x !== null);
  return said.length === 0 ? '—' : said.join(' · ');
}

// The Fact by its kind and date, "Birth 3.3.1795", and for a marriage the
// spouse: short enough for a toggle.
export function factBrief(fact: FactRow) {
  const parts = [factLabel(fact)];
  if (fact.date !== null) parts.push(gedcomDate(fact.date));
  if (fact.spouse !== null) parts.push(`with ${fact.spouse}`);
  return parts.join(' ');
}

// The person's Citations supporting the Fact, as their sources list them
// (ADR-0022).
export function sourcesOf<S extends { citation: CitationRow }>(
  fact: FactRow,
  sources: S[]
) {
  return sources.filter((s) => s.citation.supports.includes(fact.id));
}

// The support the Citation's Transcription suggests among the Facts, of
// those it doesn't give yet: to confirm by hand.
export function openSuggestions(citation: CitationRow, facts: FactRow[]) {
  return suggestedSupport(citation.transcribed, facts).filter(
    (s) => !citation.supports.includes(s.factId)
  );
}

// Kept in a cookie for the reason appearance.ts gives: the app's origin
// changes every launch, and cookies are scoped by host alone.
const WIDTH_COOKIE = 'sl-details-width';
const DEFAULT_WIDTH_PX = 380;
const YEAR_S = 365 * 24 * 60 * 60;

export function detailsWidth() {
  const prefix = `${WIDTH_COOKIE}=`;
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(prefix))
    ?.slice(prefix.length);
  const w = Number(raw);
  return raw === undefined || !Number.isFinite(w) ? DEFAULT_WIDTH_PX : w;
}

export function setDetailsWidth(px: number) {
  document.cookie = `${WIDTH_COOKIE}=${Math.round(px)}; path=/; max-age=${YEAR_S}; samesite=lax`;
}

const SITE_NAMES: Array<[RegExp, string]> = [
  [/(?:^|\.)myheritage\./, 'MyHeritage'],
  [/(?:^|\.)familysearch\./, 'FamilySearch'],
  [/(?:^|\.)geni\./, 'Geni'],
  [/(?:^|\.)ancestry\./, 'Ancestry']
];

// A record link says which site it opens: its name if known, else its host.
export function siteName(url: string) {
  const host = URL.canParse(url) ? new URL(url).hostname : null;
  if (host === null) return 'Record';
  const known = SITE_NAMES.find(([re]) => re.test(host));
  return known?.[1] ?? host.replace(/^www\./, '');
}

// A source citing an Astia Image itself, such as one made in the app: a
// church book with no Church-book reference to read.
function citesImage(c: CitationRow) {
  return c.churchBook && c.cited === null;
}

// A Church-book reference names itself, and a Citation of an Image its
// source, its text unfolding below; other sources go by their title, or
// failing that what they say.
export function headingOf(c: CitationRow) {
  if (citesImage(c)) return c.source ?? 'Source';
  return c.reference ?? c.source ?? c.text ?? c.page ?? 'Source';
}

// The archive a resolved reference's Link or looking through names.
function archiveNamed(status: LinkStatus) {
  return status.link?.archive ?? status.browse?.archive ?? null;
}

// What can be done of a Church-book reference's archive: finding its
// parish's in Astia where none is known, or changing the one its parish's
// spelling links into. Nothing for another source, one whose parish can't
// be read, or one not yet resolved.
export function archiveAction(
  c: CitationRow,
  status: LinkStatus | null
): 'find' | 'change' | null {
  if ((c.cited?.parish ?? null) === null || status === null) return null;
  if (status.unlinked === 'no-archive') return 'find';
  return archiveNamed(status) === null ? null : 'change';
}

// Under its archive, a Church-book reference goes by the Volume it links,
// named as Astia names it but for its code: "Pää- ja rippikirjat
// (1783-1790)", as a Citation of an Image does, its text unfolding below;
// one the archive's books lack goes by its Book.
export function titleText(c: CitationRow, status: LinkStatus | null) {
  const link = status?.link ?? null;
  if (link !== null) return volumeTitle(link.volume);
  const kind = c.cited?.kind ?? null;
  if ((status?.browse ?? null) === null || kind === null) return headingOf(c);
  return BOOK_NAMES[kind];
}
