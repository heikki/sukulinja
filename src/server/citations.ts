// A dataset's Citations: each person's, as the panel shows them, and for the
// Church-book references among them their Links, their Marks, and the
// Volume's citations the Scan viewer lists. Which Citations are church
// books is decided once, by churchBookRefOf, so a row the panel marks as a
// church book always gets a line of Links, and no other row does. A
// Citation citing an Astia Image counts as one too, such as one made in the
// app: it has no reference to resolve, and its Link is the Mark stored on
// it.

import type { Database, SQLQueryBindings } from 'bun:sqlite';

import { BOOK_NAMES } from '@common/books';
import { isoDate } from '@common/dates';
import type { Box, CitationRow, Link, VolumeCitation } from '@common/types';

import {
  annotated,
  annotationColumnsSql,
  originalPageSql
} from './annotations';
import type { Annotation } from './annotations';
import { openAppCitations } from './app-citations';
import { viewerUrl, volumeYears } from './citation-scans/astia';
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
  annotation: Annotation;
}

// A Citation as the panel and the Scan viewer read it: its Church-book
// reference, or for one citing an Astia Image, the Link stored on it.
interface Cited {
  row: CitationDbRow;
  book: ChurchBookRef | null;
  stored: EntryLink | null;
}

type EntryLink = Link & { precision: 'entry' };

// Where an entry is cited in the app, and what it says.
export interface CiteTarget {
  volumeId: string;
  image: number;
  fileId: string;
  box: Box;
  text: string | null;
}

