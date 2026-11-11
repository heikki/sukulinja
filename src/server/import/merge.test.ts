import { expect, test } from 'bun:test';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ImportReview } from '@/common/types';

import { openAppCitations } from '../citations/testing';
import { ImportCancelled } from './dataset';
import {
  ASTIA,
  citationIds,
  citations,
  citeInApp,
  folder,
  importTree,
  MAIJA,
  mark,
  MARKED,
  MATTI,
  PAGE,
  personId,
  PLAIN,
  registry,
  remind,
  reopen,
  tree,
  useDataFolder
} from './merge-testing';

useDataFolder();

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
    kept: {
      marks: 1,
      citations: 0,
      duplicates: 0,
      converted: 0,
      rejections: 0,
      reminders: 0,
      tags: 0
    },
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
  const notes = registry()
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
    converted: 0,
    rejections: 0,
    reminders: 0,
    tags: 0
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
  registry()
    .open('tree')
    .run(
      "INSERT INTO rejections (reference_url, volume_id, image, file_id) VALUES (?, 'v1', 11, 'f11')",
      [PAGE.a]
    );
  await importTree(tree([MATTI, MAIJA]));
  const rejections = 'SELECT reference_url, image FROM rejections';
  expect(registry().open('tree').query(rejections).all()).toEqual([
    { reference_url: PAGE.a, image: 11 }
  ]);

  // Undone after the dataset changed since.
  registry().open('tree').run('DELETE FROM rejections');
  expect(await registry().undoImport('tree')).toBe(true);
  expect(citations()).toEqual([{ xref: '@I1@', ...MARKED, added_in_app: 0 }]);
  expect(registry().open('tree').query(rejections).all()).toHaveLength(1);
  expect(await registry().list()).toMatchObject([{ undoable: false }]);
  expect(await registry().undoImport('tree')).toBe(false);
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
  expect(await readdir(folder())).toEqual(['tree']);
  expect(await registry().list()).toMatchObject([{ undoable: false }]);
});

test('a dataset an older schema built merges its Marks', async () => {
  await importTree(tree([MATTI]));
  mark(citationIds('@I1@')[0]!);
  // As an older app left it, before citations could be made in the app.
  const db = registry().open('tree');
  db.run('ALTER TABLE citations DROP COLUMN added_in_app');
  db.run('PRAGMA user_version = 0');
  db.close();
  reopen();
  expect(await registry().list()).toMatchObject([{ outdated: true }]);

  const outcome = await importTree(tree([MATTI]));
  expect(outcome.merged?.kept.marks).toBe(1);
  expect(citations()).toEqual([{ xref: '@I1@', ...MARKED, added_in_app: 0 }]);
});

test('a dataset that can not be read is replaced, and says why', async () => {
  await importTree(tree([MATTI]));
  registry().open('tree').close();
  reopen();
  await writeFile(join(folder(), 'tree', 'db.sqlite'), 'not a database');

  const outcome = await importTree(tree([MATTI, MAIJA]));
  expect(typeof outcome.merged?.unreadable).toBe('string');
  expect(citations()).toHaveLength(2);
  // What it couldn't read is still kept, to undo the import with.
  const before = join(folder(), 'tree', 'db.before-import.sqlite');
  expect(await Bun.file(before).text()).toBe('not a database');
});

// ---------------------------------------------------------------- sources

// A Citation made in the Scan viewer on Image 12 of Volume v1, which gives
// the Volume its source.
function citeInViewer(xref: string) {
  const db = registry().open('tree');
  const person = db
    .query<{ id: number }, [string]>('SELECT id FROM persons WHERE xref = ?')
    .get(xref)!;
  openAppCitations(db).create({
    personId: person.id,
    volumeId: 'v1',
    volume: 'Juva 1790-1796',
    image: 12,
    fileId: 'f12',
    box: { left: 10, top: 20, width: 300, height: 40 },
    text: null
  });
}

interface SourceOut {
  xref: string;
  title: string;
  cited: number;
}

function sources() {
  return registry()
    .open('tree')
    .query<SourceOut, []>(
      `SELECT s.xref, s.title,
         (SELECT COUNT(*) FROM citations c WHERE c.source_id = s.id) AS cited
       FROM sources s ORDER BY s.id`
    )
    .all();
}

const VOLUME_SOURCE = ['0 @ASTIA_V1@ SOUR', '1 TITL Juva 1790-1796'];

test("a re-import without a Volume's source brings it once with its Citations", async () => {
  await importTree(tree([MATTI, MAIJA]));
  citeInViewer('@I1@');
  citeInViewer('@I2@');
  const outcome = await importTree(tree([MATTI, MAIJA]));

  expect(outcome.merged).toMatchObject({
    kept: { citations: 2 },
    lost: []
  });
  expect(sources()).toEqual([
    { xref: '@S1@', title: 'Church books', cited: 2 },
    { xref: '@ASTIA_V1@', title: 'Juva 1790-1796', cited: 2 }
  ]);
  expect(citations().filter((c) => c.added_in_app === 1)).toEqual([
    {
      xref: '@I1@',
      page: ASTIA,
      ...PLAIN,
      link_image: 12,
      link_box_left: 10,
      added_in_app: 1
    },
    {
      xref: '@I2@',
      page: ASTIA,
      ...PLAIN,
      link_image: 12,
      link_box_left: 10,
      added_in_app: 1
    }
  ]);
});

