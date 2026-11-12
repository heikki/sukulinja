import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NewChange } from '@/common/types';

import { openChanges } from '../changes/changes';
import { openDb } from '../datasets/db';
import { openPhotoFiles } from './files';
import { createPhotos } from './photos';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

let mediaDir = '';

beforeEach(async () => {
  mediaDir = await mkdtemp(join(tmpdir(), 'photo-files-'));
});

afterEach(async () => {
  await rm(mediaDir, { recursive: true, force: true });
});

// Two people and a group photo of both, which the import gave with a note
// on 1's link, a Tag of 2, and a family link; and a portrait of 1 after it.
async function dataset() {
  const db = openDb(':memory:');
  db.run(`INSERT INTO persons (id, xref) VALUES (1, '@I1@'), (2, '@I2@')`);
  db.run(`INSERT INTO media (id, file_path, format, original_path) VALUES
    (10, 'group.jpg', 'image/jpeg', 'Ryhm%C3%A4.jpg'),
    (11, 'portrait.jpg', 'image/jpeg', 'portrait.jpg')`);
  db.run(`INSERT INTO media_links
    (id, media_id, scope_type, scope_id, sort_order, crop_top, crop_left, crop_width, crop_height, added_in_app)
    VALUES
    (1, 10, 'person', 1, 0, NULL, NULL, NULL, NULL, 0),
    (2, 10, 'person', 2, 0, 5, 40, 30, 35, 1),
    (3, 10, 'family', 1, 0, NULL, NULL, NULL, NULL, 0),
    (4, 11, 'person', 1, 1, NULL, NULL, NULL, NULL, 0)`);
  db.run(
    `INSERT INTO notes (owner_type, owner_id, text) VALUES ('media_link', 1, 'Kesä 1920')`
  );
  await writeFile(join(mediaDir, 'group.jpg'), 'jpeg');
  const changes: NewChange[] = [];
  const photos = createPhotos(db);
  const files = openPhotoFiles(db, mediaDir, photos, (c) => {
    changes.push(c);
  });
  return { db, photos, files, changes };
}

test('adds a picture as a Photo linked to no one, listed first', async () => {
  const { files, photos, changes } = await dataset();
  const added = await files.add('Mummola 1950.JPG', JPEG);
  if ('refused' in added) throw new Error(added.refused);
  expect(added.already).toBe(false);
  expect(added.photo.people).toEqual([]);
  expect(added.photo.path).toMatch(/^[0-9a-f]{12}\.jpg$/u);
  expect(await readdir(mediaDir)).toContain(added.photo.path);
  expect(photos.all()[0]).toEqual(added.photo);
  expect(changes).toEqual([
    {
      on: null,
      what: { kind: 'photo', did: 'add', photo: 'Mummola 1950.JPG' }
    }
  ]);
});

test('keeps its file name for the export', async () => {
  const { files, db } = await dataset();
  const added = await files.add('Kesä #1.jpg', JPEG);
  if ('refused' in added) throw new Error(added.refused);
  const row = db
    .query<{ original_path: string; format: string }, [number]>(
      'SELECT original_path, format FROM media WHERE id = ?'
    )
    .get(added.photo.id);
  expect(row).toEqual({
    original_path: 'Kes%C3%A4%20%231.jpg',
    format: 'image/jpeg'
  });
});

test('the same file added again is the Photo the dataset has', async () => {
  const { files, photos, changes } = await dataset();
  const first = await files.add('a.jpg', JPEG);
  const again = await files.add('b.jpg', JPEG);
  if ('refused' in first || 'refused' in again) throw new Error('refused');
  expect(again).toEqual({ photo: first.photo, already: true });
  expect(photos.all()).toHaveLength(3);
  expect(changes).toHaveLength(1);
});

test("refuses what isn't a picture", async () => {
  const { files, photos } = await dataset();
  expect(await files.add('kirje.pdf', JPEG)).toEqual({
    refused: "kirje.pdf isn't a picture",
    missing: false
  });
  expect(await files.add('README', JPEG)).toMatchObject({ missing: false });
  expect(photos.all()).toHaveLength(2);
});

test('deletes a Photo with its links, their notes and its file', async () => {
  const { db, files, photos, changes } = await dataset();
  expect(await files.remove(10)).toEqual([1, 2]);
  expect(photos.photo(10)).toBeNull();
  expect(photos.ofPerson(1).map((p) => p.id)).toEqual([11]);
  expect(photos.ofPerson(2)).toEqual([]);
  const left = db
    .query<{ n: number }, []>(
      `SELECT (SELECT COUNT(*) FROM media_links WHERE media_id = 10)
         + (SELECT COUNT(*) FROM notes) AS n`
    )
    .get();
  expect(left).toEqual({ n: 0 });
  expect(await readdir(mediaDir)).toEqual([]);
  expect(changes).toEqual([
    {
      on: null,
      what: { kind: 'photo', did: 'delete', photo: 'Ryhmä.jpg', people: 2 }
    }
  ]);
});

test("a Tag's Change stays on its person once the Photo is gone", async () => {
  const { db, files } = await dataset();
  const changes = openChanges(db, {
    citationOf: () => null,
    replaced: async () => await Promise.resolve(false)
  });
  changes.add({
    on: { personId: 2, photoId: 10 },
    what: { kind: 'tag', photo: 'Ryhmä.jpg', moved: false }
  });
  await files.remove(10);
  const row = db
    .query<{ person_id: number; media_id: number | null }, []>(
      'SELECT person_id, media_id FROM changes'
    )
    .get();
  expect(row).toEqual({ person_id: 2, media_id: null });
});

test("deleting a Photo that isn't there is refused", async () => {
  const { files } = await dataset();
  expect(await files.remove(99)).toEqual({
    refused: 'photo not found',
    missing: true
  });
});
