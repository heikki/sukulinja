// A dataset's media in GEDCOM 7: an OBJE record holding the FILEs of each
// OBJE a person, family, event or citation has, and a link to it carrying
// the CROP and TITL. Each file is packed into the GEDZIP under the path it
// was imported from, when that's a safe one, so names stay readable.

import { extname } from 'node:path';

import { mimeOf } from '../gedcom/media-refs';
import { line, optional, pointer } from '../gedcom/writer';
import type { OutLine } from '../gedcom/writer';
import type { ExportRows, MediaLinkRow } from './rows';
import { ownerKey } from './rows';

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/iu;

function plainPath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

// A path the archive can hold as is: relative, staying inside it, and not
// the dataset's own entry.
function isSafe(path: string) {
  return (
    path !== '' &&
    path !== 'gedcom.ged' &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !SCHEME_RE.test(path) &&
    !path.split('/').includes('..')
  );
}

// GEDCOM 7 writes a FILE as a URL.
function fileUrl(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function cropOf(rows: MediaLinkRow[]) {
  const row = rows.find(
    (r) =>
      r.crop_top !== null ||
      r.crop_left !== null ||
      r.crop_width !== null ||
      r.crop_height !== null
  );
  if (row === undefined) return [];
  return [
    line('CROP', null, [
      ...optional('TOP', row.crop_top === null ? null : String(row.crop_top)),
      ...optional(
        'LEFT',
        row.crop_left === null ? null : String(row.crop_left)
      ),
      ...optional(
        'HEIGHT',
        row.crop_height === null ? null : String(row.crop_height)
      ),
      ...optional(
        'WIDTH',
        row.crop_width === null ? null : String(row.crop_width)
      )
    ])
  ];
}

function formOf(row: MediaLinkRow) {
  return (
    row.format ??
    mimeOf(extname(row.file_path).slice(1)) ??
    'application/octet-stream'
  );
}

export function mediaExport(
  rows: ExportRows,
  takenXrefs: Set<string>,
  notes: (ownerType: string, ownerId: number) => OutLine[]
) {
  const records: OutLine[] = [];
  // The archive's entries, by the stored file they hold.
  const entries = new Map<string, string>();
  const used = new Set<string>();
  let counter = 0;

  function newXref() {
    for (;;) {
      counter += 1;
      const xref = `@M${counter}@`;
      if (!takenXrefs.has(xref)) return xref;
    }
  }

  function entryOf(row: MediaLinkRow) {
    const known = entries.get(row.file_path);
    if (known !== undefined) return known;
    const imported = plainPath(row.original_path ?? '');
    const entry =
      isSafe(imported) && !used.has(imported)
        ? imported
        : `media/${row.file_path}`;
    entries.set(row.file_path, entry);
    used.add(entry);
    return entry;
  }

  // One OBJE line per OBJE the holder had, in order; the notes went with
  // its first stored file.
  function linksOf(scopeType: string, scopeId: number) {
    const groups = new Map<number, MediaLinkRow[]>();
    for (const row of rows.mediaOf(ownerKey(scopeType, scopeId))) {
      const group = groups.get(row.object_order);
      if (group === undefined) groups.set(row.object_order, [row]);
      else group.push(row);
    }
    return [...groups.values()].map((group) => {
      const xref = newXref();
      const first = group.reduce((a, b) => (a.id < b.id ? a : b));
      records.push({
        tag: 'OBJE',
        xref,
        children: [
          ...group.map((row) =>
            line('FILE', fileUrl(entryOf(row)), [line('FORM', formOf(row))])
          ),
          ...notes('media_link', first.id)
        ]
      });
      return pointer('OBJE', xref, [
        ...cropOf(group),
        ...optional('TITL', group[0]!.title)
      ]);
    });
  }

  return { linksOf, records, entries };
}
