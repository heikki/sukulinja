// A re-import's merge carrying the Changes (merge.ts, carryOn): each stays,
// on the same person or citation, or on nothing once its person is gone.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DatasetRegistry } from '../datasets/registry';

let root = '';
let registry = new DatasetRegistry('');

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'merge-changes-'));
  registry = new DatasetRegistry(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const PAGE = {
  a: 'https://example.org/record/1',
  b: 'https://example.org/record/2',
  c: 'https://example.org/record/3'
};

// A tree of people, each with a UID, citing the one source at their pages.
function tree(people: Array<{ xref: string; name: string; pages: string[] }>) {
  return [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 5.5.1',
    '0 @S1@ SOUR',
    '1 TITL Church books',
    ...people.flatMap((p) => [
      `0 ${p.xref} INDI`,
      `1 UID uid-${p.xref.replaceAll('@', '')}`,
      `1 NAME ${p.name}`,
      ...p.pages.flatMap((page) => ['1 SOUR @S1@', `2 PAGE ${page}`])
    ]),
    '0 TRLR',
    ''
  ].join('\n');
}

const MATTI = { xref: '@I1@', name: 'Matti /Esimerkki/', pages: [PAGE.a] };
const MAIJA = { xref: '@I2@', name: 'Maija /Esimerkki/', pages: [PAGE.b] };

async function importTree(gedcom: string) {
  return await registry.import({
    slug: 'tree',
    source: { gedcom },
    sourceFilename: 'tree.ged'
  });
}

function personId(xref: string) {
  return registry
    .open('tree')
    .query<{ id: number }, [string]>('SELECT id FROM persons WHERE xref = ?')
    .get(xref)!.id;
}

function citationOf(xref: string) {
  return registry
    .open('tree')
    .query<{ id: number }, [number]>(
      `SELECT id FROM citations WHERE scope_type = 'person' AND scope_id = ?`
    )
    .get(personId(xref))!.id;
}

// A Change on the person, or on one of their citations, saying `text`.
function changeOn(text: string, xref: string, citationId?: number) {
  registry.open('tree').run(
    `INSERT INTO changes (at, what, who, person_id, citation_id)
       VALUES ('2026-11-09T10:00:00.000Z', ?, 'As named then', ?, ?)`,
    [
      JSON.stringify({ kind: 'uncite', cited: text }),
      personId(xref),
      citationId ?? null
    ]
  );
}

interface ChangeOut {
  what: string;
  who: string;
  xref: string | null;
  page: string | null;
}

// Each Change as "its text | whose | its citation's page", or whose it was.
function changes() {
  return registry
    .open('tree')
    .query<ChangeOut, []>(
      `SELECT ch.what, ch.who, p.xref, c.page FROM changes ch
       LEFT JOIN persons p ON p.id = ch.person_id
       LEFT JOIN citations c ON c.id = ch.citation_id ORDER BY ch.id`
    )
    .all()
    .map((r) =>
      [
        (JSON.parse(r.what) as { cited: string }).cited,
        r.xref ?? `nobody's, was ${r.who}`,
        r.page
      ]
        .filter((v) => v !== null)
        .join(' | ')
    );
}

test('the Changes follow their person and citation, and one whose person is gone stays on nothing', async () => {
  await importTree(tree([MATTI, MAIJA]));
  changeOn('Marked', '@I1@', citationOf('@I1@'));
  changeOn('Cited', '@I2@');
  const outcome = await importTree(
    tree([{ ...MATTI, pages: [PAGE.c, PAGE.a] }])
  );

  expect(changes()).toEqual([
    `Marked | @I1@ | ${PAGE.a}`,
    "Cited | nobody's, was As named then"
  ]);
  // Nothing about them is in the review: they're kept, whatever they're on.
  expect(outcome.merged).toMatchObject({ lost: [] });
});

test('a Change on a Photo is put back on its person', async () => {
  await importTree(tree([MATTI]));
  const db = registry.open('tree');
  db.run("INSERT INTO media (id, file_path) VALUES (900, 'kesa.jpg')");
  db.run(
    `INSERT INTO changes (at, what, person_id, media_id)
       VALUES ('2026-11-09T10:00:00.000Z', ?, ?, 900)`,
    [JSON.stringify({ kind: 'untag', photo: 'kesa.jpg' }), personId('@I1@')]
  );
  await importTree(tree([MATTI]));

  expect(
    registry
      .open('tree')
      .query(
        `SELECT p.xref, ch.media_id FROM changes ch
         JOIN persons p ON p.id = ch.person_id
         WHERE ch.what LIKE '%untag%'`
      )
      .all()
  ).toEqual([{ xref: '@I1@', media_id: null }]);
});
