// A re-import merged with the dataset it replaces (ADR-0013). The new
// export gives the tree; the dataset gives what the app added to it:
// Marks, citations made in the app, and Rejections.
//
// A citation of the export is the dataset's when it has the same person,
// source and page: its original page, or, for a Marked one the export now
// gives as the Astia address, that. Citations alike in all three are
// paired in order, the first with the first.

import type { Database, SQLQueryBindings } from 'bun:sqlite';

import type { ImportReview } from '@common/types';

import { annotationOf, openAnnotations } from './annotations';
import type { Annotation, Annotations } from './annotations';
import { describer, ownerFinder, recordMatcher, rowsOf } from './merge-records';
import type { Owner, Row } from './merge-records';

interface Citation {
  id: number;
  row: Row;
  // Who it's under in its own database, and as a key the other's
  // citations are found by: null when they're not in the new one.
  holder: Owner | null;
  owner: string | null;
  source: string;
  annotation: Annotation;
  appMade: boolean;
  linked: boolean;
  // Its original page, else its page; and the page it cites now.
  original: string;
  page: string | null;
}

function valueOf(row: Row, column: string) {
  return row[column] ?? null;
}

function textOf(row: Row, column: string) {
  const value = valueOf(row, column);
  return value === null ? null : String(value);
}

function citationsOf(db: Database, ownerKey: (o: Owner) => string | null) {
  const ownerOf = ownerFinder(db);
  const sources = new Map(
    rowsOf(db, 'SELECT id, xref FROM sources').map((r) => [r.id, r.xref])
  );
  const rows = db.query<Row, []>('SELECT * FROM citations ORDER BY id').all();
  return rows.map((row): Citation => {
    const holder = ownerOf(String(row.scope_type), Number(row.scope_id));
    const page = textOf(row, 'page');
    const annotation = annotationOf(row);
    return {
      id: Number(row.id),
      row,
      holder,
      owner: holder === null ? null : ownerKey(holder),
      source: String(sources.get(valueOf(row, 'source_id')) ?? ''),
      annotation,
      appMade: annotation.madeInApp,
      linked: annotation.link !== null,
      original: annotation.originalPage ?? page ?? '',
      page
    };
  });
}

// Each of the dataset's citations the export has too, paired with it.
function pairUp(stored: Citation[], fresh: Citation[]) {
  const queues = new Map<string, Citation[]>();
  for (const f of fresh) {
    const key = `${f.owner}|${f.source}|${f.original}`;
    queues.set(key, [...(queues.get(key) ?? []), f]);
  }
  const pairs = new Map<Citation, Citation>();
  function take(s: Citation, page: string) {
    if (s.owner === null) return;
    const f = queues.get(`${s.owner}|${s.source}|${page}`)?.shift();
    if (f !== undefined) pairs.set(s, f);
  }
  for (const s of stored) take(s, s.original);
  for (const s of stored) {
    const page = s.page ?? '';
    if (!pairs.has(s) && page !== s.original) take(s, page);
  }
  return pairs;
}

interface Merge {
  stored: Database;
  fresh: Database;
  annotations: Annotations;
  matchOf: (owner: Owner) => number | null;
}

// Where a citation made in the app goes in the new database: under the
// same person or family, or the same fact of theirs.
function scopeIn(m: Merge, row: Row) {
  const type = String(row.scope_type);
  const id = Number(row.scope_id);
  if (type === 'person' || type === 'family') {
    const to = m.matchOf({ kind: type, id });
    return to === null ? null : { type, id: to };
  }
  if (type !== 'fact') return null;
  const to = factIn(m, id);
  return to === null ? null : { type, id: to };
}

// The new database's fact of the same person or family, kind, date and
// place.
function factIn(m: Merge, id: number) {
  const fact = m.stored
    .query<Row, [number]>('SELECT * FROM facts WHERE id = ?')
    .get(id);
  if (fact === null) return null;
  const kind = String(fact.scope_type) as 'person' | 'family';
  const owner = m.matchOf({ kind, id: Number(fact.scope_id) });
  if (owner === null) return null;
  const same = m.fresh
    .query<{ id: number }, SQLQueryBindings[]>(
      `SELECT id FROM facts WHERE scope_type = ? AND scope_id = ? AND tag = ?
         AND date_text IS ? AND place IS ? ORDER BY sort_order LIMIT 1`
    )
    .get(
      kind,
      owner,
      fact.tag ?? null,
      fact.date_text ?? null,
      fact.place ?? null
    );
  return same?.id ?? null;
}

function copyNotes(m: Merge, from: number, to: number) {
  const notes = rowsOf(
    m.stored,
    `SELECT * FROM notes WHERE owner_type = 'citation' AND owner_id = ${from} ORDER BY sort_order`
  );
  notes.forEach((n, i) => {
    const shared =
      n.shared_note_id === null || n.shared_note_id === undefined
        ? null
        : m.matchOf({ kind: 'shared_note', id: Number(n.shared_note_id) });
    if (valueOf(n, 'text') === null && shared === null) return;
    m.fresh.run(
      "INSERT INTO notes (owner_type, owner_id, text, shared_note_id, sort_order) VALUES ('citation', ?, ?, ?, ?)",
      [to, shared === null ? valueOf(n, 'text') : null, shared, i]
    );
  });
}

