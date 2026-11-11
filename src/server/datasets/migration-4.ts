// Schema 4: the Changes made on a Tag before schema 3, and those a
// re-import put back on their person, name their Photo again, found by the
// file name the Change gives: the one Photo of that name, else the one of
// that name the person is in. One whose Photo is gone, or can't be told
// apart, stays on its person.

import type { Database } from 'bun:sqlite';

import { photoName } from '../photos';
import type { Migration } from './migrations';

const ON_PHOTO = new Set(['tag', 'untag', 'portrait']);

function up(db: Database) {
  const changes = db
    .query<{ id: number; what: string; person_id: number }, []>(
      `SELECT id, what, person_id FROM changes
       WHERE media_id IS NULL AND person_id IS NOT NULL`
    )
    .all();
  const media = db
    .query<{ id: number; original_path: string | null; file_path: string }, []>(
      'SELECT id, original_path, file_path FROM media'
    )
    .all();
  const named = Map.groupBy(media, (m) => photoName(m));
  const linked = db.prepare<{ id: number }, [number, number]>(
    `SELECT id FROM media_links
     WHERE media_id = ? AND scope_type = 'person' AND scope_id = ? LIMIT 1`
  );
  const name = db.prepare<null, [number, number]>(
    'UPDATE changes SET media_id = ? WHERE id = ?'
  );
  for (const change of changes) {
    const what = JSON.parse(change.what) as { kind?: string; photo?: string };
    if (!ON_PHOTO.has(what.kind ?? '') || what.photo === undefined) continue;
    const alike = named.get(what.photo) ?? [];
    const theirs =
      alike.length > 1
        ? alike.filter((m) => linked.get(m.id, change.person_id) !== null)
        : alike;
    if (theirs.length === 1) name.run(theirs[0]!.id, change.id);
  }
}

export const CHANGES_FIND_THEIR_PHOTO: Migration = { to: 4, up };
