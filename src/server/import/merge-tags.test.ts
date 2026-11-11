// A re-import's merge carrying the Tags (merge-tags.ts): each goes back on
// its person in the same Photo, and one whose Photo is gone is lost.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { importGedcomFixture } from '../../../test/gedcom-fixture';
import { DatasetRegistry } from '../datasets/registry';
import { createPhotos, openTags } from '../photos';

let root = '';
let registry = new DatasetRegistry('');

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'merge-tags-'));
  registry = new DatasetRegistry(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const BOX = { left: 5, top: 6, width: 7, height: 8 };

// The fixture with its child tagged in the family photo linked to no one,
// and Jane in her portrait: the media ids of those two.
async function tagged() {
  await importGedcomFixture(registry, 'a');
  const db = registry.open('a');
  function idOf(sql: string) {
    return db.query<{ id: number }, []>(sql).get()!.id;
  }
  const child = idOf("SELECT id FROM persons WHERE xref = '@I3@'");
  const jane = idOf("SELECT id FROM persons WHERE xref = '@I1@'");
  const family = idOf(
    "SELECT id FROM media WHERE original_path LIKE '%Unknown%'"
  );
  const portrait = idOf(
    "SELECT id FROM media WHERE original_path LIKE '%Bront%'"
  );
  const tags = openTags(db, createPhotos(db), () => undefined);
  tags.tag(family, child, BOX);
  tags.tag(portrait, jane, BOX);
  return { family, portrait };
}

// Who's tagged where in the dataset now, by xref and original path.
function tagsNow() {
  return registry
    .open('a')
    .query(
      `SELECT p.xref, m.original_path AS photo, ml.crop_left AS 'left'
       FROM media_links ml JOIN media m ON m.id = ml.media_id
       JOIN persons p ON p.id = ml.scope_id
       WHERE ml.added_in_app = 1 ORDER BY p.xref`
    )
    .all();
}

test('a re-import keeps the Tags, in the Photos the new export has', async () => {
  await tagged();
  const before = tagsNow();
  const { merged } = await importGedcomFixture(registry, 'a');
  expect(tagsNow()).toEqual(before);
  expect(before).toHaveLength(2);
  expect(merged?.kept.tags).toBe(2);
});

test('a Tag whose Photo the new export lacks is listed as lost', async () => {
  const { family } = await tagged();
  registry
    .open('a')
    .run(
      "UPDATE media SET original_path = 'photos/Gone.jpg', file_path = 'gone.jpg' WHERE id = ?",
      [family]
    );
  const { merged } = await importGedcomFixture(registry, 'a');
  expect(tagsNow()).toEqual([
    { xref: '@I1@', photo: 'photos/Charlotte Brontë.jpg', left: 5 }
  ]);
  expect(merged?.kept.tags).toBe(1);
  expect(merged?.lost).toEqual(['Child /Doe/: Gone.jpg (a Tag)']);
});
