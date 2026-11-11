// Schema 2 (ADR-0020): each person's Box the import gave, a media link's
// CROP, becomes their Tag on the Photo, and the link stays without it.
// One who already has a Tag there keeps it, as it stood in for the
// import's Box.

import type { Database } from 'bun:sqlite';

import type { Migration } from './migrations';

function up(db: Database) {
  const boxed = db
    .query<
      {
        id: number;
        media_id: number;
        person_id: number;
        crop_top: number;
        crop_left: number;
        crop_width: number;
        crop_height: number;
        sort_order: number;
      },
      []
    >(
      `SELECT id, media_id, scope_id AS person_id, crop_top, crop_left,
         crop_width, crop_height, sort_order
       FROM media_links
       WHERE scope_type = 'person' AND added_in_app = 0
         AND crop_top IS NOT NULL AND crop_left IS NOT NULL
         AND crop_width IS NOT NULL AND crop_height IS NOT NULL
       ORDER BY id`
    )
    .all();
  const tagged = db.prepare<{ id: number }, [number, number]>(
    `SELECT id FROM media_links
     WHERE media_id = ? AND scope_type = 'person' AND scope_id = ?
       AND added_in_app = 1`
  );
  const nextObject = db.prepare<{ object: number }, [number]>(
    `SELECT COALESCE(MAX(object_order) + 1, 0) AS object
     FROM media_links WHERE scope_type = 'person' AND scope_id = ?`
  );
  const insert = db.prepare<
    null,
    [number, number, number, number, number, number, number, number]
  >(
    `INSERT INTO media_links (media_id, scope_type, scope_id, object_order,
       crop_top, crop_left, crop_width, crop_height, sort_order, added_in_app)
     VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?, 1)`
  );
  const unbox = db.prepare<null, [number]>(
    `UPDATE media_links SET crop_top = NULL, crop_left = NULL,
       crop_width = NULL, crop_height = NULL
     WHERE id = ?`
  );
  for (const link of boxed) {
    if (tagged.get(link.media_id, link.person_id) === null) {
      insert.run(
        link.media_id,
        link.person_id,
        nextObject.get(link.person_id)!.object,
        link.crop_top,
        link.crop_left,
        link.crop_width,
        link.crop_height,
        link.sort_order
      );
    }
    unbox.run(link.id);
  }
}

export const BOXES_BECOME_TAGS: Migration = { to: 2, up };
