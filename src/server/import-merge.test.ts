import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { ImportReview } from '@common/types';

import { openAnnotations } from './annotations';
import { DatasetRegistry } from './dataset-registry';
import { ImportCancelled, importDataset } from './import-dataset';

let root = '';
let registry = new DatasetRegistry('');

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'import-merge-'));
  registry = new DatasetRegistry(root);
});
// A registry with no database open, after one was changed behind its back.
function reopen() {
  registry = new DatasetRegistry(root);
}

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

interface Person {
  xref: string;
  uid?: string;
  name: string;
  pages: string[];
}

const PAGE = {
  a: 'https://example.org/record/1',
  b: 'https://example.org/record/2',
  c: 'https://example.org/record/3'
};
const ASTIA =
  'https://astia.narc.fi/uusiastia/viewer/?fileId=f12&aineistoId=v1';

const MATTI = { xref: '@I1@', name: 'Matti /Esimerkki/', pages: [PAGE.a] };
const MAIJA = { xref: '@I2@', name: 'Maija /Esimerkki/', pages: [PAGE.b] };

// A tree of `people`, each citing the one source at their pages; with a
// UID each unless `uids` is false.
function tree(people: Person[], uids = true) {
  return [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 5.5.1',
    '0 @S1@ SOUR',
    '1 TITL Church books',
    ...people.flatMap((p) => [
      `0 ${p.xref} INDI`,
      ...(uids
        ? [`1 UID ${p.uid ?? `uid-${p.xref.replaceAll('@', '')}`}`]
        : []),
      `1 NAME ${p.name}`,
      ...p.pages.flatMap((page) => ['1 SOUR @S1@', `2 PAGE ${page}`])
    ]),
    '0 TRLR',
    ''
  ].join('\n');
}

async function importTree(
  gedcom: string,
  review?: (r: ImportReview) => Promise<boolean>
) {
  return await importDataset({
    registry,
    slug: 'tree',
    source: { gedcom },
    sourceFilename: 'tree.ged',
    ...(review === undefined ? {} : { review })
  });
}

interface CitationOut {
  xref: string;
  page: string | null;
  original_page: string | null;
  link_image: number | null;
  link_box_left: number | null;
  added_in_app: number;
}

function citations(): CitationOut[] {
  return registry
    .open('tree')
    .query<CitationOut, []>(
      `SELECT p.xref, c.page, c.original_page, c.link_image, c.link_box_left,
         c.added_in_app
       FROM citations c JOIN persons p ON p.id = c.scope_id
       WHERE c.scope_type = 'person' ORDER BY c.id`
    )
    .all();
}

function citationIds(xref: string) {
  return registry
    .open('tree')
    .query<{ id: number }, [string]>(
      `SELECT c.id FROM citations c JOIN persons p ON p.id = c.scope_id
       WHERE c.scope_type = 'person' AND p.xref = ? ORDER BY c.id`
    )
    .all(xref)
    .map((r) => r.id);
}

// A hand Mark on Image 12 of Volume v1, as the Scan viewer writes it.
function mark(id: number) {
  openAnnotations(registry.open('tree')).swap([id], {
    volumeId: 'v1',
    volume: 'Juva 1790-1796',
    image: 12,
    fileId: 'f12',
    box: { left: 10, top: 20, width: 300, height: 40 },
    by: 'hand'
  });
}

// A citation made in the app on the person, with its Mark.
function citeInApp(xref: string, page: string) {
  const db = registry.open('tree');
  const person = db
    .query<{ id: number }, [string]>('SELECT id FROM persons WHERE xref = ?')
    .get(xref)!;
  const source = db.query<{ id: number }, []>('SELECT id FROM sources').get()!;
  const id = openAnnotations(db).insert(
    {
      scopeType: 'person',
      scopeId: person.id,
      sourceId: source.id,
      sortOrder: 9,
      page,
      event: null,
      role: null,
      quality: null,
      dataDate: null,
      text: null
    },
    { link: null, originalPage: null, madeInApp: true }
  );
  db.run(
    "INSERT INTO notes (owner_type, owner_id, text) VALUES ('citation', ?, 'Found in the scan')",
    [id]
  );
  mark(id);
}

