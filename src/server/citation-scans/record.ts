// MyHeritage record citations: the transcription MyHeritage keeps in a
// citation's DATA/TEXT, read back into its fields for display, and into the
// church-book reference it points to, for mapping to a scan.

import type { HouseholdMember, RecordField, RecordView } from '@common/types';

import { bookKind, decodeEntities, stripParens, yearRange } from './text';
import type { BookKind, Years } from './text';

// MyHeritage collections that cite Finnish church books.
export const RIPPI_COLLECTION = '10509';
export const CHURCH_COLLECTIONS = new Set([RIPPI_COLLECTION, '30233', '30200']);

export interface ChurchBookRef {
  url: string;
  collection: string;
  parish: string | null;
  kind: BookKind | null;
  years: Years | null;
  page: number | null;
  // Village and farm names, used to pick among volumes split by village.
  places: string[];
  // MyHeritage's record number in the collection, which names the film.
  recordId: number | null;
  // Whom the record is about: the rippikirja record's principal, or the
  // person (or couple) an index entry names.
  name: string | null;
  // An index reference's event date, as precise as the text gives it:
  // YYYY-MM-DD, YYYY-MM or YYYY. Null for rippikirja references.
  date: string | null;
  // The principal as the record's household table lists them, to tell them
  // from namesakes on the scan: many are named by first name alone. Where
  // the table gives no birth date, or there's no table, the record's own;
  // null where it has neither, and for index references.
  household: Household | null;
  // The others an index entry names, by their part in it: for a baptism,
  // the child and the parents. The person cited may be any of them. Empty
  // for rippikirja references.
  named: EntryName[];
}

export interface EntryName {
  relation: 'child' | 'father' | 'mother' | 'spouse';
  name: string;
}

export interface Household {
  born: string | null;
  // Relation to the household head, as MyHeritage writes it ("Tytär").
  relation: string | null;
  // The household head, or failing one someone listed in full beside them.
  with: string | null;
  // The whole table, in the book's order, the principal among them: whom to
  // look for on the scan around them.
  members: HouseholdMember[];
}

export function collectionOf(url: string) {
  return /collection-(?<c>\d+)/.exec(url)?.groups?.c ?? null;
}

function recordIdOf(url: string) {
  const id = /[?&]itemId=(?<id>\d+)/.exec(url)?.groups?.id;
  return id === undefined ? null : Number(id);
}

// Some citations are HTML, some escaped once more on top of that.
function decodeFully(raw: string) {
  let text = raw;
  for (let prev = ''; prev !== text;) {
    prev = text;
    text = decodeEntities(text);
  }
  return text;
}

function stripTags(html: string) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
}

export function citationText(raw: string) {
  return stripTags(decodeFully(raw));
}

const LABELS = [
  'Kirja',
  'Piirikunta',
  'Sivu',
  'Hallintoalue',
  'säilytyspaikka',
  'Kylä',
  'Maatila',
  'Katso'
];

// Double-escaped citations lose the colons: "Sivu47 HallintoaluePieksämäki".
// "Maa" (always first) is left out of the labels, as it would match inside
// "Maaseurakunta". A value also ends at its own label repeated, so an empty
// "Kirja: " header doesn't swallow the "…FinlandKirjaRippikirja" after it;
// it takes one character first, so a name starting with its label
// ("Kylä:Kyläniemi") stays whole.
function field(text: string, label: string) {
  const re = new RegExp(
    `${label}:?[ \\t]*(?<v>[^\\n\\t]+?)(?=(?:${LABELS.join('|')})|\\n|\\t|$)`,
    'g'
  );
  let value: string | null = null;
  for (const m of text.matchAll(re)) {
    const v = m.groups!.v!.trim();
    if (v !== '') value = v;
  }
  return value;
}

// "Asuinpaikka: päivämäärien 1867 ja 1879 välissä - Pekola No. 11, Wehmais,
// Mikkeli Maaseurakunta, Mikkeli (St. Michel), Finland": the names before
// the parish are farm and village.
function residencePlaces(text: string, parish: string | null) {
  const place = /Asuinpaikka:[^\n]*?\s-\s(?<p>[^\n]+)/.exec(text)?.groups?.p;
  if (place === undefined) return [];
  const parts = place.split(',').map((x) => stripParens(x));
  const end = parish === null ? -1 : parts.indexOf(parish);
  return end > 0 ? parts.slice(0, end) : [];
}

