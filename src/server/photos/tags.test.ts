import { expect, test } from 'bun:test';

import type { NewChange } from '@/common/types';

import { openDb } from '../datasets/db';
import { createTree } from '../tree';
import { createPhotos } from './photos';
import { openTags, photoName } from './tags';

const BOX = { left: 10, top: 20, width: 30, height: 40 };

// Three people; a group photo the import links 1 to without a Box and 2
// with one, as their Tag beside the link, and a PDF.
function dataset() {
  const db = openDb(':memory:');
  db.run(
    `INSERT INTO persons (id, xref) VALUES (1, '@I1@'), (2, '@I2@'), (3, '@I3@')`
  );
  db.run(`INSERT INTO media (id, file_path, format, original_path) VALUES
    (10, 'abc.jpg', 'image/jpeg', 'photos/Kes%C3%A4%20talo.jpg'),
    (12, 'letter.pdf', 'application/pdf', 'letter.pdf')`);
  db.run(`INSERT INTO media_links
    (media_id, scope_type, scope_id, sort_order, crop_top, crop_left, crop_width, crop_height, added_in_app)
    VALUES
    (10, 'person', 1, 0, NULL, NULL, NULL, NULL, 0),
    (10, 'person', 2, 0, NULL, NULL, NULL, NULL, 0),
    (10, 'person', 2, 0, 5, 40, 30, 35, 1)`);
  const changes: NewChange[] = [];
  const photos = createPhotos(db);
  const tags = openTags(db, photos, (c) => {
    changes.push(c);
  });
  return { db, photos, tags, changes };
}

test('tags someone in a Photo, and they have it among their Photos', () => {
  const { tags, photos, changes } = dataset();
  const photo = tags.tag(10, 3, BOX);
  expect(photo).toEqual({
    id: 10,
    path: 'abc.jpg',
    people: [
      { personId: 1, box: null },
      {
        personId: 2,
        box: { left: 40, top: 5, width: 30, height: 35 }
      },
      { personId: 3, box: BOX }
    ]
  });
  expect(photos.ofPerson(3).map((p) => p.id)).toEqual([10]);
  expect(changes).toEqual([
    {
      on: { personId: 3 },
      what: { kind: 'tag', photo: 'Kesä talo.jpg', moved: false }
    }
  ]);
});

test('a Tag gives someone the import linked without a Box their Box', () => {
  const { tags } = dataset();
  const photo = tags.tag(10, 1, BOX);
  expect('refused' in photo ? null : photo.people[0]).toEqual({
    personId: 1,
    box: BOX
  });
});

test("moves a Tag, the app's or the import's", () => {
  const { tags, changes } = dataset();
  tags.tag(10, 3, BOX);
  const moved = { ...BOX, left: 50 };
  const photo = tags.tag(10, 3, moved);
  expect('refused' in photo ? null : photo.people[2]?.box).toEqual(moved);
  expect(changes[1]?.what).toEqual({
    kind: 'tag',
    photo: 'Kesä talo.jpg',
    moved: true
  });
  const edited = tags.tag(10, 2, BOX);
  expect('refused' in edited ? null : edited.people[1]).toEqual({
    personId: 2,
    box: BOX
  });
});

test("taking back the import's Tag leaves them linked, with no Box", () => {
  const { tags } = dataset();
  const photo = tags.untag(10, 2);
  expect('refused' in photo ? null : photo.people).toEqual([
    { personId: 1, box: null },
    { personId: 2, box: null }
  ]);
});

test('takes back a Tag; the Photo stays, linked to no one if so', () => {
  const { db, tags, photos, changes } = dataset();
  db.run('DELETE FROM media_links');
  tags.tag(10, 3, BOX);
  expect(tags.untag(10, 3)).toEqual({ id: 10, path: 'abc.jpg', people: [] });
  expect(photos.photo(10)).not.toBeNull();
  expect(changes.at(-1)).toEqual({
    on: { personId: 3 },
    what: { kind: 'untag', photo: 'Kesä talo.jpg' }
  });
  expect(tags.untag(10, 3)).toEqual({
    refused: 'tag not found',
    missing: true
  });
});

test('refuses what isn’t there, a PDF and a Box with no size', () => {
  const { tags, changes } = dataset();
  expect(tags.tag(99, 3, BOX)).toEqual({
    refused: 'photo not found',
    missing: true
  });
  expect(tags.tag(12, 3, BOX)).toEqual({
    refused: 'photo not found',
    missing: true
  });
  expect(tags.tag(10, 99, BOX)).toEqual({
    refused: 'person not found',
    missing: true
  });
  expect(tags.tag(10, 3, { ...BOX, width: 0 })).toEqual({
    refused: 'expected a box',
    missing: false
  });
  expect(changes).toEqual([]);
});

test("the portrait is cropped to the person's Tag on it", () => {
  const { db, tags } = dataset();
  tags.tag(10, 1, BOX);
  tags.tag(10, 3, BOX);
  const persons = new Map(
    createTree(db)
      .persons()
      .map((p) => [p.id, p])
  );
  const crop = { top: 20, left: 10, width: 30, height: 40 };
  expect(persons.get(1)?.crop).toEqual(crop);
  expect(persons.get(3)).toMatchObject({ photo_path: 'abc.jpg', crop });
  expect(persons.get(2)?.crop).toEqual({
    top: 5,
    left: 40,
    width: 30,
    height: 35
  });
});

test('names a Photo by its file', () => {
  expect(photoName({ original_path: null, file_path: 'abc.jpg' })).toBe(
    'abc.jpg'
  );
  expect(
    photoName({
      original_path: 'https://example.org/p/Talo.jpg?x=1',
      file_path: 'abc.jpg'
    })
  ).toBe('Talo.jpg');
});