// A citation made in the app, attached again where it was; whether it
// could be. Its photos aren't carried, as the app adds none.
function reattach(m: Merge, s: Citation) {
  const scope = scopeIn(m, s.row);
  if (scope === null) return false;
  const sourceId = valueOf(s.row, 'source_id');
  const source =
    sourceId === null
      ? null
      : m.matchOf({ kind: 'source', id: Number(sourceId) });
  if (sourceId !== null && source === null) return false;
  const next = m.fresh
    .query<{ n: number }, [string, number]>(
      'SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM citations WHERE scope_type = ? AND scope_id = ?'
    )
    .get(scope.type, scope.id)!.n;
  const quality = valueOf(s.row, 'quality');
  const id = m.annotations.insert(
    {
      scopeType: scope.type,
      scopeId: scope.id,
      sourceId: source,
      sortOrder: next,
      page: s.page,
      event: textOf(s.row, 'event'),
      role: textOf(s.row, 'role'),
      quality: quality === null ? null : Number(quality),
      dataDate: textOf(s.row, 'data_date'),
      text: textOf(s.row, 'text')
    },
    s.annotation
  );
  copyNotes(m, s.id, id);
  return true;
}

function carryRejections(m: Merge) {
  const rejections = rowsOf(
    m.stored,
    'SELECT reference_url, volume_id, image, file_id FROM rejections ORDER BY id'
  );
  for (const r of rejections) {
    m.fresh.run(
      'INSERT INTO rejections (reference_url, volume_id, image, file_id) VALUES (?, ?, ?, ?)',
      [
        r.reference_url ?? null,
        r.volume_id ?? null,
        r.image ?? null,
        r.file_id ?? null
      ]
    );
  }
  return rejections.length;
}

function emptyReview(unreadable: string | null): ImportReview {
  return {
    people: { added: 0, gone: 0 },
    citations: { added: 0, gone: 0 },
    kept: { marks: 0, citations: 0, duplicates: 0, rejections: 0 },
    lost: [],
    unreadable
  };
}

// What a citation of the dataset the export has too counts as kept.
function keptAs(s: Citation, f: Citation) {
  if (!s.appMade) return s.linked ? 'marks' : null;
  return f.appMade ? 'citations' : 'duplicates';
}

// What a citation of the dataset the export doesn't have, and that
// couldn't be reattached, is listed as lost as, if anything.
function lostAs(s: Citation) {
  if (s.appMade) return `${s.page ?? ''} (made in the app)`;
  return s.linked ? s.original : null;
}

function merge(fresh: Database, stored: Database, byXref: boolean) {
  const { matchOf, people } = recordMatcher(stored, fresh, byXref);
  const m: Merge = {
    stored,
    fresh,
    annotations: openAnnotations(fresh),
    matchOf
  };
  const storedCitations = citationsOf(stored, (o) => {
    const id = matchOf(o);
    return id === null ? null : `${o.kind}:${id}`;
  });
  const freshCitations = citationsOf(fresh, (o) => `${o.kind}:${o.id}`);
  const pairs = pairUp(storedCitations, freshCitations);
  const describe = describer(stored);
  const review = emptyReview(null);
  review.people = people();

  for (const [s, f] of pairs) {
    if (s.linked) m.annotations.carry(f.id, s);
    const kept = keptAs(s, f);
    if (kept !== null) review.kept[kept] += 1;
  }
  for (const s of storedCitations) {
    if (pairs.has(s)) continue;
    if (s.appMade && reattach(m, s)) {
      review.kept.citations += 1;
      continue;
    }
    if (!s.appMade) review.citations.gone += 1;
    const lost = lostAs(s);
    if (lost !== null) review.lost.push(`${describe(s.holder)}: ${lost}`);
  }
  const paired = new Set(pairs.values());
  review.citations.added = freshCitations.filter(
    (f) => !f.appMade && !paired.has(f)
  ).length;
  review.kept.rejections = carryRejections(m);
  return review;
}

// Carries what the app added to the dataset, `stored`, into the new
// import, `fresh`, and says what that changes; `byXref` when the new file
// gave no UIDs. A dataset that can't be read gives nothing (null, or a
// schema this can't follow).
export function mergeImport(
  fresh: Database,
  stored: Database | null,
  byXref: boolean
): ImportReview {
  if (stored === null) return emptyReview('it does not open');
  try {
    return fresh.transaction(() => merge(fresh, stored, byXref))();
  } catch (err) {
    return emptyReview(err instanceof Error ? err.message : String(err));
  }
}
