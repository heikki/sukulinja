// A re-import merged with the dataset it replaces (ADR-0013). The new
// export gives the tree; the dataset gives what the app added to it:
// Marks, citations made in the app, Rejections, Reminders and the Changes.
//
// A citation of the export is the dataset's when it has the same person,
// source and page: its original page, or, for a Marked one the export now
// gives as the Astia address, that. Citations alike in all three are
// paired in order, the first with the first.
//
// A citation made in the app whose source the export lacks brings the
// source with it, as a re-import from the source program without an upload
// in between wouldn't have it. A source only imported citations cite is
// never brought back: one removed there stays gone.

import type { Database, SQLQueryBindings } from 'bun:sqlite';

import type { ImportReview } from '@/common/types';

import {
  annotationOf,
  carryRejections,
  convertKin,
  openAnnotations
} from '../citations';
import type { Annotation, Annotations } from '../citations';
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

// The export's citations a converted Citation of the dataset replaces
// (ADR-0016): one made in the app with an original page stands for the
// imported citation of the same person at that page, under another source
// (the one under its own source pairs, as any Citation made in the app
// does). Alike ones are taken in order, the first with the first.
function replacements(stored: Citation[], fresh: Citation[]) {
  const queues = new Map<string, Citation[]>();
  for (const f of fresh) {
    if (f.appMade) continue;
    const key = `${f.owner}|${f.original}`;
    queues.set(key, [...(queues.get(key) ?? []), f]);
  }
  const replaced = new Map<Citation, Citation>();
  for (const s of stored) {
    const page = s.annotation.originalPage;
    if (!s.appMade || page === null || s.owner === null) continue;
    const queue = queues.get(`${s.owner}|${page}`) ?? [];
    const i = queue.findIndex((f) => f.source !== s.source);
    if (i >= 0) replaced.set(s, queue.splice(i, 1)[0]!);
  }
  return replaced;
}

// Deletes a citation of the new database, with its notes and media links.
function dropCitation(db: Database, id: number) {
  db.run(
    `DELETE FROM notes WHERE owner_type = 'media_link' AND owner_id IN
       (SELECT id FROM media_links WHERE scope_type = 'citation' AND scope_id = ?)`,
    [id]
  );
  db.run(
    "DELETE FROM media_links WHERE scope_type = 'citation' AND scope_id = ?",
    [id]
  );
  db.run("DELETE FROM notes WHERE owner_type = 'citation' AND owner_id = ?", [
    id
  ]);
  db.run('DELETE FROM citations WHERE id = ?', [id]);
}

interface Merge {
  stored: Database;
  fresh: Database;
  annotations: Annotations;
  matchOf: (owner: Owner) => number | null;
  // The sources brought into the new database, by their id in the dataset.
  copied: Map<number, number>;
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

const SOURCE_COLUMNS = [
  'xref',
  'title',
  'author',
  'publisher',
  'text',
  'data_events',
  'change_date',
  'change_time'
];

// The dataset's source, written into the new database with its notes, once
// however many citations bring it; its id there, or null when the dataset
// has no such source.
function copySource(m: Merge, id: number) {
  const known = m.copied.get(id);
  if (known !== undefined) return known;
  const [row] = rowsOf(m.stored, `SELECT * FROM sources WHERE id = ${id}`);
  if (row === undefined) return null;
  const res = m.fresh.run(
    `INSERT INTO sources (${SOURCE_COLUMNS.join(', ')})
     VALUES (${SOURCE_COLUMNS.map(() => '?').join(', ')})`,
    SOURCE_COLUMNS.map((c) => valueOf(row, c))
  );
  const to = Number(res.lastInsertRowid);
  for (const n of rowsOf(
    m.stored,
    `SELECT text, sort_order FROM notes WHERE owner_type = 'source' AND owner_id = ${id} AND text IS NOT NULL ORDER BY sort_order`
  )) {
    m.fresh.run(
      "INSERT INTO notes (owner_type, owner_id, text, sort_order) VALUES ('source', ?, ?, ?)",
      [to, valueOf(n, 'text'), valueOf(n, 'sort_order') ?? 0]
    );
  }
  m.copied.set(id, to);
  return to;
}

// The new database's source for a citation made in the app: the export's
// own, or the dataset's brought with it.
function sourceIn(m: Merge, id: number) {
  return m.matchOf({ kind: 'source', id }) ?? copySource(m, id);
}

// A citation made in the app, attached again where it was: its id there,
// or null when it can't be. Its photos aren't carried, as the app adds
// none.
function reattach(m: Merge, s: Citation) {
  const scope = scopeIn(m, s.row);
  if (scope === null) return null;
  const sourceId = valueOf(s.row, 'source_id');
  const source = sourceId === null ? null : sourceIn(m, Number(sourceId));
  if (sourceId !== null && source === null) return null;
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
  return id;
}

// The columns a row of the table has in the new database, but its id.
function columnsOf(db: Database, table: string) {
  return db
    .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name)
    .filter((name) => name !== 'id');
}

