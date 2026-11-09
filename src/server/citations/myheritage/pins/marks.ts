// A dataset's Marks and Matches, written into its citations
// (ADR-0013), and its Rejections. A Mark is of a record: every citation of
// the record holds its Link, and a reference with no Record number is
// marked by its URL (record.ts, markKey). What a Mark does to each
// citation is its Annotation's (annotations.ts).
//
// The app and the vision pass write here from two processes; each change
// is one transaction, read and written under SQLite's write lock.

import type { Database } from 'bun:sqlite';

import { openAnnotations, originalPageSql } from '../../annotations';
import type { CitationLink } from '../../annotations';
import { markedRefOf, markKey } from '../record';

// A Match taken back by hand: the reference isn't on that Image, of
// the filming its file id is of.
export interface Rejection {
  volumeId: string;
  image: number;
  fileId?: string;
}

// A citation's Link, with the reference it's in.
interface MarkedCitation {
  url: string;
  recordId: number | null;
  link: CitationLink;
}

export function openMarks(db: Database) {
  const annotations = openAnnotations(db);
  // The dataset's version: it changes with every write to it, from this
  // connection or another.
  function version() {
    const { changes } = db
      .query<{ changes: number }, []>('SELECT total_changes() AS changes')
      .get()!;
    const { data_version: other } = db
      .query<{ data_version: number }, []>('PRAGMA data_version')
      .get()!;
    return `${other}.${changes}`;
  }

  // Each church-book citation's reference, by its original page, read
  // again once the dataset has changed: a Conversion takes a reference out.
  // A Mark or Discard writes only to a reference (`byKey`); a Citation
  // converted from one (made in the app, ADR-0016) is read with them as a
  // pin (`byId`), and never written.
  let index: {
    version: string;
    byKey: Map<string, number[]>;
    // The Citations converted from a reference of the key.
    converted: Map<string, number[]>;
    byId: Map<number, { url: string; recordId: number | null }>;
    urls: Set<string>;
  } | null = null;

  function indexed() {
    const now = version();
    if (index?.version === now) return index;
    const rows = db
      .query<{ id: number; page: string; madeInApp: number }, []>(
        `SELECT id, ${originalPageSql()} AS page, added_in_app AS madeInApp
         FROM citations WHERE ${originalPageSql()} LIKE 'http%' ORDER BY id`
      )
      .all();
    const byKey = new Map<string, number[]>();
    const converted = new Map<string, number[]>();
    const byId = new Map<number, { url: string; recordId: number | null }>();
    for (const row of rows) {
      const ref = markedRefOf(row.page);
      if (ref === null) continue;
      byId.set(row.id, ref);
      const key = markKey(ref);
      const into = row.madeInApp === 1 ? converted : byKey;
      into.set(key, [...(into.get(key) ?? []), row.id]);
    }
    index = {
      version: now,
      byKey,
      converted,
      byId,
      urls: new Set([...byKey.values()].flat().map((id) => byId.get(id)!.url))
    };
    return index;
  }

  function idsOf(key: string) {
    return indexed().byKey.get(key) ?? [];
  }

  const rejectionsQuery = db.prepare<
    { volume_id: string; image: number; file_id: string | null },
    [string]
  >(
    `SELECT volume_id, image, file_id FROM rejections
     WHERE reference_url = ? ORDER BY id`
  );
  const everyRejection = db.prepare<
    {
      reference_url: string;
      volume_id: string;
      image: number;
      file_id: string | null;
    },
    []
  >(
    'SELECT reference_url, volume_id, image, file_id FROM rejections ORDER BY id'
  );
  const dropRejection = db.prepare(
    'DELETE FROM rejections WHERE reference_url = ? AND volume_id = ? AND image = ?'
  );
  const addRejection = db.prepare(
    `INSERT INTO rejections (reference_url, volume_id, image, file_id)
     VALUES (?, ?, ?, ?)`
  );

  // Changes made here; another process's show in SQLite's data_version.
  let writes = 0;

  function linkOf(key: string) {
    return annotations.firstLink(idsOf(key));
  }

  function write(key: string, link: CitationLink | null) {
    annotations.swap(idsOf(key), link);
    writes += 1;
  }

  function rejectionsOf(url: string): Rejection[] {
    return rejectionsQuery.all(url).map((r) => ({
      volumeId: r.volume_id,
      image: r.image,
      ...(r.file_id === null ? {} : { fileId: r.file_id })
    }));
  }

  return {
    // The Link the citations of the key hold, if any.
    linkOf,

    // Writes the Link into every citation of the key, or clears it.
    write,

    // How many citations are of the key.
    countOf(key: string) {
      return idsOf(key).length;
    },

    // Whether a citation is of the key.
    cites(key: string) {
      return indexed().byKey.has(key);
    },

    // Whether a citation's reference is at the URL.
    citesUrl(url: string) {
      return indexed().urls.has(url);
    },

    // Runs `change` as one transaction, under the write lock.
    change<T>(change: () => T) {
      return db.transaction(change).immediate();
    },

    // Every citation with a Link, in stored order.
    linked(): MarkedCitation[] {
      const { byId } = indexed();
      return annotations.linked().flatMap(({ id, link }) => {
        const ref = byId.get(id);
        return ref === undefined ? [] : [{ ...ref, link }];
      });
    },

    rejectionsOf,

    // A Match taken back at the Image, replacing one there before.
    reject(url: string, rejection: Rejection) {
      dropRejection.run(url, rejection.volumeId, rejection.image);
      addRejection.run(
        url,
        rejection.volumeId,
        rejection.image,
        rejection.fileId ?? null
      );
      writes += 1;
    },

    // Every Rejection, by the reference's URL.
    rejections() {
      const out: Record<string, Rejection[]> = {};
      for (const r of everyRejection.all()) {
        out[r.reference_url] = [
          ...(out[r.reference_url] ?? []),
          {
            volumeId: r.volume_id,
            image: r.image,
            ...(r.file_id === null ? {} : { fileId: r.file_id })
          }
        ];
      }
      return out;
    },

    // Changes whenever the Marks do, from this process or another.
    stamp() {
      return `${version()}.${writes}`;
    },

    // The references of a record or URL a converted Citation cites, by the
    // Link that Citation holds: what a re-import converts too.
    kinOfConverted() {
      const { byKey, converted } = indexed();
      return [...converted].flatMap(([key, ids]) => {
        const refs = byKey.get(key) ?? [];
        const link = annotations.firstLink(ids);
        return refs.length === 0 || link === null ? [] : [{ link, ids: refs }];
      });
    },

    // The citations a Mark of the key is written into.
    idsOf
  };
}

export type Marks = ReturnType<typeof openMarks>;

interface RejectionRow {
  reference_url: string;
  volume_id: string;
  image: number;
  file_id: string | null;
}

// The dataset's Rejections; none from a database too old to have them.
function storedRejections(stored: Database) {
  try {
    return stored
      .query<RejectionRow, []>(
        'SELECT reference_url, volume_id, image, file_id FROM rejections ORDER BY id'
      )
      .all();
  } catch {
    return [];
  }
}

// A re-import's Rejections: the dataset's, carried into its new database as
// they are, as each is of a reference's URL, which the export gives again.
// How many.
export function carryRejections(stored: Database, fresh: Database) {
  const rows = storedRejections(stored);
  const insert = fresh.prepare(
    'INSERT INTO rejections (reference_url, volume_id, image, file_id) VALUES (?, ?, ?, ?)'
  );
  for (const r of rows) {
    insert.run(r.reference_url, r.volume_id, r.image, r.file_id);
  }
  return rows.length;
}
