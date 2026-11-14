// Adding a picture from disk as a Photo, and deleting a Photo with its
// file. A Photo added is linked to no one until someone is tagged in it.
// A Photo deleted takes every link to it with it, Tags and the import's
// links alike (ADR-0021: nothing brings it back), and the portrait of
// anyone it was falls to their next Photo. Each is a Change on nothing,
// naming the Photo by its file name, as the Photo is gone or on no one.

import type { Database } from 'bun:sqlite';
import { extname } from 'node:path';

import type { AddedPhoto } from '@/common/types';

import type { NewChange } from '../changes/changes';
import { removeMediaFile, storeMediaFile } from '../datasets/media-files';
import { mimeOf } from '../gedcom/media-refs';
import type { Photos } from './photos';
import { photoName } from './tags';

// The pictures a Photo can be: what the Photo viewer shows.
const PICTURES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif'
]);

// What couldn't be added or deleted: a 404 for what isn't there, else a
// 400.
export interface PhotoRefused {
  refused: string;
  missing: boolean;
}

export function openPhotoFiles(
  db: Database,
  mediaDir: string,
  photos: Photos,
  changed: (change: NewChange) => void
) {
  const stored = db.prepare<{ id: number }, [string]>(
    'SELECT id FROM media WHERE file_path = ?'
  );
  const insert = db.prepare<{ id: number }, [string, string, string]>(
    `INSERT INTO media (file_path, format, original_path) VALUES (?, ?, ?)
     RETURNING id`
  );
  const mediaOf = db.prepare<
    { file_path: string; original_path: string | null },
    [number]
  >('SELECT file_path, original_path FROM media WHERE id = ?');
  const removeLinkNotes = db.prepare<null, [number]>(
    `DELETE FROM notes WHERE owner_type = 'media_link' AND owner_id IN
       (SELECT id FROM media_links WHERE media_id = ?)`
  );
  // Its links go with it (ON DELETE CASCADE), and its Changes stay on
  // their person (ON DELETE SET NULL).
  const remove = db.prepare<null, [number]>('DELETE FROM media WHERE id = ?');

  return {
    // Adds the picture, `name` its file name, as a Photo linked to no
    // one, or finds the one the dataset has of the same file.
    async add(
      name: string,
      bytes: Uint8Array
    ): Promise<AddedPhoto | PhotoRefused> {
      const ext = extname(name).toLowerCase();
      const format = mimeOf(ext.slice(1));
      if (format === null || !PICTURES.has(format)) {
        return { refused: `${name} isn't a picture`, missing: false };
      }
      const path = await storeMediaFile(bytes, ext, mediaDir);
      const had = stored.get(path);
      if (had !== null) {
        return { photo: photos.photo(had.id)!, already: true };
      }
      const { id } = db.transaction(() => {
        const row = insert.get(path, format, encodeURIComponent(name))!;
        changed({ on: null, what: { kind: 'photo', did: 'add', photo: name } });
        return row;
      })();
      return { photo: photos.photo(id)!, already: false };
    },

    // Deletes the Photo, its links and its file: the people who were on
    // it.
    async remove(photoId: number): Promise<number[] | PhotoRefused> {
      const photo = photos.photo(photoId);
      const media = photo === null ? null : mediaOf.get(photoId);
      if (photo === null || media === null) {
        return { refused: 'photo not found', missing: true };
      }
      const people = photo.people.map((p) => p.personId);
      db.transaction(() => {
        removeLinkNotes.run(photoId);
        remove.run(photoId);
        changed({
          on: null,
          what: {
            kind: 'photo',
            did: 'delete',
            photo: photoName(media),
            people: people.length
          }
        });
      })();
      await removeMediaFile(media.file_path, mediaDir);
      return people;
    }
  };
}

export type PhotoFiles = ReturnType<typeof openPhotoFiles>;
