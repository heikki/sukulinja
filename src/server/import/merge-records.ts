// Who a row of the dataset's database is in a re-import's new one, for the
// merge (ADR-0013): people and families by UID, or by xref for a file that
// gave none; sources and shared notes by xref. Read whatever schema built
// the dataset, so an older one's additions carry over too.

import type { Database } from 'bun:sqlite';

export type Row = Record<string, string | number | null | undefined>;

// What a citation, a fact or a note is under in the end.
export type RecordKind = 'person' | 'family' | 'source' | 'shared_note';

export interface Owner {
  kind: RecordKind;
  id: number;
}

const TABLES: Record<RecordKind, string> = {
  person: 'persons',
  family: 'families',
  source: 'sources',
  shared_note: 'shared_notes'
};
const KINDS = Object.keys(TABLES) as RecordKind[];

const FACT_PARENT =
  'SELECT id, scope_type AS type, scope_id AS parent FROM facts';

// What each kind of row sits under.
const PARENTS: Record<string, string> = {
  fact: FACT_PARENT,
  place: FACT_PARENT,
  name: "SELECT id, 'person' AS type, person_id AS parent FROM names",
  note: 'SELECT id, owner_type AS type, owner_id AS parent FROM notes',
  citation: 'SELECT id, scope_type AS type, scope_id AS parent FROM citations',
  media_link:
    'SELECT id, scope_type AS type, scope_id AS parent FROM media_links',
  association:
    "SELECT id, 'person' AS type, person_id AS parent FROM associations"
};

// The rows a query gives, or none from a schema without its table.
export function rowsOf(db: Database, sql: string) {
  try {
    return db.query<Row, []>(sql).all();
  } catch {
    return [];
  }
}

function isRecordKind(type: string): type is RecordKind {
  return type in TABLES;
}

// The record a row is under, through the rows between.
export function ownerFinder(db: Database) {
  const parents = new Map<string, Map<number, Row>>();
  function parentsOf(type: string) {
    let known = parents.get(type);
    if (known === undefined) {
      const sql = PARENTS[type];
      const rows = sql === undefined ? [] : rowsOf(db, sql);
      known = new Map(rows.map((r) => [Number(r.id), r]));
      parents.set(type, known);
    }
    return known;
  }
  return function ownerOf(type: string, id: number): Owner | null {
    if (isRecordKind(type)) return { kind: type, id };
    const up = parentsOf(type).get(id);
    if (up === undefined) return null;
    return ownerOf(String(up.type), Number(up.parent));
  };
}

interface Identity {
  uid: string | null;
  xref: string;
}

function identitiesOf(db: Database, kind: RecordKind) {
  return new Map(
    rowsOf(db, `SELECT * FROM ${TABLES[kind]}`).map((r): [number, Identity] => [
      Number(r.id),
      { uid: typeof r.uid === 'string' ? r.uid : null, xref: String(r.xref) }
    ])
  );
}

function indexOf(ids: Map<number, Identity>) {
  const byUid = new Map<string, number>();
  const byXref = new Map<string, number>();
  for (const [id, { uid, xref }] of ids) {
    if (uid !== null) byUid.set(uid, id);
    byXref.set(xref, id);
  }
  return { byUid, byXref };
}

// Each of the dataset's records as the new database has it; `byXref` when
// the new file gave no UIDs, which were then made up.
export function recordMatcher(
  stored: Database,
  fresh: Database,
  byXref: boolean
) {
  const from = new Map(KINDS.map((k) => [k, identitiesOf(stored, k)]));
  const to = new Map(KINDS.map((k) => [k, indexOf(identitiesOf(fresh, k))]));

  function matchOf(owner: Owner) {
    const known = from.get(owner.kind)!.get(owner.id);
    if (known === undefined) return null;
    const index = to.get(owner.kind)!;
    if (known.uid !== null) {
      const found = index.byUid.get(known.uid);
      if (found !== undefined || !byXref) return found ?? null;
    }
    return index.byXref.get(known.xref) ?? null;
  }

  // People the new export added, and the dataset's it no longer has.
  function people() {
    const stored_ = [...from.get('person')!.keys()];
    const matched = new Set(
      stored_
        .map((id) => matchOf({ kind: 'person', id }))
        .filter((id) => id !== null)
    );
    return {
      added: to.get('person')!.byXref.size - matched.size,
      gone: stored_.length - matched.size
    };
  }

  return { matchOf, people };
}

// How a record of the dataset is named in the import's review.
export function describer(db: Database) {
  const names = new Map<number, string>();
  for (const r of rowsOf(
    db,
    'SELECT person_id, full_text FROM names ORDER BY sort_order DESC'
  )) {
    names.set(Number(r.person_id), String(r.full_text));
  }
  const families = new Map(
    rowsOf(db, 'SELECT id, husband_id, wife_id FROM families').map((r) => [
      Number(r.id),
      r
    ])
  );
  const sources = new Map(
    rowsOf(db, 'SELECT id, title FROM sources').map((r) => [
      Number(r.id),
      r.title
    ])
  );
  function person(id: unknown) {
    return typeof id === 'number' ? (names.get(id) ?? null) : null;
  }
  return function describe(owner: Owner | null) {
    if (owner === null) return 'Someone';
    switch (owner.kind) {
      case 'person':
        return person(owner.id) ?? 'Someone';
      case 'family': {
        const f = families.get(owner.id);
        const spouses = [person(f?.husband_id), person(f?.wife_id)];
        const named = spouses.filter((n) => n !== null);
        return named.length === 0
          ? 'A family'
          : `Family of ${named.join(' & ')}`;
      }
      case 'source':
        return String(sources.get(owner.id) ?? 'A source');
      case 'shared_note':
        return 'A shared note';
    }
  };
}
