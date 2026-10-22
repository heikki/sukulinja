// Linking a GEDCOM's media to what holds them: a person, a family, an
// event or a citation.

import type { Scope } from '@/common/types';

import type { LineReader } from './gedcom-lines';
import type { GedNode } from './gedcom-parser';
import type { ImportStatements } from './import-statements';
import { mediaRefsOf, objectsOf } from './media-refs';
import type { MediaRef, ObjectRecords } from './media-refs';

export type MediaResolver = (originalRelpath: string) => string | null;

type MediaScope = Scope | 'fact' | 'citation';

// The media one line holds, the one marked primary first: GEDCOM 7 takes
// the first as the preferred one. Its OBJEs are numbered in that order too,
// as an export writes them.
function primaryFirst(refs: MediaRef[]) {
  const ordered = [
    ...refs.filter((r) => r.primary),
    ...refs.filter((r) => !r.primary)
  ];
  const objects = new Map<number, number>();
  return ordered.map((r, order) => {
    if (!objects.has(r.object)) objects.set(r.object, objects.size);
    return { ...r, order, objectOrder: objects.get(r.object)! };
  });
}

interface MediaLinker {
  sql: ImportStatements;
  lines: LineReader;
  // Called for each media row and each link written.
  count: (kind: 'media' | 'mediaLinks') => void;
  resolve: MediaResolver;
  records: ObjectRecords;
  importNotes: (node: GedNode, owner: 'media_link', ownerId: number) => void;
}

export function mediaLinker({
  sql,
  lines,
  count,
  resolve,
  records,
  importNotes
}: MediaLinker) {
  const { use, take, takeAll } = lines;

  function resolveMediaId(
    storedPath: string,
    originalPath: string,
    format: string | null
  ) {
    const existing = sql.getMediaByPath.get(storedPath);
    if (existing !== null) return existing.id;
    const res = sql.insertMedia.get({
      $file_path: storedPath,
      $format: format,
      $original_path: originalPath
    })!;
    count('media');
    return res.id;
  }

  // A media row for the stored file, which files with the same content
  // share, and a link to it from what holds it. Null when the file couldn't
  // be stored, which the media ingest reports.
  function importMediaLink(
    ref: MediaRef & { objectOrder: number },
    scope: MediaScope,
    scopeId: number
  ) {
    const storedPath = resolve(ref.path);
    if (storedPath === null) return null;
    const mediaId = resolveMediaId(storedPath, ref.path, ref.format);
    const { crop } = ref;
    const res = sql.insertMediaLink.run({
      $media_id: mediaId,
      $scope_type: scope,
      $scope_id: scopeId,
      $object_order: ref.objectOrder,
      $title: ref.title,
      $crop_top: crop.top,
      $crop_left: crop.left,
      $crop_width: crop.width,
      $crop_height: crop.height,
      $sort_order: ref.order
    });
    count('mediaLinks');
    return Number(res.lastInsertRowid);
  }

  function markCrop(holder: GedNode) {
    const crop = take(holder, 'CROP');
    if (crop === undefined) return;
    for (const side of ['TOP', 'LEFT', 'HEIGHT', 'WIDTH']) take(crop, side);
  }

  // The lines mediaRefsOf reads.
  function markMediaLines(link: GedNode, files: GedNode) {
    use(link);
    use(files);
    take(link, 'TITL');
    markCrop(link);
    for (const file of takeAll(files, 'FILE')) {
      take(file, 'FORM');
      take(file, 'TITL');
      markCrop(file);
    }
  }

  // An OBJE record's notes are kept once, with the first link to it.
  const noted = new Set<GedNode>();

  // An OBJE's notes go with the first of its files that was stored.
  function importMediaLinks(
    holder: GedNode,
    scope: MediaScope,
    scopeId: number
  ) {
    const objects = objectsOf(holder, records);
    for (const { link, files } of objects) markMediaLines(link, files);
    const firstLink = new Map<number, number>();
    for (const ref of primaryFirst(mediaRefsOf(holder, records))) {
      const linkId = importMediaLink(ref, scope, scopeId);
      if (linkId !== null && !firstLink.has(ref.object)) {
        firstLink.set(ref.object, linkId);
      }
    }
    objects.forEach(({ files }, object) => {
      const linkId = firstLink.get(object);
      if (linkId === undefined || noted.has(files)) return;
      noted.add(files);
      importNotes(files, 'media_link', linkId);
    });
  }

  return importMediaLinks;
}
