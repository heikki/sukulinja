// A Citation's Annotation: what the app adds to it (ADR-0013). Its Mark or
// Match, the page a Mark on an Image moved aside (its original
// page), and whether the app made the Citation. Only this module knows the
// columns an Annotation is stored in, and `entries/` which of them an
// Entry holds for its Citations (ADR-0026), read as their own through
// CITATIONS_READ; it works on single Citation rows, and the import, the
// export and the Marks go through it.

import type { Database, SQLQueryBindings } from 'bun:sqlite';

import type { Box, Provenance } from '@/common/types';

import { CITATIONS_READ } from './entries';

// Where a Mark or Match says a record is: on an Image of a Volume,
// with the entry's Box in pixels of the full-size Image, or only in the
// Volume. `volume` is the Volume's label. The Image's file id tells the
// filming it was made on.
export interface CitationLink {
  volumeId: string;
  volume: string;
  image?: number;
  fileId?: string;
  box?: Box;
  by: Provenance;
}

export interface Annotation {
  link: CitationLink | null;
}

export const NO_ANNOTATION: Annotation = { link: null };

// Where a Citation is, and what it says besides its Annotation.
export interface CitationValues {
  scopeType: string;
  scopeId: number;
  sourceId: number | null;
  sortOrder: number;
  page: string | null;
  event: string | null;
  role: string | null;
  quality: number | null;
  dataDate: string | null;
  text: string | null;
  // The Entry it cites, which holds its source, page, Event, text and
  // link; those are then given as null.
  entryId?: number | null;
}

const COLUMNS = [
  'link_volume_id',
  'link_volume',
  'link_image',
  'link_file_id',
  'link_box_left',
  'link_box_top',
  'link_box_width',
  'link_box_height',
  'link_by'
] as const;

type Column = (typeof COLUMNS)[number];
type Row = Partial<Record<string, SQLQueryBindings | undefined>>;

// The columns an Annotation is read from, for a query to select beside its
// own and give to annotationOf.
export function annotationColumnsSql(alias?: string) {
  const at = alias === undefined ? '' : `${alias}.`;
  return COLUMNS.map((c) => `${at}${c}`).join(', ');
}

function text(value: SQLQueryBindings | undefined) {
  return typeof value === 'string' ? value : null;
}

function int(value: SQLQueryBindings | undefined) {
  return typeof value === 'number' ? value : null;
}

function linkOf(row: Row): CitationLink | null {
  const volumeId = text(row.link_volume_id);
  if (volumeId === null) return null;
  const link: CitationLink = {
    volumeId,
    volume: text(row.link_volume) ?? volumeId,
    by: row.link_by as Provenance
  };
  const image = int(row.link_image);
  const fileId = text(row.link_file_id);
  const left = int(row.link_box_left);
  if (image !== null) link.image = image;
  if (fileId !== null) link.fileId = fileId;
  if (left !== null) {
    link.box = {
      left,
      top: int(row.link_box_top)!,
      width: int(row.link_box_width)!,
      height: int(row.link_box_height)!
    };
  }
  return link;
}

// The Annotation a citations row read whole holds. A column an older
// schema lacked reads as empty.
export function annotationOf(row: Row): Annotation {
  return { link: linkOf(row) };
}

// A citations row read whole, its Annotation's columns read into one.
export function annotated<T extends object>(row: T) {
  const rest: Partial<T> = { ...row };
  for (const column of COLUMNS) Reflect.deleteProperty(rest, column);
  return { ...(rest as Omit<T, Column>), annotation: annotationOf(row) };
}

const NO_LINK = {
  $volumeId: null,
  $volume: null,
  $image: null,
  $fileId: null,
  $left: null,
  $top: null,
  $width: null,
  $height: null,
  $by: null
};

function linkParams(link: CitationLink | null) {
  if (link === null) return NO_LINK;
  const { box } = link;
  return {
    ...NO_LINK,
    $volumeId: link.volumeId,
    $volume: link.volume,
    $image: link.image ?? null,
    $fileId: link.fileId ?? null,
    ...(box === undefined
      ? {}
      : {
          $left: box.left,
          $top: box.top,
          $width: box.width,
          $height: box.height
        }),
    $by: link.by
  };
}

const SET_LINK = `link_volume_id = $volumeId, link_volume = $volume,
  link_image = $image, link_file_id = $fileId,
  link_box_left = $left, link_box_top = $top,
  link_box_width = $width, link_box_height = $height,
  link_by = $by`;

const LINK_COLUMNS = COLUMNS.filter((c) => c.startsWith('link_')).join(', ');

interface LinkRow extends Row {
  id: number;
}

export function openAnnotations(db: Database) {
  const insertRow = db.prepare(
    `INSERT INTO citations (scope_type, scope_id, source_id, sort_order,
       page, event, role, quality, data_date, text,
       ${LINK_COLUMNS}, entry_id)
     VALUES ($scopeType, $scopeId, $sourceId, $sortOrder, $page, $event,
       $role, $quality, $dataDate, $text, $volumeId, $volume,
       $image, $fileId, $left, $top, $width, $height, $by, $entryId)`
  );
  const swapRows = db.prepare(
    `UPDATE citations SET ${SET_LINK}
     WHERE id IN (SELECT value FROM json_each($ids))`
  );
  const firstLinkQuery = db.prepare<LinkRow, [string]>(
    `SELECT id, ${LINK_COLUMNS} FROM ${CITATIONS_READ}
     WHERE id IN (SELECT value FROM json_each(?))
       AND link_volume_id IS NOT NULL
     ORDER BY id LIMIT 1`
  );
  const linkedQuery = db.prepare<LinkRow, []>(
    `SELECT id, ${LINK_COLUMNS} FROM ${CITATIONS_READ}
     WHERE link_volume_id IS NOT NULL ORDER BY id`
  );

  return {
    // A new Citation row, stored as given; its id.
    insert(values: CitationValues, annotation = NO_ANNOTATION) {
      const res = insertRow.run({
        $scopeType: values.scopeType,
        $scopeId: values.scopeId,
        $sourceId: values.sourceId,
        $sortOrder: values.sortOrder,
        $page: values.page,
        $event: values.event,
        $role: values.role,
        $quality: values.quality,
        $dataDate: values.dataDate,
        $text: values.text,
        ...linkParams(annotation.link),
        $entryId: values.entryId ?? null
      });
      return Number(res.lastInsertRowid);
    },

    // Writes a Mark or Match into the Citations, or clears it for a
    // Discard. Their page stays the reference's (ADR-0039).
    swap(ids: number[], link: CitationLink | null) {
      swapRows.run({ ...linkParams(link), $ids: JSON.stringify(ids) });
    },

    // The link the first linked of the Citations holds, if any.
    firstLink(ids: number[]) {
      const row = firstLinkQuery.get(JSON.stringify(ids));
      return row === null ? null : linkOf(row);
    },

    // Every Citation with a link, in stored order.
    linked() {
      return linkedQuery
        .all()
        .map((row) => ({ id: row.id, link: linkOf(row)! }));
    }
  };
}

export type Annotations = ReturnType<typeof openAnnotations>;
