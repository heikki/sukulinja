// MyHeritage record citations: the transcription MyHeritage keeps in a
// citation's DATA/TEXT, read back into its fields for display, and into the
// parish, book, years and page it cites for mapping to a scan.

import type { HouseholdMember, RecordField, RecordView } from '@common/types';

import { bookKind, decodeEntities, stripParens, yearRange } from './text';
import type { BookKind, Years } from './text';

// MyHeritage collections that cite Finnish church books.
export const RIPPI_COLLECTION = '10509';
export const CHURCH_COLLECTIONS = new Set([RIPPI_COLLECTION, '30233', '30200']);

export interface Citation {
  url: string;
  collection: string;
  parish: string | null;
  kind: BookKind | null;
  years: Years | null;
  page: number | null;
  // Village and farm names, used to pick among volumes split by village.
  places: string[];
}

export function collectionOf(url: string) {
  return /collection-(?<c>\d+)/.exec(url)?.groups?.c ?? null;
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

function parseRippiCitation(url: string, text: string): Citation {
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
    ]
  };
}

// FamilySearch-derived indexes: "Ristiäiset: 29. Marras 1829 - Mikkeli, …"
function parseIndexCitation(
  url: string,
  collection: string,
  text: string
): Citation {
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
    places: []
  };
}

function indexKind(event: string): BookKind {
  return event === 'Avioliitto' ? 'vihityt' : 'kastetut';
}

export function parseCitation(url: string, raw: string) {
  const collection = collectionOf(url) ?? '?';
  const text = citationText(raw);
  return collection === RIPPI_COLLECTION
    ? parseRippiCitation(url, text)
    : parseIndexCitation(url, collection, text);
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
