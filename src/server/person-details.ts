// What the Focus panel shows for one person: their facts, the facts of their
// marriages, and their citations, MyHeritage records read into fields.

import type { Database } from 'bun:sqlite';

import type {
  BookKind,
  CitationRow,
  FactRow,
  PersonDetails
} from '@common/types';

import {
  CHURCH_COLLECTIONS,
  citationText,
  collectionOf,
  parseChurchBookRef,
  readRecord
} from './citation-scans/record';
import type { ChurchBookRef } from './citation-scans/record';

export interface CitationDbRow {
  id: number;
  source: string | null;
  page: string | null;
  text: string | null;
}

function yearOf(date: string | null) {
  const m = date === null ? null : /\d{4}/.exec(date);
  return m === null ? Infinity : Number(m[0]);
}

function linkOf(page: string | null) {
  return page !== null && /^https?:/.test(page) ? page : null;
}

function churchBookRefOf(url: string | null, text: string) {
  const collection = url === null ? null : collectionOf(url);
  return url !== null &&
    collection !== null &&
    CHURCH_COLLECTIONS.has(collection)
    ? parseChurchBookRef(url, text)
    : null;
}

const BOOK_NAMES: Record<BookKind, string> = {
  rippi: 'Pää- ja rippikirjat',
  lasten: 'Lastenkirjat',
  kastetut: 'Syntyneiden ja kastettujen luettelot',
  vihityt: 'Vihittyjen luettelot'
};

// Parish · book and years · page, of what the reference gives. Lines break
// only after a dot.
export function describeRef(ref: ChurchBookRef) {
  const { from, to } = ref.years ?? { from: null, to: null };
  const years =
    from === null ? null : from === to ? `${from}` : `${from}–${to}`;
  const book = [ref.kind === null ? null : BOOK_NAMES[ref.kind], years]
    .filter((s) => s !== null)
    .join(' ');
  const parts = [
    ref.parish,
    book,
    ref.page === null ? '' : `p.\u00a0${ref.page}`
  ];
  const named = parts.filter((s) => s !== null && s !== '');
  return named.length === 0 ? null : named.join('\u00a0· ');
}

const MONTH_NAMES = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(
  ' '
);

// "1761-03-03" as "3 Mar 1761", as precise as it's given.
function dayText(date: string) {
  const [year, month, day] = date.split('-');
  const name = month === undefined ? null : MONTH_NAMES[Number(month) - 1];
  return [day === undefined ? null : String(Number(day)), name, year]
    .filter((s) => s !== null && s !== undefined)
    .join(' ');
}

// Where in its Volume the reference points: the page, else the entry's date.
export function entryOf(ref: ChurchBookRef) {
  if (ref.page !== null) return `p.\u00a0${ref.page}`;
  return ref.date === null ? null : dayText(ref.date);
}

// A MyHeritage record is read into its fields; others keep their text.
function contentOf(url: string | null, text: string | null) {
  if (url?.includes('myheritage.') === true) {
    return { record: readRecord(text ?? ''), text: null };
  }
  return {
    record: null,
    text: text === null ? null : citationText(text).trim()
  };
}

// A church book's first year orders it; other sources sort last.
export function toCitation(row: CitationDbRow): CitationRow & { year: number } {
  const url = linkOf(row.page);
  const book = churchBookRefOf(url, row.text ?? '');
  return {
    id: row.id,
    source: row.source,
    reference: book === null ? null : describeRef(book),
    entry: book === null ? null : entryOf(book),
    page: row.page,
    url,
    ...contentOf(url, row.text),
    churchBook: book !== null,
    citedPage: book?.page ?? null,
    year: book?.years?.from ?? Infinity
  };
}

function churchBooksFirst(
  a: { churchBook: boolean; year: number },
  b: { churchBook: boolean; year: number }
) {
  if (a.churchBook !== b.churchBook) return a.churchBook ? -1 : 1;
  return a.year - b.year;
}

export function createPersonDetails(db: Database) {
  const person = db.prepare<{ id: number; sex: string | null }, [number]>(
    'SELECT id, sex FROM persons WHERE id = ?'
  );
  const name = db.prepare<
    { given: string | null; surname: string | null },
    [number]
  >(
    'SELECT given, surname FROM names WHERE person_id = ? ORDER BY sort_order LIMIT 1'
  );
  const personFacts = db.prepare<Omit<FactRow, 'spouse'>, [number]>(
    `SELECT tag, date_text AS date, place, address, value FROM facts
     WHERE scope_type = 'person' AND scope_id = ? ORDER BY sort_order`
  );
  const marriageFacts = db.prepare<
    Omit<FactRow, 'spouse'> & {
      spouseGiven: string | null;
      spouseSurname: string | null;
    },
    [number]
  >(
    `SELECT f.tag, f.date_text AS date, f.place, f.address, f.value,
       n.given AS spouseGiven, n.surname AS spouseSurname
     FROM families fam
     JOIN facts f ON f.scope_type = 'family' AND f.scope_id = fam.id
     LEFT JOIN names n ON n.sort_order = 0 AND n.person_id =
       CASE WHEN fam.husband_id = ?1 THEN fam.wife_id ELSE fam.husband_id END
     WHERE fam.husband_id = ?1 OR fam.wife_id = ?1
     ORDER BY fam.id, f.sort_order`
  );
  const citations = db.prepare<CitationDbRow, [number]>(
    `SELECT c.id, s.title AS source, c.page, c.text FROM citations c
     LEFT JOIN sources s ON s.id = c.source_id
     WHERE c.scope_type = 'person' AND c.scope_id = ? ORDER BY c.sort_order`
  );

  function fullName(given: string | null, surname: string | null) {
    const parts = [given, surname].filter((x) => x !== null && x !== '');
    return parts.length === 0 ? null : parts.join(' ');
  }

  // Facts and church books run in date order; undated ones keep their
  // recorded order after the dated.
  return (id: number): PersonDetails | null => {
    const p = person.get(id);
    if (p === null) return null;
    const n = name.get(id);
    const facts: FactRow[] = [
      ...personFacts.all(id).map((f) => ({ ...f, spouse: null })),
      ...marriageFacts.all(id).map(({ spouseGiven, spouseSurname, ...f }) => ({
        ...f,
        spouse: fullName(spouseGiven, spouseSurname)
      }))
    ].sort((a, b) => yearOf(a.date) - yearOf(b.date));
    const cited = citations
      .all(id)
      .map(toCitation)
      .sort(churchBooksFirst)
      .map(({ year: _, ...c }) => c);
    return {
      id: p.id,
      name: n === null ? null : fullName(n.given, n.surname),
      sex: p.sex,
      facts,
      citations: cited
    };
  };
}
