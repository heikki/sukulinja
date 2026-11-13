// A dataset's Citations: each person's, as the panel shows them, and for the
// Church-book references among them their Links, their Marks, and the
// Volume's citations the Scan viewer lists. Which Citations are references
// is the References port's to say, once per row, so a row the panel marks
// as a church book always gets a line of Links, and no other row does. A
// Citation citing an Astia Image counts as one too, such as one made in the
// app: it has no reference to resolve, and its Link is the Mark stored on
// it.

import type { Database, SQLQueryBindings } from 'bun:sqlite';

import { bookLabel } from '@/common/books';
import { isoDate } from '@/common/dates';
import type {
  CitationRow,
  Link,
  LinkResolution,
  NewChange,
  VolumeCitation,
  VolumeContents
} from '@/common/types';

import {
  annotated,
  annotationColumnsSql,
  originalPageSql
} from './annotations';
import type { Annotation } from './annotations';
import { openAppCitations } from './app-citations';
import { viewerUrl, volumeYears } from './astia/astia';
import { citedArchives } from './cited-archives';
import { CITATIONS_READ } from './entries';
import { createEntryCitations } from './entry-citations';
import type { EntryTarget } from './entry-citations';
import type { Images } from './images';
import type {
  BookRef,
  BoxAt,
  MarkDone,
  MarkTarget,
  References
} from './references';
import { createSupport } from './support';
import { citationText } from './text';

interface CitationDbRow {
  id: number;
  personId: number;
  source: string | null;
  page: string | null;
  text: string | null;
  // The Fact ids it supports, comma separated; null for none.
  supports: string | null;
  // The Entry it cites (ADR-0026), or null.
  entryId: number | null;
  entryRole: string | null;
  annotation: Annotation;
}

function idsOf(list: string | null) {
  if (list === null) return [];
  return list
    .split(',')
    .map(Number)
    .sort((a, b) => a - b);
}

// A Citation as the panel and the Scan viewer read it: its Church-book
// reference, or for one citing an Astia Image, the Link stored on it.
interface Cited<R extends BookRef = BookRef> {
  row: CitationDbRow;
  book: R | null;
  stored: EntryLink | null;
}

type EntryLink = Link & { precision: 'entry' };

export type { EntryTarget, InEntry } from './entry-citations';

// An entry cited for one person, in their Role.
export interface CiteTarget extends EntryTarget {
  role: string | null;
}

// The Link of a Citation with no Church-book reference: the Mark at the
// entry stored on it. Null for any other.
function storedLink(
  row: CitationDbRow,
  book: BookRef | null
): EntryLink | null {
  const { link } = row.annotation;
  if (book !== null || link === null) return null;
  const { volumeId, volume, image, fileId, box, by } = link;
  if (image === undefined || fileId === undefined || box === undefined) {
    return null;
  }
  const url = viewerUrl(volumeId, fileId);
  const certainty = by === 'hand' ? 'marked' : 'match';
  return { volumeId, volume, url, precision: 'entry', image, box, certainty };
}

// Parish · book and years · page, of what the reference gives. Lines break
// only after a dot.
export function describeRef(ref: BookRef) {
  const named = [ref.parish, bookLabel(ref, ref.page)].filter(
    (s) => s !== null
  );
  return named.length === 0 ? null : named.join('\u00a0· ');
}

// Where in its Volume the reference points: the page, else the entry's date.
export function entryOf(ref: BookRef) {
  if (ref.page !== null) return `p.\u00a0${ref.page}`;
  return ref.date === null ? null : isoDate(ref.date);
}

// Where in its Volume the reference points, or the Image a Citation of
// one cites.
function entryText(book: BookRef | null, stored: EntryLink | null) {
  if (book !== null) return entryOf(book);
  return stored === null ? null : `Image\u00a0${stored.image}`;
}

