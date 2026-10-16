import type { FactRow, Scan, ScanResolution } from '@common/types';

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

// Opens in the Scan viewer, so no ↗: that marks links leaving the app.
// Resolving found the parish's books but not the Image, so it can be looked
// for by hand. Other errors (no archive, unparsed, Astia down) can't.
const FINDABLE = new Set(['no matching volume', 'not digitized', 'no images']);

// A church-book source's scan, in brief: how its Image was found, in the
// Scan viewer's words, or why there's none; the tooltip says where. Opening the source shows `target`:
// the Scan viewer on its scan, on none to look for the Image (`scan: null`),
// or nothing (null).
export interface ScanStatus {
  label: string;
  title: string;
  target: { scan: Scan | null } | null;
}

// Scans arrive after the panel renders; until then the status is pending. A
// Split reference opens on its first candidate; the viewer's switcher lists
// the others first.
export function scanStatus(
  resolution: ScanResolution | undefined,
  pending: boolean
): ScanStatus {
  if (resolution === undefined) {
    const label = pending ? 'Finding scan…' : 'Scan unavailable';
    return { label, title: '', target: null };
  }
  if ('error' in resolution) {
    const findable = FINDABLE.has(resolution.error);
    return {
      label: findable ? 'Not found' : 'No scan',
      title: findable
        ? "The parish's books were found but not the Image: open the source to look for it."
        : `No scan could be found (${resolution.error}).`,
      target: findable ? { scan: null } : null
    };
  }
  const { scans } = resolution;
  const [first] = scans;
  if (first === undefined) return { label: 'No scan', title: '', target: null };
  const label = methodLabel(first.method, first.by);
  return {
    label: scans.length > 1 ? splitLabel(label) : label,
    title: scanTitle(scans),
    target: { scan: first }
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
