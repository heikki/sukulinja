import { volumeTitle } from '@/client/link-labels';
import type { LinkStatus } from '@/client/state';
import { BOOK_NAMES } from '@/common/books';
import { factKindLabel, factWords } from '@/common/facts';
import type { CitationRow, FactRow } from '@/common/types';

export function factLabel(fact: FactRow) {
  return factKindLabel(fact.tag);
}

// The Fact in words; a marriage names the spouse. An event with nothing
// else reads as a dash. A place in Finland is read without its "Suomi",
// as the app is for Finnish trees; a place elsewhere keeps its country.
export function factText(fact: FactRow) {
  const parts = [factWords({ ...fact, place: placeInFinland(fact.place) })];
  if (fact.spouse !== null) parts.push(`with ${fact.spouse}`);
  const said = parts.filter((x) => x !== null);
  return said.length === 0 ? '—' : said.join(' · ');
}

function placeInFinland(place: string | null) {
  return place?.replace(/, (?:Suomi|Finland)$/, '') ?? null;
}

// The person's Citations supporting the Fact, as their sources list them
// (ADR-0022).
export function sourcesOf<S extends { citation: CitationRow }>(
  fact: FactRow,
  sources: S[]
) {
  return sources.filter((s) => s.citation.supports.includes(fact.id));
}

// Kept in a cookie for the reason appearance.ts gives: the app's origin
// changes every launch, and cookies are scoped by host alone.
const WIDTH_COOKIE = 'sl-details-width';
const OPEN_COOKIE = 'sl-details-open';
const SECTIONS_COOKIE = 'sl-details-sections';
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

// Which of the panel's sections were left open, so they open as they were
// left; none at first.
export function sectionsOpened() {
  const prefix = `${SECTIONS_COOKIE}=`;
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(prefix))
    ?.slice(prefix.length);
  const on = new Set(raw?.split('.') ?? []);
  return {
    family: on.has('family'),
    facts: on.has('facts'),
    photos: on.has('photos'),
    sources: on.has('sources')
  };
}

export function setSectionsOpened(opened: Record<string, boolean>) {
  const on = Object.keys(opened).filter((k) => opened[k] === true);
  document.cookie = `${SECTIONS_COOKIE}=${on.join('.')}; path=/; max-age=${YEAR_S}; samesite=lax`;
}

// Whether the details dock was left open, so it opens as it was left.
export function detailsOpen() {
  return document.cookie.split('; ').includes(`${OPEN_COOKIE}=on`);
}

export function setDetailsOpen(open: boolean) {
  document.cookie = open
    ? `${OPEN_COOKIE}=on; path=/; max-age=${YEAR_S}; samesite=lax`
    : `${OPEN_COOKIE}=; path=/; max-age=0; samesite=lax`;
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
