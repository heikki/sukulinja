// Tagging people in a Photo (ADR-0017, ADR-0020): a Tag is the person's
// media link to it with their Box, and every Box is a Tag. Making, moving
// and taking back a Tag is a Change on the person. Taking it back leaves
// them linked to the Photo without a Box where the import linked them.
// A Tag's Photo is chosen as the person's portrait by putting the Tag
// first among their links, as GEDCOM 7 takes the first as preferred.

import type { Database } from 'bun:sqlite';

import type { Box, NewChange, PhotoRow } from '@/common/types';

import type { Photos } from './photos';

// What a Tag couldn't be: a 404 for what isn't there, else a 400.
export interface TagRefused {
  refused: string;
  missing: boolean;
}

// The Photo's file name, as the Changes name it.
export function photoName(m: {
  original_path: string | null;
  file_path: string;
}) {
  const path = (m.original_path ?? m.file_path).split(/[?#]/u)[0]!;
  const name =
    path
      .split('/')
      .filter((p) => p !== '')
      .at(-1) ?? path;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function isBox(box: Box) {
  const sides = [box.left, box.top, box.width, box.height];
  return (
    sides.every((n) => Number.isInteger(n) && n >= 0) &&
    box.width > 0 &&
    box.height > 0
  );
}

export function openTags(
  db: Database,
  photos: Photos,
  changed: (change: NewChange) => void
) {
  const mediaOf = db.prepare<
    { original_path: string | null; file_path: string },
    [number]
  >('SELECT original_path, file_path FROM media WHERE id = ?');
  const personExists = db.prepare<{ id: number }, [number]>(
    'SELECT id FROM persons WHERE id = ?'
  );
  const tagOf = db.prepare<{ id: number }, [number, number]>(
    `SELECT id FROM media_links
     WHERE media_id = ? AND scope_type = 'person' AND scope_id = ?
       AND added_in_app = 1`
  );
  // After the person's other photos, in an OBJE of its own.
  const next = db.prepare<{ sort: number; object: number }, [number]>(
    `SELECT COALESCE(MAX(sort_order) + 1, 0) AS sort,
       COALESCE(MAX(object_order) + 1, 0) AS object
     FROM media_links WHERE scope_type = 'person' AND scope_id = ?`
  );
  const insert = db.prepare<
    null,
    [number, number, number, number, number, number, number, number]
  >(
    `INSERT INTO media_links (media_id, scope_type, scope_id, object_order,
       crop_left, crop_top, crop_width, crop_height, sort_order, added_in_app)
     VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?, 1)`
  );
  const move = db.prepare<null, [number, number, number, number, number]>(
    `UPDATE media_links
     SET crop_left = ?, crop_top = ?, crop_width = ?, crop_height = ?
     WHERE id = ?`
  );
  const remove = db.prepare<null, [number]>(
    'DELETE FROM media_links WHERE id = ?'
  );
  // The person's links numbered again, the link first and the rest as
  // they were.
  const toFront = db.prepare<null, [number, number]>(
    `UPDATE media_links SET sort_order = ranked.n
     FROM (
       SELECT id,
         ROW_NUMBER() OVER (ORDER BY id = ?1 DESC, sort_order, id) - 1 AS n
       FROM media_links WHERE scope_type = 'person' AND scope_id = ?2
     ) AS ranked
     WHERE media_links.id = ranked.id`
  );

  // The Photo and person, or why they can't be tagged.
  function found(
    photoId: number,
    personId: number
  ): TagRefused | { name: string } {
    const media = photos.photo(photoId) === null ? null : mediaOf.get(photoId);
    if (media === null) return { refused: 'photo not found', missing: true };
    if (personExists.get(personId) === null) {
      return { refused: 'person not found', missing: true };
    }
    return { name: photoName(media) };
  }

  return {
    // Tags the person in the Photo at `box`, or moves their Tag there: the
    // Photo as it is now.
    tag(photoId: number, personId: number, box: Box): PhotoRow | TagRefused {
      if (!isBox(box)) return { refused: 'expected a box', missing: false };
      const at = found(photoId, personId);
      if ('refused' in at) return at;
      const { left, top, width, height } = box;
      const had = tagOf.get(photoId, personId);
      if (had === null) {
        const { sort, object } = next.get(personId)!;
        insert.run(photoId, personId, object, left, top, width, height, sort);
      } else {
        move.run(left, top, width, height, had.id);
      }
      changed({
        on: { personId, photoId },
        what: { kind: 'tag', photo: at.name, moved: had !== null }
      });
      return photos.photo(photoId)!;
    },

    // Takes back the person's Tag in the Photo: the Photo as it is now.
    // The Photo stays, linked to no one if nothing else links it.
    untag(photoId: number, personId: number): PhotoRow | TagRefused {
      const at = found(photoId, personId);
      if ('refused' in at) return at;
      const had = tagOf.get(photoId, personId);
      if (had === null) return { refused: 'tag not found', missing: true };
      remove.run(had.id);
      changed({
        on: { personId, photoId },
        what: { kind: 'untag', photo: at.name }
      });
      return photos.photo(photoId)!;
    },

    // Makes the Photo the person's portrait, cropped to their Tag's Box:
    // the Photo as it is now.
    choosePortrait(photoId: number, personId: number): PhotoRow | TagRefused {
      const at = found(photoId, personId);
      if ('refused' in at) return at;
      const had = tagOf.get(photoId, personId);
      if (had === null) return { refused: 'tag not found', missing: true };
      toFront.run(had.id, personId);
      changed({
        on: { personId, photoId },
        what: { kind: 'portrait', photo: at.name }
      });
      return photos.photo(photoId)!;
    }
  };
}

export type Tags = ReturnType<typeof openTags>;