// The principal's row in the household table, and who heads it. A table
// without a head ("Perheenpää") is part of a household, such as a married
// son's family; its first member named in full stands in.
function householdOf(raw: string, name: string | null): Household | null {
  const members = readHousehold(decodeFully(raw));
  const self = members.find((m) => m.name === name);
  if (self === undefined) return null;
  const head = members.find((m) => m.relation === 'Perheenpää');
  const beside =
    head !== undefined && head !== self
      ? head
      : members.find((m) => m !== self && /\s/.test(m.name));
  return {
    born: self.born,
    relation: self.relation,
    with: beside?.name ?? null,
    members
  };
}

// Where the household table gives no birth date for the principal, or
// there's no table, the record's own still tells them from a namesake on
// the scan.
function withBorn(household: Household | null, text: string) {
  if (household?.born !== null && household?.born !== undefined) {
    return household;
  }
  const born = readFields(text).fields.find(
    (f) => f.label === 'Syntymäpäivä' || f.label === 'Syntymäaika'
  )?.value;
  if (born === undefined || born === '') return household;
  return household === null
    ? { born, relation: null, with: null, members: [] }
    : { ...household, born };
}

function parseRippiRef(url: string, text: string, raw: string): ChurchBookRef {
  const name = recordName(text);
  const book = field(text, 'Kirja');
  const rawParish = field(text, 'Hallintoalue');
  const parish = rawParish === null ? null : stripParens(rawParish);
  const page = field(text, 'Sivu');
  const named = [field(text, 'Kylä'), field(text, 'Maatila')];
  return {
    url,
    collection: RIPPI_COLLECTION,
    parish,
    kind: book === null ? null : bookKind(book),
    years: book === null ? null : yearRange(book),
    page: page === null || !/^\d+/.test(page) ? null : parseInt(page, 10),
    places: [
      ...named.filter((x) => x !== null),
      ...residencePlaces(text, parish)
    ],
    recordId: recordIdOf(url),
    name,
    date: null,
    household: withBorn(householdOf(raw, name), text),
    named: []
  };
}

// FamilySearch-derived indexes: "Ristiäiset: 29. Marras 1829 - Mikkeli, …"
function parseIndexRef(
  url: string,
  collection: string,
  text: string
): ChurchBookRef {
  const event =
    /(?<ev>Ristiäiset|Syntymä|Avioliitto|Kaste)\s*:\s*(?<date>[^\n]*?)\s+-\s+(?<place>[^,\n]+)/.exec(
      text
    )?.groups;
  return {
    url,
    collection,
    parish: event === undefined ? null : stripParens(event.place!),
    kind: event === undefined ? null : indexKind(event.ev!),
    years: event === undefined ? null : yearRange(event.date!),
    page: null,
    places: [],
    // Numbered in another collection; the films are known by rippi records.
    recordId: null,
    name: recordName(text),
    date: event === undefined ? null : isoDate(event.date!),
    household: null,
    named: entryNames(text)
  };
}

// MyHeritage labels an entry's people from the cited person's side, and
// loosely: on a parent's citation of a baptism, the child's father and
// mother can read "Puolison isä" and "Puolison äiti".
const ENTRY_RELATIONS: Record<string, EntryName['relation']> = {
  'Lapsi': 'child',
  'Tytär': 'child',
  'Poika': 'child',
  'Isä': 'father',
  'Puolison isä': 'father',
  'Äiti': 'mother',
  'Puolison äiti': 'mother',
  'Puoliso': 'spouse',
  'Aviomies': 'spouse',
  'Vaimo': 'spouse'
};

function entryNames(text: string) {
  const named: EntryName[] = [];
  for (const { label, value } of readFields(text).fields) {
    const relation = ENTRY_RELATIONS[label];
    const seen = named.some((n) => n.relation === relation && n.name === value);
    if (relation !== undefined && !seen) named.push({ relation, name: value });
  }
  return named;
}

const MONTHS = [
  'tammi',
  'helmi',
  'maalis',
  'huhti',
  'touko',
  'kesä',
  'heinä',
  'elo',
  'syys',
  'loka',
  'marras',
  'joulu'
];