// A Citation as the panel and the Scan viewer show it: a record the port
// reads into its fields, or its text.
function citationOf<R extends BookRef>(references: References<R>) {
  return function toCitation({ row, book, stored }: Cited<R>) {
    const record = references.recordOf(row);
    const citation: CitationRow = {
      id: row.id,
      source: row.source,
      reference: book === null ? null : describeRef(book),
      entry: entryText(book, stored),
      page: row.page,
      record,
      text:
        record !== null || row.text === null
          ? null
          : citationText(row.text).trim(),
      churchBook: book !== null || stored !== null,
      madeInApp: row.annotation.madeInApp,
      // Those citing one Entry share its Box.
      markKey:
        row.entryId === null
          ? book === null
            ? `citation ${row.id}`
            : references.markKey(book)
          : `entry ${row.entryId}`,
      citedPage: book?.page ?? null,
      cited:
        book === null
          ? null
          : { parish: book.parish, kind: book.kind, years: book.years },
      supports: idsOf(row.supports),
      entryId: row.entryId,
      role: row.entryRole
    };
    return citation;
  };
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

// A dataset's Citations, with the Images they can cite and the MyHeritage
// references they make.
// What the dataset's Citations read, and `changed`, told of each change
// they make to the dataset.
interface CitationDeps<R extends BookRef> {
  images: Images;
  references: References<R>;
  changed?: (change: NewChange) => void;
}

// What a Citation cites, in words: its source and entry, for one the app
// made, or its reference.
function citedText(c: CitationRow) {
  const entry = c.reference ?? c.entry;
  if (c.source === null) return entry;
  return entry === null ? c.source : `${c.source}, ${entry}`;
}

export function createCitations<R extends BookRef>(
  db: Database,
  { images, references, changed = () => undefined }: CitationDeps<R>
) {
  const made = openAppCitations(db);
  const toCitation = citationOf(references);
  // A Mark makes its citation cite the Astia Image; the panel shows the
  // original page, which the reference is read from (ADR-0013).
  const SELECT = `SELECT c.id, c.scope_id AS personId, s.title AS source,
    ${originalPageSql('c')} AS page, c.text, c.entry_id AS entryId,
    CASE WHEN c.entry_id IS NULL THEN NULL ELSE c.role END AS entryRole,
    (SELECT group_concat(fact_id) FROM fact_citations
      WHERE citation_id = c.id) AS supports,
    ${annotationColumnsSql('c')}
    FROM ${CITATIONS_READ} c LEFT JOIN sources s ON s.id = c.source_id`;
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
  const personCitation = query(`WHERE c.scope_type = 'person' AND c.id = ?`);
  const everyPerson = query(
    `WHERE c.scope_type = 'person' ORDER BY c.scope_id, c.sort_order`
  );
  const linkedInVolume = query(
    `WHERE c.scope_type = 'person' AND c.link_volume_id = ? ORDER BY c.id`
  );
  const personExists = db.prepare<{ id: number }, [number]>(
    'SELECT id FROM persons WHERE id = ?'
  );
  const support = createSupport(db, changed);

  // The Volume a citation is in doesn't change under a module.
  const books = new Map<number, R | null>();
  function bookOf(row: CitationDbRow) {
    let book = books.get(row.id);
    if (book === undefined) {
      book = references.refOf(row);
      books.set(row.id, book);
    }
    return book;
  }

  // Makes the citations a Mark of the reference put at the entry by hand
  // Citations of their Image (ADR-0016), which are then no references.
  // The Volume each converted is in, by its label. Each cites its Volume's
  // source, named by its archive (ADR-0019).
  async function convert(book: R) {
    const rows = references.converts(book);
    if (rows.length === 0) return [];
    const volumes = rows.map(
      ({ id }) => byId.get(id)?.annotation.link?.volume ?? ''
    );
    await made.convert(rows, volumeArchive);
    for (const { id } of rows) books.delete(id);
    return volumes;
  }

  function churchBookOf(citationId: number) {
    const row = byId.get(citationId);
    return row === null ? null : bookOf(row);
  }

  function cited(rows: CitationDbRow[]) {
    return rows.map((row): Cited<R> => {
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
        (c): c is Cited<R> & { book: R } => c.book !== null
      )
    );
    const links = await references.volumeLinks(
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

  const { archives, churchBookArchives, citable, volumeArchive, withArchive } =
    citedArchives(images, () => cited(everyPerson.all()));

  // A Citation of an Image moved to the entry `target` gives, in the
  // Volume it's in; its Link there, and what that did.
  async function moveEntry(
    citationId: number,
    target: MarkTarget
  ): Promise<
    { resolution: LinkResolution; done: MarkDone } | { rejected: string }
  > {
    const { volumeId, image, box } = target;
    const stored = linkedInVolume
      .all(volumeId)
      .some((r) => r.id === citationId);
    if (!stored) {
      return { rejected: 'A Citation of an Image stays in its Volume.' };
    }
    if (image === undefined || box === undefined || box === null) {
      return { rejected: 'A Citation of an Image needs its entry box.' };
    }
    const checked = await images.imageToCite(
      { volumeId, image, box },
      await archives()
    );
    if ('rejected' in checked) return checked;
    made.move(citationId, { volumeId, image, box, ...checked });
    const [c] = cited([byId.get(citationId)!]);
    const links = [await withArchive(c!.stored!)];
    const done: MarkDone = {
      at: 'entry',
      volume: checked.volume,
      confirmed: false,
      citations: 1,
      pagePin: null
    };
    return { resolution: { links }, done };
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
    const stamp = await references.stamp();
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

  // How many of the dataset's Citations link into each of the parish
  // archive's Volumes, by its id: a Split reference counts in each of its
  // candidates, and a Citation of an Image in its Volume.
  async function countInArchive(archiveId: string) {
    const all = cited(everyPerson.all());
    const church = all.filter(
      (c): c is Cited<R> & { book: R } => c.book !== null
    );
    const linked = await references.archiveLinks(
      archiveId,
      church.map((c) => c.book)
    );
    const stored = all.flatMap((c) =>
      c.book === null && c.stored !== null ? [[c.stored.volumeId]] : []
    );
    const counts: Record<string, number> = {};
    for (const volumes of [...linked, ...stored]) {
      for (const id of new Set(volumes)) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }

  // One of a person's Citations, as the panel shows it, with whose it is;
  // null when there's no such Citation of a person.
  function ofId(citationId: number) {
    const row = personCitation.get(citationId);
    if (row === null) return null;
    const [c] = cited([row]);
    return { personId: row.personId, citation: toCitation(c!) };
  }

  // The Citation as the Scan viewer lists it.
  async function listed(id: number): Promise<VolumeCitation> {
    const row = byId.get(id)!;
    const [c] = cited([row]);
    return {
      personId: row.personId,
      citation: toCitation(c!),
      link: await withArchive(c!.stored!)
    };
  }

  function uncite(citationId: number) {
    const was = ofId(citationId);
    if (!made.remove(citationId)) return null;
    if (was !== null) {
      changed({
        on: { personId: was.personId },
        what: { kind: 'uncite', cited: citedText(was.citation) }
      });
    }
    return was;
  }

  const entries = createEntryCitations(db, {
    made,
    images,
    citable,
    inVolume,
    volumeArchive,
    personExists: (id) => personExists.get(id) !== null,
    support,
    changed,
    listed
  });

  return {
    // Every one of the person's Citations: church books first, by year,
    // then the others in recorded order.
    ofPerson(personId: number) {
      return cited(ofPersonQuery.all(personId))
        .sort(churchBooksFirst)
        .map(toCitation);
    },

    // One of a person's Citations, as the panel shows it, with whose it
    // is; null when there's no such Citation of a person.
    ofId,

    // Makes the person's Citation support one of their Facts or their
    // marriages', or no longer, as a Change on it: the Citation as it then
    // is. Null when it isn't a person's Citation, or the Fact theirs.
    support(citationId: number, factId: number, on: boolean) {
      if (!support.set(citationId, factId, on)) return null;
      return ofId(citationId)?.citation ?? null;
    },

    // A line for each of the person's Church-book references, as each
    // resolves: Astia is slow, so the first needn't wait for the last.
    async *linksOf(personId: number) {
      function lineOf({ row, book, stored }: Cited<R>) {
        if (stored !== null) {
          return withArchive(stored).then((link) => ({
            citationId: row.id,
            links: [link]
          }));
        }
        return book === null
          ? null
          : references.resolve(book).then((resolved) => ({
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

    // Saves a Mark: the reference's Links as they now resolve, and what it
    // did. Null when there's no such Citation, or it isn't a Church-book
    // reference.
    // A Citation of an Image takes a Mark at another entry in its Volume.
    async mark(citationId: number, target: MarkTarget) {
      const row = byId.get(citationId);
      if (row === null) return null;
      const [c] = cited([row]);
      const moved = c!.book === null;
      if (moved && c!.stored === null) return null;
      const result = moved
        ? await moveEntry(citationId, target)
        : await references.mark(c!.book!, target);
      if ('rejected' in result) return result;
      if (!moved) await convert(c!.book!);
      const { at, volume, confirmed, citations, pagePin } = result.done;
      const image = target.image ?? null;
      changed({
        on: { citationId },
        what: {
          kind: 'mark',
          ...{ at, volume, image, confirmed, moved, citations, pagePin }
        }
      });
      return result;
    },

    // Takes back the reference's Box; null as for `mark`.
    async discard(citationId: number, at: BoxAt) {
      const book = churchBookOf(citationId);
      if (book === null) return null;
      const result = await references.discard(book, at);
      if ('rejected' in result) return result;
      const { volume, rejection } = result.done;
      changed({
        on: { citationId },
        what: { kind: 'discard', volume, image: at.image, rejection }
      });
      return result;
    },

    // The Volumes the reference can be put in; null as for `mark`.
    async volumeChoices(citationId: number) {
      const book = churchBookOf(citationId);
      return book === null ? null : await references.volumeChoices(book);
    },

    // The Church-book references resolving into the Volume, one per person
    // and record, then the Citations of its Images; null when the Volume is
    // in none of the dataset's parishes and none cites its Images.
    // Throws when Astia can't be reached.
    inVolume,

    // How many Citations link into each of the parish archive's Volumes.
    // Throws when Astia can't be reached.
    countInArchive,

    // The archives the dataset's church books are in, most cited first.
    churchBookArchives,

    // The title of the dataset's archive holding the Volume, or null.
    volumeArchive,

    // Asks Astia, in the background, for the archives the references are
    // in (Images.warmUp).
    async warmUp() {
      await images.warmUp(await archives().catch(() => []));
    },

    // What Astia says of the Volume: its Images and its archive, asked
    // together. Throws when Astia can't be reached.
    async contentsOf(volumeId: string): Promise<VolumeContents> {
      const [urls, archive] = await Promise.all([
        images.urlsOf(volumeId),
        volumeArchive(volumeId)
      ]);
      return { images: urls, archive };
    },

    // Makes an Entry with its people, or adds someone to one (ADR-0026).
    citeEntry: entries.citeEntry,
    addToEntry: entries.addToEntry,

    // Makes a Citation of a new entry for the person (`citeEntry` with one),
    // and gives it as the Scan viewer lists it.
    async cite(
      personId: number,
      target: CiteTarget
    ): Promise<VolumeCitation | { rejected: string } | null> {
      const made = await entries.citeEntry(target, [
        { personId, role: target.role }
      ]);
      return made === null || 'rejected' in made ? made : made[0]!;
    },

    // Titles the Volume sources made before with their archive (ADR-0019).
    retitleVolumeSources: () => made.retitleVolumeSources(volumeArchive),

    // Deletes a Citation, and gives it as it was, with whose it was; null
    // when there's no such Citation.
    uncite,

    // Deletes an Entry with all its Citations, each as `uncite` does
    // (ADR-0026): how many went, null when there's no such Entry.
    deleteEntry(entryId: number) {
      const ids = made.entryCitations(entryId);
      if (ids.length === 0) return null;
      for (const id of ids) uncite(id);
      return ids.length;
    },

    // Puts what an Entry says (ADR-0026); null when there's no such Entry.
    transcribe: entries.transcribe
  };
}

export type Citations = ReturnType<typeof createCitations>;