// The rows of an app-only table whose rows are on something (ON_COLUMNS),
// each put back on the same person or Citation, by the ids `citations`
// gives the dataset's citations in the new database; a Citation's onto its
// person when the Citation is gone. One on an Image is put back as it was.
// One whose person is gone is left out, or with `keepGone`, kept on
// nothing. Gives those whose person is gone, and who they were.
function carryOn(
  m: Merge,
  citations: Map<number, number>,
  table: string,
  keepGone = false
) {
  const columns = columnsOf(m.fresh, table);
  const insert = `INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})`;
  const gone: Array<{ row: Row; owner: Owner }> = [];
  for (const r of rowsOf(m.stored, `SELECT * FROM ${table} ORDER BY id`)) {
    const row: Row = { ...r };
    const personId = valueOf(r, 'person_id');
    if (personId !== null) {
      const owner: Owner = { kind: 'person', id: Number(personId) };
      const person = m.matchOf(owner);
      const citationId = valueOf(r, 'citation_id');
      row.person_id = person;
      row.citation_id =
        person === null || citationId === null
          ? null
          : (citations.get(Number(citationId)) ?? null);
      if (person === null) {
        gone.push({ row: r, owner });
        if (!keepGone) continue;
      }
    }
    m.fresh.run(
      insert,
      columns.map((c) => valueOf(row, c) as SQLQueryBindings)
    );
  }
  return gone;
}

// The dataset's Reminders, carried as `carryOn` says. How many were, and
// those whose person is gone, described.
function carryReminders(
  m: Merge,
  citations: Map<number, number>,
  describe: (owner: Owner) => string
) {
  const all = rowsOf(m.stored, 'SELECT COUNT(*) AS n FROM reminders');
  const count = Number(all[0]?.n ?? 0);
  const lost = carryOn(m, citations, 'reminders').map(({ row, owner }) => {
    const text = String(valueOf(row, 'text')).replaceAll(/\s+/g, ' ');
    return `${describe(owner)}: ${text} (a Reminder)`;
  });
  return { kept: count - lost.length, lost };
}

function emptyReview(unreadable: string | null): ImportReview {
  return {
    people: { added: 0, gone: 0 },
    citations: { added: 0, gone: 0 },
    kept: {
      marks: 0,
      citations: 0,
      duplicates: 0,
      converted: 0,
      rejections: 0,
      reminders: 0
    },
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

// The export's citations, but those the dataset's converted Citations
// stand for, which are dropped from the new database; and which those are.
function exportedCitations(fresh: Database, stored: Citation[]) {
  const exported = citationsOf(fresh, (o) => `${o.kind}:${o.id}`);
  const replaced = replacements(stored, exported);
  const dropped = new Set(replaced.values());
  for (const f of dropped) dropCitation(fresh, f.id);
  return {
    freshCitations: exported.filter((f) => !dropped.has(f)),
    replaced
  };
}

// A citation of the dataset the export doesn't have: one made in the app
// attached again, counted kept (as `converted` when it stands for one the
// export has), else counted gone if imported, and lost if it held what the
// app added.
function keepUnpaired(m: Merge, s: Citation, converted: boolean) {
  const id = s.appMade ? reattach(m, s) : null;
  if (id !== null) {
    return {
      id,
      kept: converted ? 'converted' : 'citations',
      gone: false,
      lost: null
    } as const;
  }
  return { id, kept: null, gone: !s.appMade, lost: lostAs(s) };
}

function merge(fresh: Database, stored: Database, byXref: boolean) {
  const { matchOf, people } = recordMatcher(stored, fresh, byXref);
  const m: Merge = {
    stored,
    fresh,
    annotations: openAnnotations(fresh),
    matchOf,
    copied: new Map()
  };
  const storedCitations = citationsOf(stored, (o) => {
    const id = matchOf(o);
    return id === null ? null : `${o.kind}:${id}`;
  });
  const { freshCitations, replaced } = exportedCitations(
    fresh,
    storedCitations
  );
  const pairs = pairUp(storedCitations, freshCitations);
  const describe = describer(stored);
  const review = emptyReview(null);
  review.people = people();

  // The new database's id for each of the dataset's citations it has.
  const carried = new Map<number, number>();
  for (const [s, f] of pairs) {
    carried.set(s.id, f.id);
    if (s.linked) m.annotations.carry(f.id, s);
    const kept = keptAs(s, f);
    if (kept !== null) review.kept[kept] += 1;
  }
  for (const s of storedCitations) {
    if (pairs.has(s)) continue;
    const { id, kept, gone, lost } = keepUnpaired(m, s, replaced.has(s));
    if (id !== null) carried.set(s.id, id);
    if (kept !== null) review.kept[kept] += 1;
    if (gone) review.citations.gone += 1;
    if (lost !== null) review.lost.push(`${describe(s.holder)}: ${lost}`);
  }
  const paired = new Set(pairs.values());
  review.citations.added = freshCitations.filter(
    (f) => !f.appMade && !paired.has(f)
  ).length;
  // A new reference of a record already converted converts too.
  review.kept.converted += convertKin(fresh);
  review.kept.rejections = carryRejections(m.stored, m.fresh);
  const reminders = carryReminders(m, carried, describe);
  review.kept.reminders = reminders.kept;
  review.lost.push(...reminders.lost);
  // The Changes stay, each still saying what was done, though what it was
  // on may be gone.
  carryOn(m, carried, 'changes', true);
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