const MARKED = {
  page: ASTIA,
  original_page: PAGE.a,
  link_image: 12,
  link_box_left: 10
};
const PLAIN = { original_page: null, link_image: null, link_box_left: null };

test('a newer export adds its people and citations, and a Mark stays on its citation', async () => {
  await importTree(tree([MATTI]));
  mark(citationIds('@I1@')[0]!);
  const outcome = await importTree(
    tree([{ ...MATTI, pages: [PAGE.a, PAGE.c] }, MAIJA])
  );

  expect(citations()).toEqual([
    { xref: '@I1@', ...MARKED, added_in_app: 0 },
    { xref: '@I1@', page: PAGE.c, ...PLAIN, added_in_app: 0 },
    { xref: '@I2@', page: PAGE.b, ...PLAIN, added_in_app: 0 }
  ]);
  expect(outcome.merged).toEqual({
    people: { added: 1, gone: 0 },
    citations: { added: 2, gone: 0 },
    kept: { marks: 1, citations: 0, duplicates: 0, rejections: 0 },
    lost: [],
    unreadable: null
  });
  expect(outcome.info.undoable).toBe(true);
});

test('a Mark stays when the export gives its citation the Astia address', async () => {
  await importTree(tree([MATTI]));
  mark(citationIds('@I1@')[0]!);
  await importTree(tree([{ ...MATTI, pages: [ASTIA] }]));
  expect(citations()).toEqual([{ xref: '@I1@', ...MARKED, added_in_app: 0 }]);
});

test('of citations alike, each keeps its own Mark', async () => {
  await importTree(tree([{ ...MATTI, pages: [PAGE.a, PAGE.a] }]));
  mark(citationIds('@I1@')[1]!);
  await importTree(tree([{ ...MATTI, pages: [PAGE.a, PAGE.a] }]));
  expect(citations()).toEqual([
    { xref: '@I1@', page: PAGE.a, ...PLAIN, added_in_app: 0 },
    { xref: '@I1@', ...MARKED, added_in_app: 0 }
  ]);
});

test('a citation made in the app follows its person by UID', async () => {
  await importTree(tree([MATTI, MAIJA]));
  citeInApp('@I2@', PAGE.c);
  // The export now gives Maija another record id.
  const outcome = await importTree(
    tree([MATTI, { ...MAIJA, xref: '@I9@', uid: 'uid-I2' }])
  );
  expect(citations().at(-1)).toEqual({
    xref: '@I9@',
    page: ASTIA,
    original_page: PAGE.c,
    link_image: 12,
    link_box_left: 10,
    added_in_app: 1
  });
  expect(outcome.merged?.kept.citations).toBe(1);
  const notes = registry
    .open('tree')
    .query("SELECT text FROM notes WHERE owner_type = 'citation'")
    .all();
  expect(notes).toEqual([{ text: 'Found in the scan' }]);
});

test('a citation made in the app follows its person by xref when the export has no UIDs', async () => {
  await importTree(tree([MATTI, MAIJA], false));
  citeInApp('@I2@', PAGE.c);
  await importTree(tree([MATTI, MAIJA], false));
  expect(citations().at(-1)).toMatchObject({ xref: '@I2@', added_in_app: 1 });
});

test('a citation made in the app that the export now has gives it its Mark', async () => {
  await importTree(tree([MATTI]));
  citeInApp('@I1@', PAGE.c);
  const outcome = await importTree(
    tree([{ ...MATTI, pages: [PAGE.a, PAGE.c] }])
  );
  expect(citations()).toEqual([
    { xref: '@I1@', page: PAGE.a, ...PLAIN, added_in_app: 0 },
    {
      xref: '@I1@',
      page: ASTIA,
      original_page: PAGE.c,
      link_image: 12,
      link_box_left: 10,
      added_in_app: 0
    }
  ]);
  expect(outcome.merged?.kept).toEqual({
    marks: 0,
    citations: 0,
    duplicates: 1,
    rejections: 0
  });
});

