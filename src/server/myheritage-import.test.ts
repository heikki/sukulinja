import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { openDb } from './db';
import { importGedcom } from './gedcom-import';
import type { GedNode } from './gedcom-parser';
import { ingest } from './media-ingest';
import { convertMyHeritage } from './myheritage';

let tmp = '';

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'mh-import-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

// End-to-end: a raw MyHeritage OBJE (remote FILE, sibling FORM, _POSITION) goes
// through convert -> ingest -> import and lands as a media row with a MIME
// format and a face crop, exactly as the success download path would produce.
test('downloaded MyHeritage photo imports with format and crop', async () => {
  const obje: GedNode = {
    level: 1,
    tag: 'OBJE',
    children: [
      { level: 2, tag: 'FORM', value: 'jpg', children: [] },
      { level: 2, tag: 'FILE', value: 'https://x/photo.jpg', children: [] },
      { level: 2, tag: '_POSITION', value: '217 225 1318 1693', children: [] }
    ]
  };
  const roots: GedNode[] = [
    { level: 0, tag: 'HEAD', children: [] },
    {
      level: 0,
      xref: '@I1@',
      tag: 'INDI',
      children: [
        { level: 1, tag: 'NAME', value: 'Jane /Doe/', children: [] },
        obje
      ]
    }
  ];

  const staging = join(tmp, 'staging');
  const conv = await convertMyHeritage(roots, {
    stagingDir: staging,
    download: async (_url, dest) => {
      await Bun.write(dest, 'JPEGBYTES');
      return 'ok';
    }
  });
  expect(conv.downloaded).toBe(1);

  const mediaDir = join(tmp, 'media');
  const ingestResult = await ingest({
    roots,
    sourceDir: staging,
    targetDir: mediaDir
  });
  expect(ingestResult.resolved.size).toBe(1);

  const db = openDb(join(tmp, 'db.sqlite'));
  importGedcom(db, roots, (rel) => ingestResult.resolved.get(rel) ?? null);

  const media = db
    .query<
      { format: string; original_path: string },
      []
    >('SELECT format, original_path FROM media')
    .get();
  expect(media?.format).toBe('image/jpeg');
  expect(media?.original_path).toBe('photo.jpg');

  const link = db
    .query<
      {
        crop_top: number;
        crop_left: number;
        crop_width: number;
        crop_height: number;
      },
      []
    >('SELECT crop_top, crop_left, crop_width, crop_height FROM media_links')
    .get();
  expect(link).toEqual({
    crop_top: 225,
    crop_left: 217,
    crop_width: 1318 - 217,
    crop_height: 1693 - 225
  });
  db.close();
});
