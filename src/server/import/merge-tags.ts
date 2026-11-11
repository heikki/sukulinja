// The dataset's Tags carried into a re-import (ADR-0020): each put back on
// the same person, in the same Photo, found by the path the export gave
// its file. Where the dataset had the person in the Photo already, with a
// Tag or not, the new import's Box for them is dropped, so a Tag moved or
// taken back stays so; a Box on a link new to the dataset is kept as its
// Tag. A database from before schema 2 has its Boxes on the import's links,
// which are carried the same way. One whose person or Photo is gone is
// lost.

import type { Database } from 'bun:sqlite';

import { photoName } from '../photos';
import type { Owner, Row } from './merge-records';
import { rowsOf } from './merge-records';

interface TagMerge {
  stored: Database;
  fresh: Database;
  matchOf: (owner: Owner) => number | null;
  describe: (owner: Owner) => string;
}

// The new database's id for each of the dataset's Photos it has, found by
// the path its file was imported from, else its stored one.
export function photoMatcher(stored: Database, fresh: Database) {
  const pathsOf = stored.prepare<
    { original_path: string | null; file_path: string },
    [number]
  >('SELECT original_path, file_path FROM media WHERE id = ?');
  const mediaOf = fresh.prepare<{ id: number }, [string, string]>(
    `SELECT id FROM media WHERE original_path = ? OR file_path = ?
     ORDER BY original_path = ?1 DESC LIMIT 1`
  );
  return (storedId: number) => {
    const m = pathsOf.get(storedId);
    if (m === null) return null;
    return mediaOf.get(m.original_path ?? m.file_path, m.file_path)?.id ?? null;
  };
}

export function carryTags({ stored, fresh, matchOf, describe }: TagMerge) {
  // Every person's link to a Photo, their Box on it first: a Tag's, else,
  // from before schema 2, the import's CROP. A database from before Tags
  // has only the CROPs.
  function linksIn(tagFirst: string) {
    return rowsOf(
      stored,
      `SELECT ml.scope_id AS person_id, ml.media_id, ml.crop_left,
         ml.crop_top, ml.crop_width, ml.crop_height, m.file_path,
         m.original_path
       FROM media_links ml JOIN media m ON m.id = ml.media_id
       WHERE ml.scope_type = 'person'
       ORDER BY ${tagFirst} ml.crop_top IS NULL, ml.id`
    );
  }
  const tagged = linksIn('ml.added_in_app DESC,');
  const links = tagged.length > 0 ? tagged : linksIn('');
  const photoIn = photoMatcher(stored, fresh);
  const tagOf = fresh.prepare<{ id: number }, [number, number]>(
    `SELECT id FROM media_links
     WHERE media_id = ? AND scope_type = 'person' AND scope_id = ?
       AND added_in_app = 1`
  );
  const drop = fresh.prepare<null, [number]>(
    'DELETE FROM media_links WHERE id = ?'
  );
  const move = fresh.prepare<null, [number, number, number, number, number]>(
    `UPDATE media_links
     SET crop_left = ?, crop_top = ?, crop_width = ?, crop_height = ?
     WHERE id = ?`
  );
  const next = fresh.prepare<{ sort: number; object: number }, [number]>(
    `SELECT COALESCE(MAX(sort_order) + 1, 0) AS sort,
       COALESCE(MAX(object_order) + 1, 0) AS object
     FROM media_links WHERE scope_type = 'person' AND scope_id = ?`
  );
  const insert = fresh.prepare<
    null,
    [number, number, number, number, number, number, number, number]
  >(
    `INSERT INTO media_links (media_id, scope_type, scope_id, object_order,
       crop_left, crop_top, crop_width, crop_height, sort_order, added_in_app)
     VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?, 1)`
  );

  function photoOf(l: Row) {
    const original = l.original_path === null ? null : String(l.original_path);
    return photoName({
      original_path: original,
      file_path: String(l.file_path)
    });
  }

  // The person's Tag in the Photo, at the dataset's Box, or none.
  function put(mediaId: number, person: number, box: Row | null) {
    const had = tagOf.get(mediaId, person);
    if (box === null) {
      if (had !== null) drop.run(had.id);
      return;
    }
    const sides = [
      Number(box.crop_left),
      Number(box.crop_top),
      Number(box.crop_width),
      Number(box.crop_height)
    ] as const;
    if (had !== null) {
      move.run(...sides, had.id);
      return;
    }
    const { sort, object } = next.get(person)!;
    insert.run(mediaId, person, object, ...sides, sort);
  }

  let kept = 0;
  const lost: string[] = [];
  // Each person in each Photo once, by "<stored media>:<stored person>".
  const seen = new Set<string>();
  for (const l of links) {
    const key = `${String(l.media_id)}:${String(l.person_id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const owner: Owner = { kind: 'person', id: Number(l.person_id) };
    const boxed = l.crop_top !== null;
    const person = matchOf(owner);
    const media = photoIn(Number(l.media_id));
    if (person === null || media === null) {
      if (boxed) lost.push(`${describe(owner)}: ${photoOf(l)} (a Tag)`);
      continue;
    }
    if (boxed) kept += 1;
    put(media, person, boxed ? l : null);
  }
  return { kept, lost };
}
