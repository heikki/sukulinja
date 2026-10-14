// Church-record citations from a MyHeritage GEDCOM export: the SOUR
// citations whose PAGE is a MyHeritage record URL, with parish, book, years
// and page parsed out of the DATA/TEXT transcription.

import { parseGedcom } from '@server/gedcom-parser';
import type { GedNode } from '@server/gedcom-parser';

import { bookKind, decodeEntities, stripParens, yearRange } from './text';
import type { BookKind, Years } from './text';

// MyHeritage collections that cite Finnish church books.
export const RIPPI_COLLECTION = '10509';
const CHURCH_COLLECTIONS = new Set([RIPPI_COLLECTION, '30233', '30200']);

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

// MyHeritage writes raw newlines inside TEXT values, so some physical lines
// carry no level number. Fold them into the previous line with a tab, which
// also acts as a field separator below.
function foldStrayLines(text: string) {
  const out: string[] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (/^\d+ /.test(line) || out.length === 0) {
      out.push(line);
    } else {
      out[out.length - 1] += `\t${line.trim()}`;
    }
  }
  return out.join('\n');
}

// Some citations are HTML, some escaped once more on top of that.
function citationText(raw: string) {
  let text = raw;
  for (let prev = ''; prev !== text;) {
    prev = text;
    text = decodeEntities(text);
  }
  return text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
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
// "Maaseurakunta".
function field(text: string, label: string) {
  const others = LABELS.filter((l) => l !== label).join('|');
  const re = new RegExp(
    `${label}:?[ \\t]*(?<v>[^\\n\\t]*?)(?=(?:${others})|\\n|\\t|$)`,
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

function parseCitation(url: string, raw: string) {
  const collection = /collection-(?<c>\d+)/.exec(url)?.groups?.c ?? '?';
  const text = citationText(raw);
  return collection === RIPPI_COLLECTION
    ? parseRippiCitation(url, text)
    : parseIndexCitation(url, collection, text);
}

export function churchCitations(gedcom: string) {
  const out: Citation[] = [];
  function walk(node: GedNode) {
    if (node.tag === 'SOUR' && node.level > 0) {
      const page = node.children.find((c) => c.tag === 'PAGE')?.value;
      const text = node.children
        .find((c) => c.tag === 'DATA')
        ?.children.find((c) => c.tag === 'TEXT')?.value;
      if (page !== undefined && /^https?:/.test(page)) {
        out.push(parseCitation(page, text ?? ''));
      }
    }
    for (const c of node.children) walk(c);
  }
  for (const r of parseGedcom(foldStrayLines(gedcom))) walk(r);
  return out.filter((c) => CHURCH_COLLECTIONS.has(c.collection));
}
