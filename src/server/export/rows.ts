// A dataset's database read whole for export, each kind of row grouped by
// what it belongs to and in its stored order.

import type { Database } from 'bun:sqlite';

import { annotated, CITATIONS_READ } from '../citations';
import type { Annotation } from '../citations';

interface Changed {
  change_date: string | null;
  change_time: string | null;
}

export interface PersonRow extends Changed {
  id: number;
  xref: string;
  uid: string | null;
  sex: string | null;
}

export interface FamilyRow extends Changed {
  id: number;
  xref: string;
  uid: string | null;
  husband_id: number | null;
  wife_id: number | null;
}

export interface NameRow {
  id: number;
  person_id: number;
  full_text: string;
  name_type: string | null;
}

interface PieceRow {
  name_id: number;
  tag: string;
  value: string;
}

export interface FactRow {
  id: number;
  scope_type: string;
  scope_id: number;
  tag: string;
  type: string | null;
  date_text: string | null;
  place: string | null;
  latitude: string | null;
  longitude: string | null;
  age: string | null;
  cause: string | null;
  agency: string | null;
  value: string | null;
}

interface AddressRow {
  owner_type: string;
  owner_id: number;
  text: string | null;
  line1: string | null;
  line2: string | null;
  line3: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface CitationRow {
  id: number;
  scope_type: string;
  scope_id: number;
  source_id: number | null;
  page: string | null;
  event: string | null;
  role: string | null;
  quality: number | null;
  data_date: string | null;
  text: string | null;
  annotation: Annotation;
}

interface NoteRow {
  id: number;
  owner_type: string;
  owner_id: number;
  text: string | null;
  shared_note_id: number | null;
}

// A stored media file.
export interface MediaRow {
  file_path: string;
  format: string | null;
  original_path: string | null;
}

export interface MediaLinkRow extends MediaRow {
  id: number;
  scope_type: string;
  scope_id: number;
  object_order: number;
  title: string | null;
  crop_top: number | null;
  crop_left: number | null;
  crop_width: number | null;
  crop_height: number | null;
  // A Tag (ADR-0017).
  added_in_app: number;
}

interface AssociationRow {
  id: number;
  person_id: number;
  associate_id: number;
  relation: string | null;
}

export interface SourceRow extends Changed {
  id: number;
  xref: string;
  title: string | null;
  author: string | null;
  publisher: string | null;
  text: string | null;
  data_events: string | null;
}

export interface RepositoryRow extends Changed {
  id: number;
  xref: string;
  name: string | null;
  phone: string | null;
}

export interface SharedNoteRow extends Changed {
  id: number;
  xref: string;
  text: string;
}

export interface SubmitterRow extends Changed {
  id: number;
  xref: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

export function ownerKey(type: string, id: number) {
  return `${type}:${id}`;
}

function grouped<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = groups.get(k);
    if (group === undefined) groups.set(k, [row]);
    else group.push(row);
  }
  return (k: string) => groups.get(k) ?? [];
}

export function readExportRows(db: Database) {
  function all<T>(sql: string) {
    return db.query<T, []>(sql).all();
  }
  const ordered = 'ORDER BY sort_order, id';
  const families = all<FamilyRow>('SELECT * FROM families ORDER BY id');
  const children = all<{ family_id: number; person_id: number }>(
    'SELECT family_id, person_id FROM family_children ORDER BY family_id, sort_order'
  );
  return {
    persons: all<PersonRow>('SELECT * FROM persons ORDER BY id'),
    families,
    sources: all<SourceRow>('SELECT * FROM sources ORDER BY id'),
    repositories: all<RepositoryRow>('SELECT * FROM repositories ORDER BY id'),
    sharedNotes: all<SharedNoteRow>('SELECT * FROM shared_notes ORDER BY id'),
    submitters: all<SubmitterRow>('SELECT * FROM submitters ORDER BY id'),
    meta: new Map(
      all<{ key: string; value: string }>('SELECT key, value FROM meta').map(
        (r) => [r.key, r.value]
      )
    ),
    namesOf: grouped(all<NameRow>(`SELECT * FROM names ${ordered}`), (r) =>
      String(r.person_id)
    ),
    piecesOf: grouped(
      all<PieceRow>(`SELECT * FROM name_pieces ${ordered}`),
      (r) => String(r.name_id)
    ),
    factsOf: grouped(all<FactRow>(`SELECT * FROM facts ${ordered}`), (r) =>
      ownerKey(r.scope_type, r.scope_id)
    ),
    addressOf: grouped(all<AddressRow>('SELECT * FROM addresses'), (r) =>
      ownerKey(r.owner_type, r.owner_id)
    ),
    citationsOf: grouped(
      all<Omit<CitationRow, 'annotation'>>(
        `SELECT * FROM ${CITATIONS_READ} ${ordered}`
      ).map(annotated),
      (r) => ownerKey(r.scope_type, r.scope_id)
    ),
    // The Citations supporting each Fact (ADR-0022), in their owner's
    // order.
    supportOf: grouped(
      all<Omit<CitationRow, 'annotation'> & { fact_id: number }>(
        `SELECT c.*, fc.fact_id FROM fact_citations fc
         JOIN ${CITATIONS_READ} c ON c.id = fc.citation_id
         ORDER BY c.scope_type, c.scope_id, c.sort_order, c.id`
      ).map(annotated),
      (r) => String(r.fact_id)
    ),
    notesOf: grouped(all<NoteRow>(`SELECT * FROM notes ${ordered}`), (r) =>
      ownerKey(r.owner_type, r.owner_id)
    ),
    mediaOf: grouped(
      all<MediaLinkRow>(
        `SELECT ml.*, m.file_path, m.format, m.original_path FROM media_links ml
         JOIN media m ON m.id = ml.media_id ORDER BY ml.sort_order, ml.id`
      ),
      (r) => ownerKey(r.scope_type, r.scope_id)
    ),
    // The Photos linked to no one.
    unlinkedMedia: all<MediaRow>(
      `SELECT file_path, format, original_path FROM media m
       WHERE NOT EXISTS (SELECT 1 FROM media_links ml WHERE ml.media_id = m.id)
       ORDER BY id`
    ),
    associationsOf: grouped(
      all<AssociationRow>(`SELECT * FROM associations ${ordered}`),
      (r) => String(r.person_id)
    ),
    repositoriesOf: grouped(
      all<{ source_id: number; repository_id: number }>(
        'SELECT source_id, repository_id FROM source_repositories ORDER BY sort_order'
      ),
      (r) => String(r.source_id)
    ),
    childrenOf: grouped(children, (r) => String(r.family_id)),
    // A person's families as a child and as a spouse, in family order.
    parentFamiliesOf: grouped(children, (r) => String(r.person_id)),
    spouseFamiliesOf: grouped(
      families.flatMap((f) =>
        [f.husband_id, f.wife_id]
          .filter((p) => p !== null)
          .map((p) => ({ person: p, family: f }))
      ),
      (r) => String(r.person)
    )
  };
}

export type ExportRows = ReturnType<typeof readExportRows>;
