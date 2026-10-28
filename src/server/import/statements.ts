// The statements an import writes a dataset's database with.

import type { Database } from 'bun:sqlite';

type Value = string | number | null;

// A row's values as an insert binds them: one for each column, by its name.
type Bindings<C extends string> = { [K in C as `$${K}`]: Value };

// An insert naming each column once: its value is bound by the column's
// name, so a column left out or misspelt doesn't typecheck.
function insertInto<const C extends readonly string[]>(
  db: Database,
  table: string,
  columns: C,
  options: { or?: 'IGNORE' | 'REPLACE'; returningId?: boolean } = {}
) {
  const verb = options.or === undefined ? 'INSERT' : `INSERT OR ${options.or}`;
  const values = columns.map((c) => `$${c}`).join(', ');
  const returning = options.returningId === true ? ' RETURNING id' : '';
  return db.prepare<{ id: number }, Bindings<C[number]>>(
    `${verb} INTO ${table} (${columns.join(', ')}) VALUES (${values})${returning}`
  );
}

const CHANGED = ['change_date', 'change_time'] as const;

export function importStatements(db: Database) {
  return {
    insertPerson: insertInto(db, 'persons', ['xref', 'uid', 'sex', ...CHANGED]),
    insertFamily: insertInto(db, 'families', ['xref', 'uid', ...CHANGED]),
    updateFamily: db.prepare<never, Bindings<'husband_id' | 'wife_id' | 'id'>>(
      'UPDATE families SET husband_id = $husband_id, wife_id = $wife_id WHERE id = $id'
    ),
    insertName: insertInto(db, 'names', [
      'person_id',
      'full_text',
      'given',
      'surname',
      'suffix',
      'name_type',
      'sort_order'
    ]),
    insertNamePiece: insertInto(db, 'name_pieces', [
      'name_id',
      'tag',
      'value',
      'sort_order'
    ]),
    insertFact: insertInto(db, 'facts', [
      'scope_type',
      'scope_id',
      'tag',
      'type',
      'date_text',
      'place',
      'latitude',
      'longitude',
      'address',
      'age',
      'cause',
      'agency',
      'value',
      'sort_order'
    ]),
    insertAddress: insertInto(db, 'addresses', [
      'owner_type',
      'owner_id',
      'text',
      'line1',
      'line2',
      'line3',
      'city',
      'state',
      'postal_code',
      'country'
    ]),
    insertAssociation: insertInto(db, 'associations', [
      'person_id',
      'associate_id',
      'relation',
      'sort_order'
    ]),
    insertFamilyChild: insertInto(
      db,
      'family_children',
      ['family_id', 'person_id', 'sort_order'],
      { or: 'IGNORE' }
    ),
    insertRepository: insertInto(db, 'repositories', [
      'xref',
      'name',
      'phone',
      ...CHANGED
    ]),
    insertSource: insertInto(db, 'sources', [
      'xref',
      'title',
      'author',
      'publisher',
      'text',
      'data_events',
      ...CHANGED
    ]),
    insertSourceRepository: insertInto(db, 'source_repositories', [
      'source_id',
      'repository_id',
      'sort_order'
    ]),
    insertSubmitter: insertInto(db, 'submitters', [
      'xref',
      'name',
      'phone',
      'email',
      'website',
      ...CHANGED
    ]),
    insertSharedNote: insertInto(db, 'shared_notes', [
      'xref',
      'text',
      ...CHANGED
    ]),
    insertNote: insertInto(db, 'notes', [
      'owner_type',
      'owner_id',
      'text',
      'shared_note_id',
      'sort_order'
    ]),
    insertMeta: insertInto(db, 'meta', ['key', 'value'], { or: 'REPLACE' }),
    getMediaByPath: db.prepare<{ id: number }, [string]>(
      'SELECT id FROM media WHERE file_path = ?'
    ),
    insertMedia: insertInto(
      db,
      'media',
      ['file_path', 'format', 'original_path'],
      { returningId: true }
    ),
    insertMediaLink: insertInto(db, 'media_links', [
      'media_id',
      'scope_type',
      'scope_id',
      'object_order',
      'title',
      'crop_top',
      'crop_left',
      'crop_width',
      'crop_height',
      'sort_order'
    ])
  };
}

export type ImportStatements = ReturnType<typeof importStatements>;
