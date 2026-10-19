// Which media a person or family has: the one rule both the copying into a
// dataset's media/ (media-ingest.ts) and the linking in its database
// (gedcom-import.ts) follow, so the two can't disagree.
//
// Read: each OBJE directly under an INDI or FAM, one reference per FILE.
// Not yet read: OBJE nested in events (BIRT, MARR, …) and top-level OBJE
// records referenced by pointer.

import { childValue, findChild, findChildren } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';

export interface MediaRef {
  // The FILE as the GEDCOM gives it: where to copy from, and the original
  // path kept on the media row.
  path: string;
  // The FILE's FORM, a MIME type once a MyHeritage export is converted.
  format: string | null;
  crop: {
    top: number | null;
    left: number | null;
    width: number | null;
    height: number | null;
  };
  primary: boolean;
  title: string | null;
  // Among the record's references.
  order: number;
}

function toInt(value: string | undefined) {
  if (value === undefined) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function cropOf(file: GedNode) {
  const crop = findChild(file, 'CROP');
  function side(tag: string) {
    return crop === undefined ? null : toInt(findChild(crop, tag)?.value);
  }
  return {
    top: side('TOP'),
    left: side('LEFT'),
    width: side('WIDTH'),
    height: side('HEIGHT')
  };
}

// The media references of one INDI or FAM, in order; none for any other
// record.
export function mediaRefsOf(record: GedNode) {
  if (record.tag !== 'INDI' && record.tag !== 'FAM') return [];
  const refs: MediaRef[] = [];
  for (const obje of findChildren(record, 'OBJE')) {
    const primary = findChild(obje, '_PRIM')?.value === 'Y';
    const title = childValue(obje, 'TITL');
    for (const file of findChildren(obje, 'FILE')) {
      const path = file.value;
      if (path === undefined || path === '') continue;
      refs.push({
        path,
        format: childValue(file, 'FORM'),
        crop: cropOf(file),
        primary,
        title,
        order: refs.length
      });
    }
  }
  return refs;
}
