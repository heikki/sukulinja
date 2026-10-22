// A dataset's Citations: each person's, as the panel shows them, and for the
// Church-book references among them their Links, their Marks, and the
// Volume's citations the Scan viewer lists. Which Citations are church
// books is decided once, by churchBookRefOf, so a row the panel marks as a
// church book always gets a line of Links, and no other row does.

import type { Database } from 'bun:sqlite';

import { BOOK_NAMES } from '@common/books';
import { isoDate } from '@common/dates';
import type { CitationRow, VolumeCitation } from '@common/types';

import { originalPageSql } from './annotations';
import type { BoxAt, MarkTarget } from './citation-scans/pins';
import {
  churchBookRefOf,
  citationText,
  readRecord
} from './citation-scans/record';
import type { ChurchBookRef } from './citation-scans/record';
import type { Scans } from './citation-scans/scans';

interface CitationDbRow {
  id: number;
  personId: number;
  source: string | null;
  page: string | null;
  text: string | null;
}

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

// Where in its Volume the reference points: the page, else the entry's date.
export function entryOf(ref: ChurchBookRef) {
  if (ref.page !== null) return `p.\u00a0${ref.page}`;
  return ref.date === null ? null : isoDate(ref.date);
}

function linkOf(page: string | null) {
  return page !== null && /^https?:/.test(page) ? page : null;
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

function toCitation(row: CitationDbRow, book: ChurchBookRef | null) {
  const url = linkOf(row.page);
  const citation: CitationRow = {
    id: row.id,
    source: row.source,
    reference: book === null ? null : describeRef(book),
    entry: book === null ? null : entryOf(book),
    page: row.page,
    url,
    ...contentOf(url, row.text),
    churchBook: book !== null,
    citedPage: book?.page ?? null,
    cited:
      book === null
        ? null
        : { parish: book.parish, kind: book.kind, years: book.years }
  };
  return citation;
}

// Church books by their first year, then the others in recorded order.
function yearOf(book: ChurchBookRef | null) {
  return book === null ? Infinity : (book.years?.from ?? Infinity);
}

function churchBooksFirst(
  a: { book: ChurchBookRef | null },
  b: { book: ChurchBookRef | null }
) {
  if ((a.book === null) !== (b.book === null)) return a.book === null ? 1 : -1;
  return yearOf(a.book) - yearOf(b.book);
}

// One row per person and record: a person citing the same record twice is
// listed once.
function onePerRecord<T extends { row: CitationDbRow }>(cited: T[]) {
  const seen = new Set<string>();
  return cited.filter(({ row }) => {
    const key = `${row.personId} ${row.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createCitations(db: Database, scans: Scans) {
  // A Mark makes its citation cite the Astia Image; the panel shows the
  // original page, which the reference is read from (ADR-0013).
  const SELECT = `SELECT c.id, c.scope_id AS personId, s.title AS source,
    ${originalPageSql('c')} AS page, c.text
    FROM citations c LEFT JOIN sources s ON s.id = c.source_id`;
  const ofPersonQuery = db.prepare<CitationDbRow, [number]>(
    `${SELECT} WHERE c.scope_type = 'person' AND c.scope_id = ?
     ORDER BY c.sort_order`
  );
  const byId = db.prepare<CitationDbRow, [number]>(`${SELECT} WHERE c.id = ?`);
  const everyPerson = db.prepare<CitationDbRow, []>(
    `${SELECT} WHERE c.scope_type = 'person'
     ORDER BY c.scope_id, c.sort_order`
  );

  // The dataset doesn't change under a module: a re-import makes a new one.
  const books = new Map<number, ChurchBookRef | null>();
  function bookOf(row: CitationDbRow) {
    let book = books.get(row.id);
    if (book === undefined) {
      book = churchBookRefOf(row.page, row.text);
      books.set(row.id, book);
    }
    return book;
  }

  function churchBookOf(citationId: number) {
    const row = byId.get(citationId);
    return row === null ? null : bookOf(row);
  }

  function cited(rows: CitationDbRow[]) {
    return rows.map((row) => ({ row, book: bookOf(row) }));
  }

  // Kept per Volume until a Mark or a vision save changes the pins.
  const kept = new Map<
    string,
    { stamp: string; rows: Promise<VolumeCitation[] | null> }
  >();

  async function resolveVolume(volumeId: string) {
    const church = onePerRecord(
      cited(everyPerson.all()).filter(
        (c): c is { row: CitationDbRow; book: ChurchBookRef } => c.book !== null
      )
    );
    const links = await scans.volumeLinks(
      volumeId,
      church.map((c) => c.book)
    );
    if (links === null) return null;
    return church.flatMap(({ row, book }, i): VolumeCitation[] => {
      const link = links[i];
      if (link === null || link === undefined) return [];
      const citation = toCitation(row, book);
      return [{ personId: row.personId, citation, link }];
    });
  }

  return {
    // Every one of the person's Citations: church books first, by year,
    // then the others in recorded order.
    ofPerson(personId: number) {
      return cited(ofPersonQuery.all(personId))
        .sort(churchBooksFirst)
        .map(({ row, book }) => toCitation(row, book));
    },

    // A line for each of the person's Church-book references, as each
    // resolves: Astia is slow, so the first needn't wait for the last.
    async *linksOf(personId: number) {
      const pending = new Map(
        cited(ofPersonQuery.all(personId)).flatMap(({ row, book }) =>
          book === null
            ? []
            : [
                [
                  row.id,
                  scans.resolveRef(book).then((resolved) => ({
                    citationId: row.id,
                    ...resolved
                  }))
                ] as const
              ]
        )
      );
      while (pending.size > 0) {
        // eslint-disable-next-line no-await-in-loop -- in the order they resolve
        const line = await Promise.race(pending.values());
        pending.delete(line.citationId);
        yield line;
      }
    },

    // Saves a Mark. Null when there's no such Citation, or it isn't a
    // Church-book reference.
    async mark(citationId: number, target: MarkTarget) {
      const book = churchBookOf(citationId);
      return book === null ? null : await scans.markRef(book, target);
    },

    // Takes back the reference's Box; null as for `mark`.
    async discard(citationId: number, at: BoxAt) {
      const book = churchBookOf(citationId);
      return book === null ? null : await scans.discardRef(book, at);
    },

    // The Volumes the reference can be put in; null as for `mark`.
    async volumeChoices(citationId: number) {
      const book = churchBookOf(citationId);
      return book === null ? null : await scans.volumeChoices(book);
    },

    // The Church-book references resolving into the Volume, one per person
    // and record; null when the Volume is in none of the dataset's parishes.
    // Throws when Astia can't be reached.
    async inVolume(volumeId: string) {
      const stamp = await scans.stamp();
      const hit = kept.get(volumeId);
      if (hit?.stamp === stamp) return await hit.rows;
      const entry = { stamp, rows: resolveVolume(volumeId) };
      kept.set(volumeId, entry);
      // A failure isn't kept: Astia comes back.
      entry.rows.catch(() => kept.delete(volumeId));
      return await entry.rows;
    }
  };
}

export type Citations = ReturnType<typeof createCitations>;
