import { gedcomDate } from '@common/dates';
import type { FactRow } from '@common/types';

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
  CENS: 'Census',
  BARM: 'Bar mitzvah',
  BASM: 'Bat mitzvah',
  BLES: 'Blessing',
  CHRA: 'Adult christening',
  FCOM: 'First communion',
  PROB: 'Probate',
  WILL: 'Will',
  CAST: 'Caste',
  DSCR: 'Description',
  IDNO: 'Identity number',
  NCHI: 'Number of children',
  NMR: 'Number of marriages',
  PROP: 'Property',
  RELI: 'Religion',
  SSN: 'Social security number',
  TITL: 'Title',
  FACT: 'Fact',
  MARR: 'Marriage',
  DIV: 'Divorce',
  ENGA: 'Engagement',
  ANUL: 'Annulment',
  MARB: 'Marriage banns',
  MARC: 'Marriage contract',
  MARL: 'Marriage licence',
  MARS: 'Marriage settlement',
  DIVF: 'Divorce filing'
};

export function factLabel(fact: FactRow) {
  return FACT_LABELS[fact.tag] ?? fact.tag;
}

// The date, read, then place, address and value as recorded, joined; a
// marriage names the spouse. A value of "Y" is GEDCOM's flag that the
// event happened ("DEAT Y"), not text, so an event with nothing else
// reads as a dash.
export function factText(fact: FactRow) {
  const date = fact.date === null ? null : gedcomDate(fact.date);
  const value = fact.value === 'Y' ? null : fact.value;
  const parts = [date, fact.place, fact.address, value].filter(
    (x) => x !== null && x !== ''
  );
  if (fact.spouse !== null) parts.push(`with ${fact.spouse}`);
  return parts.length === 0 ? '—' : parts.join(' · ');
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
