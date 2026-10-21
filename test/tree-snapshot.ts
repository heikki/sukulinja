// Everything a dataset's database says about its tree, with row ids
// replaced by what each row belongs to (a person's xref, "its second
// note"…), so two imports of the same tree compare equal.

import type { Database } from 'bun:sqlite';

type Row = Record<string, unknown> & { id?: number };

// Columns that say how an import found something, not what the tree holds.
const LEFT_OUT: Record<string, string[]> = {
  media: ['original_path']
};
// Tables the GEDZIP doesn't carry: Rejections have no GEDCOM form.
const NOT_CARRIED = new Set(['rejections']);
const META_KEPT = new Set([
  'header_note',
  'copyright',
  'language',
  'place_form',
  'submitter',
  'schema_version'
]);

export function treeSnapshot(db: Database) {
  const tables = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((t) => t.name)
    .filter((t) => !NOT_CARRIED.has(t));
  const rows = new Map(
    tables.map((t) => [t, db.query<Row, []>(`SELECT * FROM ${t}`).all()])
  );
  function byId(table: string) {
    return new Map((rows.get(table) ?? []).map((r) => [r.id!, r]));
  }
  const index = new Map(tables.map((t) => [t, byId(t)]));

  function row(table: string, id: unknown) {
    return index.get(table)!.get(id as number);
  }

  // Each kind of owner by what it is under, recursively.
  function keyOf(type: string, id: unknown): string {
    function r(table: string) {
      return row(table, id);
    }
    switch (type) {
      case 'person':
      case 'family':
      case 'source':
      case 'repository':
      case 'shared_note':
      case 'submitter': {
        const table =
          type === 'person'
            ? 'persons'
            : type === 'family'
              ? 'families'
              : type === 'repository'
                ? 'repositories'
                : `${type}s`;
        return String(r(table)?.xref);
      }
      case 'media':
        return String(r('media')?.file_path);
      case 'name': {
        const n = r('names')!;
        return `${keyOf('person', n.person_id)}/NAME#${String(n.sort_order)}`;
      }
      case 'fact':
      case 'place': {
        const f = r('facts')!;
        return `${keyOf(String(f.scope_type), f.scope_id)}/${String(f.tag)}#${String(f.sort_order)}`;
      }
      case 'citation': {
        const c = r('citations')!;
        return `${keyOf(String(c.scope_type), c.scope_id)}/SOUR#${String(c.sort_order)}`;
      }
      case 'note': {
        const n = r('notes')!;
        return `${keyOf(String(n.owner_type), n.owner_id)}/NOTE#${String(n.sort_order)}`;
      }
      case 'media_link': {
        const m = r('media_links')!;
        return `${keyOf(String(m.scope_type), m.scope_id)}/OBJE#${String(m.sort_order)}`;
      }
      case 'association': {
        const a = r('associations')!;
        return `${keyOf('person', a.person_id)}/ASSO#${String(a.sort_order)}`;
      }
      default:
        throw new Error(`no key for ${type}`);
    }
  }

  const FOREIGN: Record<string, string> = {
    person_id: 'person',
    associate_id: 'person',
    husband_id: 'person',
    wife_id: 'person',
    family_id: 'family',
    source_id: 'source',
    repository_id: 'repository',
    media_id: 'media',
    shared_note_id: 'shared_note',
    name_id: 'name'
  };

  function described(table: string, r: Row) {
    const out: Record<string, unknown> = {};
    for (const [column, value] of Object.entries(r)) {
      if (column === 'id' || LEFT_OUT[table]?.includes(column) === true) {
        continue;
      }
      if (column === 'scope_id' || column === 'owner_id') {
        const typeColumn = column === 'scope_id' ? 'scope_type' : 'owner_type';
        out[column] = keyOf(String(r[typeColumn]), value);
      } else if (FOREIGN[column] !== undefined && value !== null) {
        out[column] = keyOf(FOREIGN[column], value);
      } else {
        out[column] = value;
      }
    }
    return out;
  }

  const snapshot: Record<string, unknown[]> = {};
  for (const table of tables) {
    const described_ = (rows.get(table) ?? [])
      .filter((r) => table !== 'meta' || META_KEPT.has(String(r.key)))
      .map((r) => described(table, r));
    snapshot[table] = described_
      .map((d) => JSON.stringify(d))
      .sort()
      .map((j) => JSON.parse(j) as unknown);
  }
  return snapshot;
}
