import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { openMarks } from '@server/citation-scans/marks';
import { DatasetRegistry } from '@server/dataset-registry';
import { importDataset } from '@server/import-dataset';

import { renameOriginalPage } from './rename';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rename-original-page-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const PAGE = 'https://www.myheritage.fi/research/collection-10509/x?itemId=1';
const ASTIA =
  'https://astia.narc.fi/uusiastia/viewer/?fileId=f12&aineistoId=v1';
const LINK = {
  volumeId: 'v1',
  volume: 'Juva 1790-1796',
  image: 12,
  fileId: 'f12',
  box: { left: 10, top: 20, width: 300, height: 40 },
  by: 'hand' as const
};

// A dataset with one Marked citation, as schema 5 left it.
async function schema5(slug: string) {
  const registry = new DatasetRegistry(root);
  await importDataset({
    registry,
    slug,
    source: {
      gedcom: [
        '0 HEAD',
        '1 GEDC',
        '2 VERS 5.5.1',
        '0 @S1@ SOUR',
        '0 @I1@ INDI',
        '1 SOUR @S1@',
        `2 PAGE ${PAGE}`,
        '0 TRLR',
        ''
      ].join('\n')
    },
    sourceFilename: 'tree.ged'
  });
  const db = registry.open(slug);
  db.run(
    'UPDATE citations SET page = ?, original_page = ?, link_volume_id = ?, link_volume = ?, link_image = 12, link_file_id = ?, link_box_left = 10, link_box_top = 20, link_box_width = 300, link_box_height = 40, link_by = ?',
    [ASTIA, PAGE, LINK.volumeId, LINK.volume, LINK.fileId, LINK.by]
  );
  db.run('ALTER TABLE citations RENAME COLUMN original_page TO imported_page');
  db.run("UPDATE meta SET value = '5' WHERE key = 'schema_version'");
  db.close();
}

test('moves a schema 5 database to schema 6, its Marks and original pages where they were', async () => {
  await schema5('tree');
  await Bun.write(
    join(root, 'tree', 'db.before-import.sqlite'),
    Bun.file(join(root, 'tree', 'db.sqlite'))
  );
  await writeFile(join(root, 'tree', 'not-a-dataset.sqlite'), '');

  expect(await renameOriginalPage(root)).toEqual([
    { path: join(root, 'tree', 'db.sqlite'), result: 'renamed' },
    { path: join(root, 'tree', 'db.before-import.sqlite'), result: 'renamed' }
  ]);

  const registry = new DatasetRegistry(root);
  const db = registry.open('tree');
  expect(db.query('SELECT page, original_page FROM citations').all()).toEqual([
    { page: ASTIA, original_page: PAGE }
  ]);
  expect(openMarks(db).linked()).toEqual([
    { url: PAGE, recordId: 1, link: LINK }
  ]);
  const before = new Database(join(root, 'tree', 'db.before-import.sqlite'));
  expect(
    before.query("SELECT value FROM meta WHERE key = 'schema_version'").get()
  ).toEqual({ value: '6' });
  before.close();

  // Run again, it leaves them be.
  expect(await renameOriginalPage(root)).toMatchObject([
    { result: 'left at schema 6' },
    { result: 'left at schema 6' }
  ]);
});

test('leaves a database of another schema, and one it can not read, as they are', async () => {
  await schema5('old');
  const db = new Database(join(root, 'old', 'db.sqlite'));
  db.run("UPDATE meta SET value = '4' WHERE key = 'schema_version'");
  db.close();
  await writeFile(
    join(root, 'old', 'db.before-import.sqlite'),
    'not a database'
  );

  const results = await renameOriginalPage(root);
  expect(results[0]).toEqual({
    path: join(root, 'old', 'db.sqlite'),
    result: 'left at schema 4'
  });
  expect(results[1]!.result).toStartWith('not read: ');
});
