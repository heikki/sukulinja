import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { DatasetRegistry } from './dataset-registry';
import { importDataset } from './import-dataset';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'import-dataset-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// A MyHeritage export: a photo with its face marked, an OBJE with two
// FILEs, and a family's photo.
const GEDCOM = [
  '0 HEAD',
  '1 SOUR MYHERITAGE',
  '0 @I1@ INDI',
  '1 NAME Jane /Doe/',
  '1 OBJE',
  '2 FORM jpg',
  '2 FILE https://x/photo.jpg',
  '2 _POSITION 217 225 1318 1693',
  '0 @I2@ INDI',
  '1 NAME John /Doe/',
  '1 OBJE',
  '2 FILE https://x/front.jpg',
  '2 FILE https://x/back.jpg',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I1@',
  '1 OBJE',
  '2 FILE https://x/wedding.jpg',
  '0 TRLR'
].join('\n');

// Each photo's bytes are its URL, so no two share a stored file.
async function fakeDownload(url: string, dest: string) {
  await Bun.write(dest, url);
  return 'ok';
}

async function imported() {
  const registry = new DatasetRegistry(root);
  await importDataset({
    registry,
    slug: 'doe',
    text: GEDCOM,
    sourceFilename: 'doe.ged',
    download: fakeDownload
  });
  return { registry, db: registry.open('doe') };
}

interface LinkRow {
  original_path: string;
  format: string | null;
  scope_type: string;
  scope_id: number;
  sort_order: number;
  crop_top: number | null;
  crop_left: number | null;
  crop_width: number | null;
  crop_height: number | null;
}

async function links() {
  const { db } = await imported();
  const rows = db
    .query<LinkRow, []>(
      `SELECT m.original_path, m.format, l.scope_type, l.scope_id,
         l.sort_order, l.crop_top, l.crop_left, l.crop_width, l.crop_height
       FROM media_links l JOIN media m ON m.id = l.media_id
       ORDER BY l.id`
    )
    .all();
  return new Map(rows.map((r) => [r.original_path, r]));
}

test('a MyHeritage photo lands with a MIME format and its face crop', async () => {
  expect((await links()).get('photo.jpg')).toMatchObject({
    format: 'image/jpeg',
    scope_type: 'person',
    crop_top: 225,
    crop_left: 217,
    crop_width: 1318 - 217,
    crop_height: 1693 - 225
  });
});

test("a family's photo is copied and linked to the family", async () => {
  expect((await links()).get('wedding.jpg')).toMatchObject({
    scope_type: 'family',
    crop_top: null
  });
});

test('each FILE of an OBJE is linked, in order', async () => {
  const all = await links();
  expect(all.get('front.jpg')).toMatchObject({
    scope_type: 'person',
    sort_order: 0
  });
  expect(all.get('back.jpg')).toMatchObject({
    scope_type: 'person',
    sort_order: 1
  });
});

test('every file copied has a media row, and every row a file', async () => {
  const { registry, db } = await imported();
  const rows = db
    .query<{ file_path: string }, []>('SELECT file_path FROM media')
    .all()
    .map((r) => r.file_path);
  const files = await readdir(registry.mediaDir('doe'));
  expect(rows).toHaveLength(4);
  expect(files.toSorted()).toEqual(rows.toSorted());
});