// The Link of a Citation with no Church-book reference: the Mark at the
// entry stored on it. Null for any other.
function storedLink(
  row: CitationDbRow,
  book: ChurchBookRef | null
): EntryLink | null {
  const { link } = row.annotation;
  if (book !== null || link === null) return null;
  const { volumeId, volume, image, fileId, box, by } = link;
  if (image === undefined || fileId === undefined || box === undefined) {
    return null;
  }
  const url = viewerUrl(volumeId, fileId);
  const certainty = by === 'hand' ? 'marked' : 'vision';
  return { volumeId, volume, url, precision: 'entry', image, box, certainty };
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

// Where in its Volume the reference points, or the Image a Citation of
// one cites.
function entryText(book: ChurchBookRef | null, stored: EntryLink | null) {
  if (book !== null) return entryOf(book);
  return stored === null ? null : `Image\u00a0${stored.image}`;
}

function toCitation({ row, book, stored }: Cited) {
  const url = linkOf(row.page);
  const citation: CitationRow = {
    id: row.id,
    source: row.source,
    reference: book === null ? null : describeRef(book),
    entry: entryText(book, stored),
    page: row.page,
    url,
    ...contentOf(url, row.text),
    churchBook: book !== null || stored !== null,
    madeInApp: row.annotation.madeInApp,
    citedPage: book?.page ?? null,
    cited:
      book === null
        ? null
        : { parish: book.parish, kind: book.kind, years: book.years }
  };
  return citation;
}

// Church books by their first year, a Citation of an Astia Image by its
// Volume's, then the others in recorded order.
function isChurchBook(c: Cited) {
  return c.book !== null || c.stored !== null;
}

function yearOf(c: Cited) {
  const years =
    c.stored === null ? c.book?.years : volumeYears(c.stored.volume).years;
  return years?.from ?? Infinity;
}

function churchBooksFirst(a: Cited, b: Cited) {
  if (isChurchBook(a) !== isChurchBook(b)) return isChurchBook(a) ? -1 : 1;
  return yearOf(a) - yearOf(b);
}

// A one-line text, or null for none.
function oneLine(text: string | null) {
  const line = text?.replaceAll(/\s+/g, ' ').trim() ?? '';
  return line === '' ? null : line;
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

type DbRow = Omit<CitationDbRow, 'annotation'>;

export function createCitations(db: Database, scans: Scans) {
  const made = openAppCitations(db);
  // A Mark makes its citation cite the Astia Image; the panel shows the
  // original page, which the reference is read from (ADR-0013).
  const SELECT = `SELECT c.id, c.scope_id AS personId, s.title AS source,
    ${originalPageSql('c')} AS page, c.text, ${annotationColumnsSql('c')}
    FROM citations c LEFT JOIN sources s ON s.id = c.source_id`;
  function query(where: string) {
    const statement = db.prepare<DbRow, SQLQueryBindings[]>(
      `${SELECT} ${where}`
    );
    return {
      all: (...params: SQLQueryBindings[]): CitationDbRow[] =>
        statement.all(...params).map(annotated),
      get: (...params: SQLQueryBindings[]) => {
        const row = statement.get(...params);
        return row === null ? null : annotated(row);
      }
    };
  }
  const ofPersonQuery = query(
    `WHERE c.scope_type = 'person' AND c.scope_id = ? ORDER BY c.sort_order`
  );
  const byId = query('WHERE c.id = ?');
  const everyPerson = query(
    `WHERE c.scope_type = 'person' ORDER BY c.scope_id, c.sort_order`
  );
  const linkedInVolume = query(
    `WHERE c.scope_type = 'person' AND c.link_volume_id = ? ORDER BY c.id`
  );
  const personExists = db.prepare<{ id: number }, [number]>(
    'SELECT id FROM persons WHERE id = ?'
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
    return rows.map((row): Cited => {
      const book = bookOf(row);
      return { row, book, stored: storedLink(row, book) };
    });
  }

  // Kept per Volume until a Mark or a vision save changes the pins.
  const kept = new Map<
    string,
    { stamp: string; rows: Promise<VolumeCitation[] | null> }
  >();

  async function resolveVolume(volumeId: string) {
    const church = onePerRecord(
      cited(everyPerson.all()).filter(
        (c): c is Cited & { book: ChurchBookRef } => c.book !== null
      )
    );
    const links = await scans.volumeLinks(
      volumeId,
      church.map((c) => c.book)
    );
    if (links === null) return null;
    return church.flatMap((c, i): VolumeCitation[] => {
      const link = links[i];
      if (link === null || link === undefined) return [];
      return [{ personId: c.row.personId, citation: toCitation(c), link }];
    });
  }

  // The parishes the dataset's Church-book references cite.
  function parishes() {
    return cited(everyPerson.all()).map((c) => c.book?.parish ?? null);
  }

  // A stored Link, naming its archive as a resolved one does.
  async function withArchive(link: Link): Promise<Link> {
    const archive = await scans.archiveTitleOf(link.volumeId, parishes());
    return archive === null ? link : { ...link, archive };
  }

  // The Citations of Images in the Volume, with no Church-book reference.
  async function storedIn(volumeId: string) {
    const rows = cited(linkedInVolume.all(volumeId)).flatMap((c) =>
      c.stored === null ? [] : [{ c, link: c.stored }]
    );
    return await Promise.all(
      rows.map(async ({ c, link }): Promise<VolumeCitation> => ({
        personId: c.row.personId,
        citation: toCitation(c),
        link: await withArchive(link)
      }))
    );
  }

  async function inVolume(volumeId: string) {
    const stamp = await scans.stamp();
    let hit = kept.get(volumeId);
    if (hit?.stamp !== stamp) {
      const entry = { stamp, rows: resolveVolume(volumeId) };
      kept.set(volumeId, entry);
      // A failure isn't kept: Astia comes back.
      entry.rows.catch(() => kept.delete(volumeId));
      hit = entry;
    }
    const church = await hit.rows;
    const ours = await storedIn(volumeId);
    return church === null && ours.length === 0
      ? null
      : [...(church ?? []), ...ours];
  }

  return {
    // Every one of the person's Citations: church books first, by year,
    // then the others in recorded order.
    ofPerson(personId: number) {
      return cited(ofPersonQuery.all(personId))
        .sort(churchBooksFirst)
        .map(toCitation);
    },

    // A line for each of the person's Church-book references, as each
    // resolves: Astia is slow, so the first needn't wait for the last.
    async *linksOf(personId: number) {
      function lineOf({ row, book, stored }: Cited) {
        if (stored !== null) {
          return withArchive(stored).then((link) => ({
            citationId: row.id,
            links: [link]
          }));
        }
        return book === null
          ? null
          : scans.resolveRef(book).then((resolved) => ({
              citationId: row.id,
              ...resolved
            }));
      }
      const pending = new Map(
        cited(ofPersonQuery.all(personId)).flatMap((c) => {
          const line = lineOf(c);
          return line === null ? [] : [[c.row.id, line] as const];
        })
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
    // and record, then the Citations of its Images; null when the Volume is
    // in none of the dataset's parishes and none cites its Images.
    // Throws when Astia can't be reached.
    inVolume,

    // Makes a Citation of the entry for the person, and gives it as the
    // Scan viewer lists it. Null when there's no such person; rejected
    // where the entry can't be cited, or the person's Citations already
    // link the Image.
    async cite(
      personId: number,
      target: CiteTarget
    ): Promise<VolumeCitation | { rejected: string } | null> {
      if (personExists.get(personId) === null) return null;
      const checked = await scans.imageToCite(target, parishes());
      if ('rejected' in checked) return checked;
      const { volumeId, image } = target;
      const there = await inVolume(volumeId);
      const linked = there?.some(
        (r) =>
          r.personId === personId && 'image' in r.link && r.link.image === image
      );
      if (linked === true) {
        return { rejected: 'Their Citations already link this Image.' };
      }
      const id = made.create({
        personId,
        volumeId,
        volume: checked.volume,
        image,
        fileId: target.fileId,
        box: target.box,
        text: oneLine(target.text)
      });
      const [c] = cited([byId.get(id)!]);
      return {
        personId,
        citation: toCitation(c!),
        link: await withArchive(c!.stored!)
      };
    },

    // Deletes a Citation made in the app; null when there's no such
    // Citation, false for an imported one.
    uncite(citationId: number) {
      return made.remove(citationId);
    }
  };
}

export type Citations = ReturnType<typeof createCitations>;
