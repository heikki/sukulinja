import { expect, test } from 'bun:test';

import { openDb } from '../datasets/db';
import { createPhotos } from './photos';

// Three people; a group photo of 1 and 2, a portrait of 1, and a PDF.
function dataset() {
  const db = openDb(':memory:');
  db.run(
    `INSERT INTO persons (id, xref) VALUES (1, '@I1@'), (2, '@I2@'), (3, '@I3@')`
  );
  db.run(`INSERT INTO media (id, file_path, format) VALUES
    (10, 'group.jpg', 'image/jpeg'),
    (11, 'portrait.png', 'image/png'),
    (12, 'letter.pdf', 'application/pdf')`);
  db.run(`INSERT INTO media_links
    (media_id, scope_type, scope_id, sort_order, crop_top, crop_left, crop_width, crop_height)
    VALUES
    (11, 'person', 1, 0, NULL, NULL, NULL, NULL),
    (10, 'person', 1, 1, NULL, NULL, NULL, NULL),
    (10, 'person', 2, 0, 5, 40, 30, 35),
    (10, 'person', 1, 2, 10, 100, 30, 40),
    (12, 'person', 1, 3, NULL, NULL, NULL, NULL),
    (10, 'family', 1, 0, NULL, NULL, NULL, NULL)`);
  return db;
}

test("lists a person's pictures in their order, with everyone in each", () => {
  const photos = createPhotos(dataset()).ofPerson(1);
  expect(photos).toEqual([
    {
      id: 11,
      path: 'portrait.png',
      people: [{ personId: 1, box: null, tagged: false }]
    },
    {
      id: 10,
      path: 'group.jpg',
      people: [
        {
          personId: 1,
          box: { left: 100, top: 10, width: 30, height: 40 },
          tagged: false
        },
        {
          personId: 2,
          box: { left: 40, top: 5, width: 30, height: 35 },
          tagged: false
        }
      ]
    }
  ]);
});

test('a person with no pictures has no Photos', () => {
  expect(createPhotos(dataset()).ofPerson(3)).toEqual([]);
});
