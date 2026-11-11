// The dataset's Tags carried into a re-import (ADR-0017): each put back on
// the same person, in the same Photo, found by the path the export gave
// its file, where it stands in for any Box the export gives them there.
// One the new import has already, from a GEDZIP, isn't made twice; one
// whose person or Photo is gone is lost.

import type { Database } from 'bun:sqlite';

import { photoName } from '../photos';
import type { Owner } from './merge-records';
import { rowsOf } from './merge-records';

interface TagMerge {
  stored: Database;
  fresh: Database;
  matchOf: (owner: Owner) => number | null;
  describe: (owner: Owner) => string;
}

export function carryTags({ stored, fresh, matchOf, describe }: TagMerge) {
  // From a schema before Tags, none.
  const tags = rowsOf(
    stored,
    `SELECT ml.scope_id AS person_id, ml.crop_left, ml.crop_top,
       ml.crop_width, ml.crop_height, m.file_path, m.original_path
     FROM media_links ml JOIN media m ON m.id = ml.media_id
     WHERE ml.added_in_app = 1 ORDER BY ml.id`
  );
  const mediaOf = fresh.prepare<{ id: number }, [string, string]>(
    `SELECT id FROM media WHERE original_path = ? OR file_path = ?
     ORDER BY original_path = ?1 DESC LIMIT 1`
  );
  const tagged = fresh.prepare<{ id: number }, [number, number]>(
    `SELECT id FROM media_links
     WHERE media_id = ? AND scope_type = 'person' AND scope_id = ?
       AND added_in_app = 1`
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

  let kept = 0;
  const lost: string[] = [];
  for (const t of tags) {
    const owner: Owner = { kind: 'person', id: Number(t.person_id) };
    const person = matchOf(owner);
    const filePath = String(t.file_path);
    const original = t.original_path === null ? null : String(t.original_path);
    const media = mediaOf.get(original ?? filePath, filePath);
    if (person === null || media === null) {
      const photo = photoName({ original_path: original, file_path: filePath });
      lost.push(`${describe(owner)}: ${photo} (a Tag)`);
      continue;
    }
    kept += 1;
    if (tagged.get(media.id, person) !== null) continue;
    const { sort, object } = next.get(person)!;
    insert.run(
      media.id,
      person,
      object,
      Number(t.crop_left),
      Number(t.crop_top),
      Number(t.crop_width),
      Number(t.crop_height),
      sort
    );
  }
  return { kept, lost };
}
