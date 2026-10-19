import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
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

// A photo as MyHeritage links it: the token changes with every export.
function photo(token: string, name: string) {
  return `https://sites-cf.mhcache.com/e/1/${token}/1/2/3/${name}.jpg`;
}

// A MyHeritage export: a photo with its face marked, an OBJE with two
// FILEs, and a family's photo.
function gedcom(token = 'tok1') {
  return [
    '0 HEAD',
    '1 SOUR MYHERITAGE',
    '0 @I1@ INDI',
    '1 NAME Jane /Doe/',
    '1 OBJE',
    '2 FORM jpg',
    `2 FILE ${photo(token, 'photo')}`,
    '2 _POSITION 217 225 1318 1693',
    '0 @I2@ INDI',
    '1 NAME John /Doe/',
    '1 OBJE',
    `2 FILE ${photo(token, 'front')}`,
    `2 FILE ${photo(token, 'back')}`,
    '0 @F1@ FAM',
    '1 HUSB @I2@',
    '1 WIFE @I1@',
    '1 OBJE',
    `2 FILE ${photo(token, 'wedding')}`,
    '0 TRLR'
  ].join('\n');
}

// Each photo's bytes are its name, so no two share a stored file; the URLs
// fetched are kept.
let fetched: string[] = [];
async function fakeDownload(url: string, dest: string) {
  fetched.push(url);
  await Bun.write(dest, url.split('/').at(-1)!);
  return 'ok';
}

async function imported(token?: string, text = gedcom(token)) {
  fetched = [];
  const registry = new DatasetRegistry(root);
  await importDataset({
    registry,
    slug: 'doe',
    text,
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

function linkRows(db: Database) {
  return db
    .query<LinkRow, []>(
      `SELECT m.original_path, m.format, l.scope_type, l.scope_id,
         l.sort_order, l.crop_top, l.crop_left, l.crop_width, l.crop_height
       FROM media_links l JOIN media m ON m.id = l.media_id
       ORDER BY l.id`
    )
    .all();
}

async function links() {
  const { db } = await imported();
  return new Map(linkRows(db).map((r) => [r.original_path, r]));
}

test('a MyHeritage photo lands with a MIME format and its face crop', async () => {
  expect((await links()).get('1/2/3/photo.jpg')).toMatchObject({
    format: 'image/jpeg',
    scope_type: 'person',
    crop_top: 225,
    crop_left: 217,
    crop_width: 1318 - 217,
    crop_height: 1693 - 225
  });
});

test("a family's photo is copied and linked to the family", async () => {
  expect((await links()).get('1/2/3/wedding.jpg')).toMatchObject({
    scope_type: 'family',
    crop_top: null
  });
});

test('each FILE of an OBJE is linked, in order', async () => {
  const all = await links();
  expect(all.get('1/2/3/front.jpg')).toMatchObject({
    scope_type: 'person',
    sort_order: 0
  });
  expect(all.get('1/2/3/back.jpg')).toMatchObject({
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

test('a re-import, with new tokens in every URL, downloads nothing', async () => {
  const first = linkRows((await imported('tok1')).db);
  expect(fetched).toHaveLength(4);
  const again = linkRows((await imported('tok2')).db);
  expect(fetched).toEqual([]);
  expect(again).toEqual(first);
});

test('a photo deleted in MyHeritage is gone after a re-import', async () => {
  await imported('tok1');
  const withoutWedding = gedcom('tok2').replace(
    /1 OBJE\n2 FILE \S+wedding\.jpg\n/u,
    ''
  );
  const { registry, db } = await imported('tok2', withoutWedding);
  expect(fetched).toEqual([]);
  const paths = linkRows(db).map((r) => r.original_path);
  expect(paths).not.toContain('1/2/3/wedding.jpg');
  expect(await readdir(registry.mediaDir('doe'))).toHaveLength(3);
});

async function photoStagings() {
  return (await readdir(tmpdir())).filter((f) =>
    f.startsWith('myheritage-photos-')
  );
}

test('a download that throws fails the import and leaves nothing behind', async () => {
  const before = await photoStagings();
  const registry = new DatasetRegistry(root);
  const failed = await importDataset({
    registry,
    slug: 'doe',
    text: gedcom(),
    sourceFilename: 'doe.ged',
    download: async (_url, dest) => {
      await Bun.write(dest, 'half');
      throw new Error('connection reset');
    }
  })
    .then(() => null)
    .catch((err: unknown) => err);
  expect(String(failed)).toContain('connection reset');
  expect(await readdir(root)).toEqual([]);
  expect(await photoStagings()).toEqual(before);
});