// "29. Marras 1829" → "1829-11-29", "Marras 1829" → "1829-11", "1829" →
// "1829": Finnish month names, as MyHeritage writes them, sometimes with
// the "-kuu" ending.
export function isoDate(text: string) {
  const m =
    /(?:(?<day>\d{1,2})\.\s*)?(?:(?<month>\p{L}+)\s+)?(?<year>1[5-9]\d\d)/u.exec(
      text
    )?.groups;
  if (m === undefined) return null;
  const word = m.month?.toLowerCase();
  const month = MONTHS.findIndex((name) => word?.startsWith(name) === true);
  if (month < 0) return m.year!;
  const ym = `${m.year}-${String(month + 1).padStart(2, '0')}`;
  return m.day === undefined ? ym : `${ym}-${m.day.padStart(2, '0')}`;
}

function recordName(text: string) {
  const name = readFields(text).name;
  return name === '' ? null : name;
}

function indexKind(event: string): BookKind {
  return event === 'Avioliitto' ? 'vihityt' : 'kastetut';
}

export function parseChurchBookRef(url: string, raw: string) {
  const collection = collectionOf(url) ?? '?';
  const text = citationText(raw);
  return collection === RIPPI_COLLECTION
    ? parseRippiRef(url, text, raw)
    : parseIndexRef(url, collection, text);
}

// The Church-book reference a Citation makes, if it makes one: its page is
// a link into a church-book collection. The one rule the app and the
// scripts tell church books by.
export function churchBookRefOf(page: string | null, text: string | null) {
  if (page === null || !/^https?:/.test(page)) return null;
  const collection = collectionOf(page);
  return collection !== null && CHURCH_COLLECTIONS.has(collection)
    ? parseChurchBookRef(page, text ?? '')
    : null;
}

// What a Mark of the reference is written for: every citation of its
// record, for one with a Record number, else every citation of its URL.
export function markKey(ref: { url: string; recordId: number | null }) {
  return ref.recordId === null ? `url ${ref.url}` : recordMarkKey(ref.recordId);
}

// The markKey of every reference to the record.
export function recordMarkKey(recordId: number) {
  return `record ${recordId}`;
}

// The reference a citation's page makes, as far as a Mark needs it: its
// URL and Record number, without reading the citation's text. Null as for
// churchBookRefOf.
export function markedRefOf(page: string | null) {
  if (page === null || !/^https?:/.test(page)) return null;
  const collection = collectionOf(page);
  if (collection === null || !CHURCH_COLLECTIONS.has(collection)) return null;
  const recordId = collection === RIPPI_COLLECTION ? recordIdOf(page) : null;
  return { url: page, recordId };
}

// ---------------------------------------------------------------- display

// The labels MyHeritage writes before a value ("Syntymäpäivä: 1757"), often
// glued to the value before them ("1757Asuinpaikka: …"). A colon must
// follow, so a label inside a longer word or a name doesn't match.
const FIELD_LABELS = [
  'Syntymäpäivä',
  'Syntymäaika',
  'Syntymä',
  'Sukupuoli',
  'Ristiäiset',
  'Avioliitto',
  'Kuolinpäivä',
  'Kuolema',
  'Hautaus',
  'Viimeinen asuinpaikka',
  'Asuinpaikka',
  'Puolison isä',
  'Puolison äiti',
  'Puoliso',
  'Isän syntymäpaikka',
  'Äidin syntymäpaikka',
  'Äidin syntymä',
  'Isä',
  'Äiti',
  'Vanhemmat',
  'Vanhempi',
  'Sisarukset',
  'Sisarus',
  'Sisar',
  'Veli',
  'Lapset',
  'Lapsi',
  'Tytär',
  'Poika',
  'Aviomies',
  'Vaimo',
  'Suhde',
  'Sukulaiset',
  'Perhe',
  'Ikä kuollessa',
  'Ikä',
  'Ammatti',
  'Siviilisääty',
  'Occupation of father',
  'Occupation of mother',
  'Parents residence',
  'Kirja',
  'Maa',
  'Piirikunta',
  'Maatila',
  'Hallintoalue',
  'Sivu',
  'Kylä',
  'säilytyspaikka',
  'Kunta',
  'Valtio',
  'Päivämäärä',
  'Huomautukset',
  'Lähde',
  'Indeksoinnin projekti- (sarja-) numero',
  'Järjestelmälähde',
  'GS filminumero',
  'Viitenumero'
];