test("a re-import with a Volume's source keeps its Citations on it", async () => {
  await importTree(tree([MATTI]));
  citeInViewer('@I1@');
  // Uploaded and exported again, the source came back with the export.
  await importTree(tree([MATTI], true, VOLUME_SOURCE));
  expect(sources()).toEqual([
    { xref: '@S1@', title: 'Church books', cited: 1 },
    { xref: '@ASTIA_V1@', title: 'Juva 1790-1796', cited: 1 }
  ]);
});

test('a source only imported Citations cite stays gone when the export drops it', async () => {
  const census = [
    '0 @S2@ SOUR',
    '1 TITL Census',
    '0 @I3@ INDI',
    '1 UID uid-I3',
    '1 NAME Liisa /Esimerkki/',
    '1 SOUR @S2@',
    `2 PAGE ${PAGE.c}`
  ];
  await importTree(tree([MATTI], true, census));
  citeInViewer('@I1@');
  await importTree(tree([MATTI]));
  expect(sources().map((s) => s.xref)).toEqual(['@S1@', '@ASTIA_V1@']);
});

// -------------------------------------------------------------- Reminders

// A Reminder on Image 12, done; about the person `about` too.
function remindImage(text: string, about: string | null = null) {
  registry()
    .open('tree')
    .run(
      `INSERT INTO reminders (text, person_id, volume_id, volume, image,
         file_id, created_at, done_at)
       VALUES (?, (SELECT id FROM persons WHERE xref = ?), 'v1',
         'Juva 1790-1796', 12, 'f12', '2026-10-23T10:00:00.000Z',
         '2026-10-23T11:00:00.000Z')`,
      [text, about]
    );
}

interface ReminderOut {
  text: string;
  xref: string | null;
  image: number | null;
  done_at: string | null;
}

// Each Reminder as "text | whose | which Image | when done", leaving out
// what it doesn't have.
function reminders() {
  return registry()
    .open('tree')
    .query<ReminderOut, []>(
      `SELECT r.text, p.xref, r.image, r.done_at FROM reminders r
       LEFT JOIN persons p ON p.id = r.person_id ORDER BY r.id`
    )
    .all()
    .map((r) =>
      [r.text, r.xref, r.image === null ? null : `Image ${r.image}`, r.done_at]
        .filter((v) => v !== null)
        .join(' | ')
    );
}

test('Reminders follow their person, and one on an Image stays', async () => {
  await importTree(tree([MATTI, MAIJA]));
  remind('Second wife?', '@I2@');
  remind('Wrong Matti?', '@I1@');
  remindImage('Later hand');
  // The export now gives Maija another record id, and Matti a new citation
  // before his old one.
  const outcome = await importTree(
    tree([
      { ...MATTI, pages: [PAGE.c, PAGE.a] },
      { ...MAIJA, xref: '@I9@', uid: 'uid-I2' }
    ])
  );

  expect(reminders()).toEqual([
    'Second wife? | @I9@',
    'Wrong Matti? | @I1@',
    'Later hand | Image 12 | 2026-10-23T11:00:00.000Z'
  ]);
  expect(outcome.merged).toMatchObject({ kept: { reminders: 3 }, lost: [] });
});

test('a Reminder on an Image about someone follows them, and stays on the Image once they are gone', async () => {
  await importTree(tree([MATTI, MAIJA]));
  remindImage('His hand?', '@I1@');
  remindImage('Her hand?', '@I2@');
  const outcome = await importTree(tree([MATTI]));

  expect(reminders()).toEqual([
    'His hand? | @I1@ | Image 12 | 2026-10-23T11:00:00.000Z',
    'Her hand? | Image 12 | 2026-10-23T11:00:00.000Z'
  ]);
  expect(outcome.merged).toMatchObject({ kept: { reminders: 2 }, lost: [] });
});

test('a Reminder whose person is gone is listed', async () => {
  await importTree(tree([MATTI, MAIJA]));
  remind('Wrong Matti?', '@I1@');
  remind('Second   wife?\nOr a third?', '@I2@');
  const outcome = await importTree(tree([{ ...MATTI, pages: [PAGE.c] }]));

  expect(reminders()).toEqual(['Wrong Matti? | @I1@']);
  expect(outcome.merged).toMatchObject({
    kept: { reminders: 1 },
    lost: ['Maija /Esimerkki/: Second wife? Or a third? (a Reminder)']
  });
});

test('a Reminder an older app put on a citation goes onto its person', async () => {
  await importTree(tree([MATTI]));
  // As an older app left it, when a Reminder could be on a citation.
  const db = registry().open('tree');
  db.run('ALTER TABLE reminders ADD COLUMN citation_id INTEGER');
  db.run(
    `INSERT INTO reminders (text, person_id, citation_id, created_at)
     VALUES ('Is this the entry?', ?, ?, '2026-10-23T10:00:00.000Z')`,
    [personId('@I1@'), citationIds('@I1@')[0]!]
  );
  db.run('PRAGMA user_version = 0');
  db.close();
  reopen();

  const outcome = await importTree(tree([MATTI]));
  expect(reminders()).toEqual(['Is this the entry? | @I1@']);
  expect(outcome.merged).toMatchObject({ kept: { reminders: 1 }, lost: [] });
});
