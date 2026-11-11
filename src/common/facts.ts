// The kinds of Fact, by GEDCOM tag, as the app names them, the ones it
// offers to add, and how a Fact reads.

import { gedcomDate } from './dates';

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

// A kind's name, or its tag when the app has none for it.
export function factKindLabel(tag: string) {
  return FACT_LABELS[tag] ?? tag;
}

// The kinds a Fact can be added as, in the order offered: a person's, then
// a family's.
const PERSON_ADDABLE = 'BIRT CHR DEAT BURI RESI OCCU CENS EMIG IMMI EVEN';
const FAMILY_ADDABLE = 'MARR DIV';

export const ADDABLE_FACTS: ReadonlyArray<{ tag: string; family: boolean }> = [
  ...PERSON_ADDABLE.split(' ').map((tag) => ({ tag, family: false })),
  ...FAMILY_ADDABLE.split(' ').map((tag) => ({ tag, family: true }))
];

// The kinds whose value is what they say, an attribute's: an occupation's
// title. An event's value is only GEDCOM's "it happened" flag.
const ATTRIBUTES = new Set([
  'CAST',
  'DSCR',
  'EDUC',
  'IDNO',
  'NATI',
  'NCHI',
  'NMR',
  'OCCU',
  'PROP',
  'RELI',
  'SSN',
  'TITL',
  'FACT'
]);

export function hasValue(tag: string) {
  return ATTRIBUTES.has(tag);
}

// The kinds that say what they are in their type: an Event's "Muutto".
export function hasType(tag: string) {
  return tag === 'EVEN' || tag === 'FACT';
}

// A Fact in words: the date, read, then the type, place, address and value
// as recorded, joined; null when it says nothing but that it happened. A
// value of "Y" is GEDCOM's flag that the event happened ("DEAT Y"), not
// text.
export function factWords(fact: {
  date: string | null;
  type?: string | null;
  place: string | null;
  address: string | null;
  value: string | null;
}) {
  const date = fact.date === null ? null : gedcomDate(fact.date);
  const value = fact.value === 'Y' ? null : fact.value;
  const parts = [date, fact.type ?? null, fact.place, fact.address, value];
  const said = parts.filter((x) => x !== null && x !== '');
  return said.length === 0 ? null : said.join(' · ');
}
