// A GEDCOM's media in the database: each linked to what holds it (a
// person, a family, an event or a citation), and the Photos linked to no
// one kept on their own. A person's Box is their Tag (ADR-0020): a
// record noting it was added in the app holds a Tag (ADR-0017), and
// another's CROP becomes one beside its link.

import { ADDED_IN_APP } from '../gedcom/astia-links';
import { mediaRefsOf, objectsOf } from '../gedcom/media-refs';
import type {
  MediaRef,
  ObjectRecords,
  UnlinkedPhoto
} from '../gedcom/media-refs';
import type { GedNode } from '../gedcom/parser';
import type { ImportStatements, Scope } from './statements';
import type { LineReader } from './unstored';

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

  function insertLink(
    link: {
      mediaId: number;
      scope: MediaScope;
      scopeId: number;
      objectOrder: number;
      title: string | null;
      order: number;
      tag: boolean;
    },
    crop: MediaRef['crop'] | null
  ) {
    const res = sql.insertMediaLink.run({
      $media_id: link.mediaId,
      $scope_type: link.scope,
      $scope_id: link.scopeId,
      $object_order: link.objectOrder,
      $title: link.title,
      $crop_top: crop?.top ?? null,
      $crop_left: crop?.left ?? null,
      $crop_width: crop?.width ?? null,
      $crop_height: crop?.height ?? null,
      $sort_order: link.order,
      $added_in_app: link.tag ? 1 : 0
    });
    count('mediaLinks');
    return Number(res.lastInsertRowid);
  }

  // A media row for the stored file, which files with the same content
  // share, and a link to it from what holds it. A person's Box is their
  // Tag (ADR-0020): on a Tag's record the link is the Tag, else the link
  // stays without it and the Tag is `extra`, made once the holder's own
  // OBJEs are in. Null when the file couldn't be stored, which the media
  // ingest reports.
  function importMediaLink(
    ref: MediaRef & { objectOrder: number },
    { scope, scopeId }: { scope: MediaScope; scopeId: number },
    tagRecord: boolean,
    extra: (tag: (objectOrder: number) => void) => void
  ) {
    const storedPath = resolve(ref.path);
    if (storedPath === null) return null;
    const mediaId = resolveMediaId(storedPath, ref.path, ref.format);
    const { crop } = ref;
    const link = {
      mediaId,
      scope,
      scopeId,
      objectOrder: ref.objectOrder,
      title: ref.title,
      order: ref.order,
      tag: false
    };
    if (scope !== 'person') return insertLink(link, crop);
    const boxed = Object.values(crop).every((side) => side !== null);
    const tag = boxed && takeTag(mediaId, scopeId);
    if (tagRecord) return insertLink({ ...link, tag }, tag ? crop : null);
    if (tag) {
      extra((objectOrder) => {
        insertLink({ ...link, objectOrder, title: null, tag: true }, crop);
      });
    }
    return insertLink(link, null);
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
  // The records noting they're a Tag's, that note taken off them.
  const tagRecords = new Set<GedNode>();
  // A person is tagged once in a Photo, by "<media>:<person>".
  const tags = new Set<string>();

  function takeTag(mediaId: number, personId: number) {
    const key = `${mediaId}:${personId}`;
    if (tags.has(key)) return false;
    tags.add(key);
    return true;
  }

  // Whether the record is a Tag's: its note saying so is used, and taken
  // off it so it's not kept as a note.
  function isTagRecord(files: GedNode) {
    const at = files.children.findIndex(
      (c) => c.tag === 'NOTE' && c.value === ADDED_IN_APP
    );
    if (at >= 0) {
      use(files.children[at]!);
      files.children.splice(at, 1);
      tagRecords.add(files);
    }
    return tagRecords.has(files);
  }

  // An OBJE's notes go with the first of its files that was stored.
  function importMediaLinks(
    holder: GedNode,
    scope: MediaScope,
    scopeId: number
  ) {
    const objects = objectsOf(holder, records);
    for (const { link, files } of objects) markMediaLines(link, files);
    const tagged = objects.map(({ files }) => isTagRecord(files));
    const firstLink = new Map<number, number>();
    const extras: Array<(objectOrder: number) => void> = [];
    for (const ref of primaryFirst(mediaRefsOf(holder, records))) {
      const tag = tagged[ref.object] ?? false;
      const holderOf = { scope, scopeId };
      const linkId = importMediaLink(ref, holderOf, tag, (t) => {
        extras.push(t);
      });
      if (linkId !== null && !firstLink.has(ref.object)) {
        firstLink.set(ref.object, linkId);
      }
    }
    extras.forEach((made, i) => {
      made(objects.length + i);
    });
    objects.forEach(({ files }, object) => {
      const linkId = firstLink.get(object);
      if (linkId === undefined || noted.has(files)) return;
      noted.add(files);
      importNotes(files, 'media_link', linkId);
    });
  }

  // A media row for each stored file of a Photo linked to no one, and no
  // link. Its record's other lines, a TITL or NOTE, have nowhere to go.
  function importUnlinkedPhotos(photos: UnlinkedPhoto[]) {
    for (const { record, files } of photos) {
      use(record);
      for (const { file, path, format } of files) {
        use(file);
        take(file, 'FORM');
        const storedPath = resolve(path);
        if (storedPath !== null) resolveMediaId(storedPath, path, format);
      }
    }
  }

  return { importMediaLinks, importUnlinkedPhotos };
}