// Where the record sits rather than what it says.
const HIDDEN_LABELS = new Set([
  'Maa',
  'Piirikunta',
  'säilytyspaikka',
  'Indeksoinnin projekti- (sarja-) numero',
  'Järjestelmälähde',
  'GS filminumero',
  'Viitenumero'
]);

const FIELD_RE = new RegExp(
  `(?<label>${FIELD_LABELS.map((l) => l.replace(/[()]/g, '\\$&')).join('|')}):`,
  'gu'
);

// The household table follows the fields; "Katso talouden jäseniä" ("see
// the household's members") links to it.
const HOUSEHOLD_HEAD =
  /Suhde perheenpäähän; Nimi; Syntymä(?<alt>; Ehdotetut vaihtoehdot)?/;

function readFields(text: string) {
  const end = text.search(/Katso\s*talou|(?:Talous\s*)?Suhde perheenpäähän;/);
  const body = end < 0 ? text : text.slice(0, end);
  const marks = [...body.matchAll(FIELD_RE)];
  const name = (marks.length === 0 ? body : body.slice(0, marks[0]!.index))
    .split('\n')[0]!
    .trim();
  const fields: RecordField[] = [];
  marks.forEach((m, i) => {
    const from = m.index + m[0].length;
    const to = marks[i + 1]?.index ?? body.length;
    const label = m.groups!.label!;
    const value = body.slice(from, to).replace(/\s+/g, ' ').trim();
    if (value !== '' && !HIDDEN_LABELS.has(label)) {
      fields.push({ label, value });
    }
  });
  return { name, fields: withBookFields(fields, body) };
}

// A double-escaped citation's book block has no colons left, so it reads as
// one "Kirja" value ("MaaFinlandKirjaRippikirja, 1770 - 1775 Piirikunta…");
// split it with the colon-tolerant reader the scan mapping uses.
function withBookFields(fields: RecordField[], body: string) {
  const glued = fields.some(
    (f) => f.label === 'Kirja' && /Hallintoalue|Piirikunta/.test(f.value)
  );
  if (!glued) return fields;
  const book = ['Kirja', 'Maatila', 'Hallintoalue', 'Sivu', 'Kylä'].flatMap(
    (label) => {
      const value = field(body, label);
      return value === null ? [] : [{ label, value }];
    }
  );
  return [...fields.filter((f) => f.label !== 'Kirja'), ...book];
}

const DATE_RE = /^\s*(?<d>(?:(?:\d{1,2}\.\s*)?\p{L}+\s+)?\d{4})?\s*/u;

function member(relation: string, name: string, born: string) {
  return {
    relation: relation === '' ? null : relation,
    name,
    born: born === '' ? null : born
  };
}

// "Relation; Name; Birth" rows. HTML citations break rows with <br>.
function readRows(body: string) {
  const rows: HouseholdMember[] = [];
  for (const line of body.split(/<br\s*\/?>/i)) {
    const [rel, name, born] = stripTags(line)
      .split(';')
      .map((x) => x.trim());
    if (name !== undefined && name !== '') {
      rows.push(member(rel ?? '', name, born ?? ''));
    }
  }
  return rows;
}

// Plain citations run the rows together ("…; 1749Vaimo; …"), so a row's
// birth date is cut off the front of the next row's relation. With the
// suggestions column, a row's last cell carries the suggestion and the next
// row's relation instead; only the relation is kept.
function readGluedRows(body: string, alt: boolean) {
  const rows: HouseholdMember[] = [];
  const cells = stripTags(body).replace(/\n/g, '').split(';');
  let relation = cells[0]!.trim();
  for (let i = 1; i < cells.length; i += alt ? 3 : 2) {
    const name = cells[i]!.trim();
    const after = cells[i + 1] ?? '';
    const date = DATE_RE.exec(after)!;
    if (name !== '') rows.push(member(relation, name, date.groups!.d ?? ''));
    relation = alt
      ? (cells[i + 2] ?? '').trim()
      : after.slice(date[0].length).trim();
  }
  return rows;
}

function readHousehold(html: string) {
  const head = HOUSEHOLD_HEAD.exec(html);
  if (head === null) return [];
  const body = html.slice(head.index + head[0].length);
  return /<br/i.test(body)
    ? readRows(body)
    : readGluedRows(body, head.groups?.alt !== undefined);
}

export function readRecord(raw: string): RecordView {
  const html = decodeFully(raw);
  return { ...readFields(stripTags(html)), household: readHousehold(html) };
}
