// A dataset's Church-book references, read from the citations in its
// database: those whose page is a MyHeritage record in a church-book
// collection, one per record URL.

import { Database } from 'bun:sqlite';

import type { Person } from '@server/citation-scans/reader';
import {
  churchBookRefOf,
  RIPPI_COLLECTION
} from '@server/citation-scans/record';
import type { ChurchBookRef } from '@server/citation-scans/record';

export function datasetRefs(dbPath: string) {
  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .query<{ page: string; text: string | null }, []>(
      `SELECT COALESCE(imported_page, page) AS page, text FROM citations
       WHERE COALESCE(imported_page, page) LIKE '%myheritage%collection-%'
       ORDER BY id`
    )
    .all();
  db.close();
  const refs = new Map<string, ChurchBookRef>();
  for (const row of rows) {
    const ref = churchBookRefOf(row.page, row.text);
    if (ref !== null && !refs.has(ref.url)) {
      refs.set(ref.url, ref);
    }
  }
  return [...refs.values()];
}

// The principal of each rippikirja record, by Record number, as the pass
// asks about them.
export function principals(refs: ChurchBookRef[]) {
  const people = new Map<number, Person>();
  for (const ref of refs) {
    const name = ref.collection === RIPPI_COLLECTION ? ref.name : null;
    if (ref.recordId !== null && name !== null) {
      const village = ref.places[0] ?? null;
      people.set(ref.recordId, { name, village, household: ref.household });
    }
  }
  return people;
}
