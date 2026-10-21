// Linking a GEDCOM's media to what holds them: a person, a family, an
// event or a citation.

import type { Scope } from '@common/types';

import type { LineReader } from './gedcom-lines';
import { findChildren } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';
import type { ImportStatements } from './import-statements';
import { mediaRefsOf } from './media-refs';
import type { MediaRef } from './media-refs';

export type MediaResolver = (originalRelpath: string) => string | null;

type MediaScope = Scope | 'fact' | 'citation';

const POINTER_RE = /^@[^@]+@$/;

// The media one line holds, the one marked primary first: GEDCOM 7 takes
// the first as the preferred one.
function primaryFirst(refs: MediaRef[]) {
  const ordered = [
    ...refs.filter((r) => r.primary),
    ...refs.filter((r) => !r.primary)
  ];
  return ordered.map((r, order) => ({ ...r, order }));
}

interface MediaLinker {
  sql: ImportStatements;
  lines: LineReader;
  // Called for each media row and each link written.
  count: (kind: 'media' | 'mediaLinks') => void;
  resolve: MediaResolver;
  importNotes: (node: GedNode, owner: 'media_link', ownerId: number) => void;
}

export function mediaLinker({
  sql,
  lines,
  count,
  resolve,
  importNotes
}: MediaLinker) {
  const { use, take, takeAll } = lines;

  function resolveMediaId(
    storedPath: string,
    originalPath: string,
    format: string | null
  ) {
    const existing = sql.getMediaByPath.get(storedPath) as {
      id: number;
    } | null;
    if (existing !== null) return existing.id;
    const res = sql.insertMedia.get(storedPath, format, originalPath) as {
      id: number;
    };
    count('media');
    return res.id;
  }

  // A media row for the stored file, which files with the same content
  // share, and a link to it from what holds it. Null when the file couldn't
  // be stored, which the media ingest reports.
  function importMediaLink(ref: MediaRef, scope: MediaScope, scopeId: number) {
    const storedPath = resolve(ref.path);
    if (storedPath === null) return null;
    const mediaId = resolveMediaId(storedPath, ref.path, ref.format);
    const { crop } = ref;
    const res = sql.insertMediaLink.run(
      mediaId,
      scope,
      scopeId,
      ref.object,
      ref.title,
      crop.top,
      crop.left,
      crop.width,
      crop.height,
      ref.order
    );
    count('mediaLinks');
    return Number(res.lastInsertRowid);
  }

  // The lines mediaRefsOf reads.
  function markMediaLines(obje: GedNode) {
    use(obje);
    take(obje, 'TITL');
    for (const file of takeAll(obje, 'FILE')) {
      take(file, 'FORM');
      const crop = take(file, 'CROP');
      if (crop === undefined) continue;
      for (const side of ['TOP', 'LEFT', 'HEIGHT', 'WIDTH']) take(crop, side);
    }
  }

  // An OBJE's notes go with the first of its files that was stored.
  function importMediaLinks(
    holder: GedNode,
    scope: MediaScope,
    scopeId: number
  ) {
    const objes = findChildren(holder, 'OBJE').filter(
      (o) => !POINTER_RE.test(o.value ?? '')
    );
    for (const obje of objes) markMediaLines(obje);
    const firstLink = new Map<number, number>();
    for (const ref of primaryFirst(mediaRefsOf(holder))) {
      const linkId = importMediaLink(ref, scope, scopeId);
      if (linkId !== null && !firstLink.has(ref.object)) {
        firstLink.set(ref.object, linkId);
      }
    }
    objes.forEach((obje, object) => {
      const linkId = firstLink.get(object);
      if (linkId !== undefined) importNotes(obje, 'media_link', linkId);
    });
  }

  return importMediaLinks;
}
