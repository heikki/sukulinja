import type { CitationRow, FactRow, Scan, ScanResolution } from '@common/types';

import { methodHint, methodLabel, splitLabel } from '../scan-viewer/citations';

const FACT_LABELS: Record<string, string> = {
  BIRT: 'Birth',
  CHR: 'Christening',
  BAPM: 'Baptism',
  DEAT: 'Death',
  BURI: 'Burial',
  CREM: 'Cremation',
  ADOP: 'Adoption',
  CONF: 'Confirmation',
  ORDN: 'Ordination',
  EVEN: 'Event',
  OCCU: 'Occupation',
  RESI: 'Residence',
  EDUC: 'Education',
  NATI: 'Nationality',
  IMMI: 'Immigration',
  EMIG: 'Emigration',
  NATU: 'Naturalization',
  GRAD: 'Graduation',
  RETI: 'Retirement',
  MARR: 'Marriage',
  DIV: 'Divorce',
  ENGA: 'Engagement',
  ANUL: 'Annulment',
  MARB: 'Marriage banns',
  MARC: 'Marriage contract',
  MARL: 'Marriage licence',
  MARS: 'Marriage settlement'
};

export function factLabel(fact: FactRow) {
  return FACT_LABELS[fact.tag] ?? fact.tag;
}

// Date, place, address and value as recorded, joined; a marriage names the
// spouse.
export function factText(fact: FactRow) {
  const parts = [fact.date, fact.place, fact.address, fact.value].filter(
    (x) => x !== null && x !== ''
  );
  if (fact.spouse !== null) parts.push(`with ${fact.spouse}`);
  return parts.join(' · ');
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

// Resolving found the parish's books but not the Image. Other errors (no
// archive, unparsed, Astia down) found no books to look in.
const FINDABLE = new Set(['no matching volume', 'not digitized', 'no images']);

// A church-book source's scan, in brief: how its Image was found, in the
// Scan viewer's words, or why there's none; the tooltip says where. Opening
// the source shows `scan` in the Scan viewer, if there is one.
export interface ScanStatus {
  label: string;
  title: string;
  scan: Scan | null;
}

// Scans arrive after the panel renders; until then the status is pending. A
// Split reference opens on its first candidate.
export function scanStatus(
  resolution: ScanResolution | undefined,
  pending: boolean
): ScanStatus {
  if (resolution === undefined) {
    const label = pending ? 'Finding scan…' : 'Scan unavailable';
    return { label, title: '', scan: null };
  }
  if ('error' in resolution) {
    const findable = FINDABLE.has(resolution.error);
    return {
      label: findable ? 'Not found' : 'No scan',
      title: findable
        ? "The parish's books were found but not the Image."
        : `No scan could be found (${resolution.error}).`,
      scan: null
    };
  }
  const { scans } = resolution;
  const [first] = scans;
  if (first === undefined) return { label: 'No scan', title: '', scan: null };
  const label = methodLabel(first.method, first.by);
  return {
    label: scans.length > 1 ? splitLabel(label) : label,
    title: scanTitle(scans),
    scan: first
  };
}

// What the status means, then where: each candidate Volume of a Split
// reference, which opens on the first.
export function scanTitle(scans: Scan[]) {
  const [first] = scans;
  const split =
    scans.length > 1
      ? ['The reference fits several Volumes; it opens on the first.']
      : [];
  const where = scans.map((s) => `${s.volume}, image ${s.image}`);
  const hint = first === undefined ? [] : [methodHint(first.method, first.by)];
  return [...hint, ...split, ...where].join('\n');
}

// Sources under one heading: an archive's (`linked`), the church books'
// with no Volume, or the others'. Named only when there's a church book
// among them.
export interface SourceGroup {
  label: string | null;
  rows: CitationRow[];
  linked: boolean;
}

function firstScan(resolution: ScanResolution | undefined) {
  return resolution !== undefined && 'scans' in resolution
    ? (resolution.scans[0] ?? null)
    : null;
}

// The heading a source goes under: the archive of the Volume it links (a
// Split reference's first), else the church books' or the others'.
function headingFor(c: CitationRow, scans: Map<number, ScanResolution>) {
  const scan = c.churchBook ? firstScan(scans.get(c.id)) : null;
  if (scan === null) {
    return { label: c.churchBook ? 'Church books' : 'Other', scan };
  }
  return { label: scan.archive ?? 'Church books', scan };
}

// The sources by the archive whose Volume they link, in the order the
// server sends them (church books by year, the others last); a Volume's
// references together, by page.
export function groupSources(
  citations: CitationRow[],
  scans: Map<number, ScanResolution>
) {
  const groups = new Map<string, SourceGroup>();
  const volumeOrder = new Map<string, number>();
  const placeOf = new Map<number, [number, number]>();
  for (const c of citations) {
    const { label, scan } = headingFor(c, scans);
    const linked = scan !== null;
    const key = `${linked}:${label}`;
    const group = groups.get(key) ?? { label, rows: [], linked };
    group.rows.push(c);
    groups.set(key, group);
    if (scan === null) continue;
    if (!volumeOrder.has(scan.volumeId)) {
      volumeOrder.set(scan.volumeId, volumeOrder.size);
    }
    placeOf.set(c.id, [volumeOrder.get(scan.volumeId)!, c.citedPage ?? 0]);
  }
  function byPlace(a: CitationRow, b: CitationRow) {
    const [va, pa] = placeOf.get(a.id) ?? [0, 0];
    const [vb, pb] = placeOf.get(b.id) ?? [0, 0];
    return va === vb ? pa - pb : va - vb;
  }
  const named = citations.some((c) => c.churchBook);
  return [...groups.values()].map((g) => ({
    ...g,
    label: named ? g.label : null,
    rows: g.linked ? g.rows.toSorted(byPlace) : g.rows
  }));
}
