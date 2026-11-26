// A dataset's Marks and Matches, written into its citations
// (ADR-0013). A Mark is of a record: every citation of
// the record holds its Link, and a reference with no Record number is
// marked by its URL (record.ts, markKey). What a Mark does to each
// citation is its Annotation's (annotations.ts).
//
// More than one process may write here at once; each change is one
// transaction, read and written under SQLite's write lock.

import type { Database } from 'bun:sqlite';

import { openAnnotations } from '../../annotations';
import type { CitationLink } from '../../annotations';
import { datasetVersion } from '../../db-version';
import { markedRefOf, markKey } from '../record';

// A citation's Link, with the reference it's in.
interface MarkedCitation {
  url: string;
  recordId: number | null;
  link: CitationLink;
}

export function openMarks(db: Database) {
  const annotations = openAnnotations(db);
  // Each church-book reference, by its page, read again once the dataset
  // has changed: a Conversion takes a reference out (ADR-0016), and its
  // Citation is no pin (ADR-0039).
  let index: {
    version: string;
    byKey: Map<string, number[]>;
    byId: Map<number, { url: string; recordId: number | null }>;
    urls: Set<string>;
  } | null = null;

  function indexed() {
    const now = datasetVersion(db);
    if (index?.version === now) return index;
    const rows = db
      .query<{ id: number; page: string | null; role: string | null }, []>(
        `SELECT id, page, role FROM citations
         WHERE entry_id IS NULL AND (page LIKE 'http%' OR role IS NOT NULL)
         ORDER BY id`
      )
      .all();
    const byKey = new Map<string, number[]>();
    const byId = new Map<number, { url: string; recordId: number | null }>();
    for (const row of rows) {
      const ref = markedRefOf(row.page, row.role);
      if (ref === null) continue;
      byId.set(row.id, ref);
      const key = markKey(ref);
      byKey.set(key, [...(byKey.get(key) ?? []), row.id]);
    }
    index = {
      version: now,
      byKey,
      byId,
      urls: new Set([...byKey.values()].flat().map((id) => byId.get(id)!.url))
    };
    return index;
  }

  function idsOf(key: string) {
    return indexed().byKey.get(key) ?? [];
  }

  // Changes made here; another process's show in SQLite's data_version.
  let writes = 0;

  function linkOf(key: string) {
    return annotations.firstLink(idsOf(key));
  }

  function write(key: string, link: CitationLink | null) {
    annotations.swap(idsOf(key), link);
    writes += 1;
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

    // Changes whenever the Marks do, from this process or another.
    stamp() {
      return `${datasetVersion(db)}.${writes}`;
    },

    // The citations a Mark of the key is written into.
    idsOf
  };
}

export type Marks = ReturnType<typeof openMarks>;
