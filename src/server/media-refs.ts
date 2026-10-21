// Which media a person or family has: the one rule both the copying into a
// dataset's media/ (media-ingest.ts) and the linking in its database
// (gedcom-import.ts) follow, so the two can't disagree.
//
// Read: each OBJE written out under a person or family, at any depth (on
// the record, its events, its citations), one reference per FILE. Not yet
// read: top-level OBJE records referenced by pointer.

import { childValue, findChild, findChildren } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';

const POINTER_RE = /^@[^@]+@$/;

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

// The media references written directly under one line: a record, an
// event or a citation.
export function mediaRefsOf(holder: GedNode) {
  const refs: MediaRef[] = [];
  findChildren(holder, 'OBJE')
    .filter((obje) => !POINTER_RE.test(obje.value ?? ''))
    .forEach((obje, object) => {
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
  const refs: MediaRef[] = [];
  function walk(node: GedNode) {
    refs.push(...mediaRefsOf(node));
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