test('a Mark whose citation the export no longer has is listed as lost', async () => {
  await importTree(tree([MATTI, MAIJA]));
  mark(citationIds('@I2@')[0]!);
  citeInApp('@I2@', PAGE.c);
  const outcome = await importTree(tree([MATTI]));
  expect(outcome.merged).toMatchObject({
    people: { added: 0, gone: 1 },
    citations: { added: 0, gone: 1 },
    lost: [
      `Maija /Esimerkki/: ${PAGE.b}`,
      `Maija /Esimerkki/: ${ASTIA} (made in the app)`
    ]
  });
});

test('Rejections carry over, and Undo last import gives back the dataset from before', async () => {
  await importTree(tree([MATTI]));
  mark(citationIds('@I1@')[0]!);
  registry
    .open('tree')
    .run(
      "INSERT INTO rejections (reference_url, volume_id, image, file_id) VALUES (?, 'v1', 11, 'f11')",
      [PAGE.a]
    );
  await importTree(tree([MATTI, MAIJA]));
  const rejections = 'SELECT reference_url, image FROM rejections';
  expect(registry.open('tree').query(rejections).all()).toEqual([
    { reference_url: PAGE.a, image: 11 }
  ]);

  // Undone after the dataset changed since.
  registry.open('tree').run('DELETE FROM rejections');
  expect(await registry.undoImport('tree')).toBe(true);
  expect(citations()).toEqual([{ xref: '@I1@', ...MARKED, added_in_app: 0 }]);
  expect(registry.open('tree').query(rejections).all()).toHaveLength(1);
  expect(await registry.list()).toMatchObject([{ undoable: false }]);
  expect(await registry.undoImport('tree')).toBe(false);
});

test('a cancelled review leaves the dataset as it was', async () => {
  await importTree(tree([MATTI]));
  mark(citationIds('@I1@')[0]!);
  let asked: ImportReview | null = null;
  const result = await importTree(tree([MATTI, MAIJA]), async (r) => {
    asked = r;
    return await Promise.resolve(false);
  }).catch((err: unknown) => err);

  expect(result).toBeInstanceOf(ImportCancelled);
  expect(asked).toMatchObject({ people: { added: 1, gone: 0 } });
  expect(citations()).toEqual([{ xref: '@I1@', ...MARKED, added_in_app: 0 }]);
  expect(await readdir(root)).toEqual(['tree']);
  expect(await registry.list()).toMatchObject([{ undoable: false }]);
});

test('a dataset an older schema built merges its Marks', async () => {
  await importTree(tree([MATTI]));
  mark(citationIds('@I1@')[0]!);
  // As schema 4 left it, before citations could be made in the app.
  const db = registry.open('tree');
  db.run('ALTER TABLE citations DROP COLUMN added_in_app');
  db.run("UPDATE meta SET value = '4' WHERE key = 'schema_version'");
  db.close();
  reopen();
  expect(await registry.list()).toMatchObject([{ outdated: true }]);

  const outcome = await importTree(tree([MATTI]));
  expect(outcome.merged?.kept.marks).toBe(1);
  expect(citations()).toEqual([{ xref: '@I1@', ...MARKED, added_in_app: 0 }]);
});

test('a dataset that can not be read is replaced, and says why', async () => {
  await importTree(tree([MATTI]));
  registry.open('tree').close();
  reopen();
  await writeFile(join(root, 'tree', 'db.sqlite'), 'not a database');

  const outcome = await importTree(tree([MATTI, MAIJA]));
  expect(typeof outcome.merged?.unreadable).toBe('string');
  expect(citations()).toHaveLength(2);
  // What it couldn't read is still kept, to undo the import with.
  const before = join(root, 'tree', 'db.before-import.sqlite');
  expect(await Bun.file(before).text()).toBe('not a database');
});
