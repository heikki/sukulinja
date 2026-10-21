// Which media a person or family has: the one rule both the copying into a
// dataset's media/ (media-ingest.ts) and the linking in its database
// (gedcom-import.ts) follow, so the two can't disagree.
//
// Read: each OBJE under a person or family, at any depth (on the record,
// its events, its citations), one reference per FILE. An OBJE is written
// out where it's used (GEDCOM 5.5.1, MyHeritage), or points at an OBJE
// record that holds the FILEs (GEDCOM 7), and the link then holds its CROP
// and TITL.

import { childValue, findChild, findChildren } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';

const POINTER_RE = /^@[^@]+@$/;

// A FILE's FORM as GEDCOM 7 writes it: a MIME type. GEDCOM 5.5.1 gives the
// file's extension instead.
const FORM_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mov: 'video/quicktime'
};

export function mimeOf(form: string | null) {
  if (form === null) return null;
  return FORM_MIME[form.toLowerCase()] ?? form;
}

// The OBJE records of a file, by xref, for the links that point at them.
export type ObjectRecords = Map<string, GedNode>;

export function objectRecords(roots: GedNode[]): ObjectRecords {
  return new Map(
    roots
      .filter((r) => r.tag === 'OBJE' && r.xref !== undefined)
      .map((r) => [r.xref!, r])
  );
}

export interface MediaRef {
  // The FILE as the GEDCOM gives it: where to copy from, and the original
  // path kept on the media row.
  path: string;
  // The FILE's FORM, as a MIME type.
  format: string | null;
  crop: {
    top: number | null;
    left: number | null;
    width: number | null;
    height: number | null;
  };
  primary: boolean;
  title: string | null;
  // Among the references of the line holding them.
  order: number;
  // Which of its OBJE lines it's from: one OBJE may give several FILEs.
  object: number;
}

function toInt(value: string | undefined) {
  if (value === undefined) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function cropOf(holder: GedNode) {
  const crop = findChild(holder, 'CROP');
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

// The OBJE lines directly under one line, and for each the OBJE holding
// its FILEs: itself when written out, else the record it points at. A
// pointer to no record gives nothing.
export function objectsOf(holder: GedNode, records: ObjectRecords) {
  return findChildren(holder, 'OBJE').flatMap((link) => {
    if (!POINTER_RE.test(link.value ?? '')) return [{ link, files: link }];
    const record = records.get(link.value!);
    return record === undefined ? [] : [{ link, files: record }];
  });
}

// The media references written directly under one line: a record, an
// event or a citation.
export function mediaRefsOf(holder: GedNode, records: ObjectRecords) {
  const refs: MediaRef[] = [];
  objectsOf(holder, records).forEach(({ link, files }, object) => {
    const primary = findChild(link, '_PRIM')?.value === 'Y';
    const linkTitle = childValue(link, 'TITL') ?? childValue(files, 'TITL');
    for (const file of findChildren(files, 'FILE')) {
      const path = file.value;
      if (path === undefined || path === '') continue;
      refs.push({
        path,
        format: mimeOf(childValue(file, 'FORM')),
        // MyHeritage puts a face's CROP under the FILE; GEDCOM 7 on the
        // link.
        crop: cropOf(findChild(file, 'CROP') === undefined ? link : file),
        primary,
        title: linkTitle ?? childValue(file, 'TITL'),
        order: refs.length,
        object
      });
    }
  });
  return refs;
}

// Every media reference under the people and families, which the media
// ingest copies into the dataset.
export function allMediaRefs(roots: GedNode[]) {
  const records = objectRecords(roots);
  const refs: MediaRef[] = [];
  function walk(node: GedNode) {
    refs.push(...mediaRefsOf(node, records));
    for (const child of node.children) walk(child);
  }
  for (const root of roots) {
    if (root.tag === 'INDI' || root.tag === 'FAM') walk(root);
  }
  return refs;
}

// The local paths a FILE may name: as written, and percent-decoded, since
// GEDCOM 7 writes a FILE as a URL (`photo%201.jpg` for `photo 1.jpg`).
export function localPaths(file: string) {
  try {
    const decoded = decodeURIComponent(file);
    return decoded === file ? [file] : [file, decoded];
  } catch {
    return [file];
  }
}
