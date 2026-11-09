// What the merge tests share: a data folder per test, a tree to import,
// and the app's additions to make in it.

import { afterEach, beforeEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ImportReview } from '@/common/types';

import { openAnnotations } from '../citations';
import { DatasetRegistry } from '../datasets/registry';

let root = '';
let current = new DatasetRegistry('');

// Each test of the file on a new data folder of its own.
export function useDataFolder() {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'import-merge-'));
    current = new DatasetRegistry(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
}

// The data folder's datasets.
export function registry() {
  return current;
}

export function folder() {
  return root;
}
// A registry with no database open, after one was changed behind its back.
export function reopen() {
  current = new DatasetRegistry(root);
}

export interface Person {
  xref: string;
  uid?: string;
  name: string;
  pages: string[];
}

export const PAGE = {
  a: 'https://example.org/record/1',
  b: 'https://example.org/record/2',
  c: 'https://example.org/record/3'
};
export const ASTIA =
  'https://astia.narc.fi/uusiastia/viewer/?fileId=f12&aineistoId=v1';

export const MATTI = {
  xref: '@I1@',
  name: 'Matti /Esimerkki/',
  pages: [PAGE.a]
};
export const MAIJA = {
  xref: '@I2@',
  name: 'Maija /Esimerkki/',
  pages: [PAGE.b]
};

// A tree of `people`, each citing the one source at their pages; with a
// UID each unless `uids` is false, and the `extra` records.
export function tree(people: Person[], uids = true, extra: string[] = []) {
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
    ...extra,
    '0 TRLR',
    ''
  ].join('\n');
}

export async function importTree(
  gedcom: string,
  review?: (r: ImportReview) => Promise<boolean>
) {
  return await current.import({
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

export function citations(): CitationOut[] {
  return current
    .open('tree')
    .query<CitationOut, []>(
      `SELECT p.xref, c.page, c.original_page, c.link_image, c.link_box_left,
         c.added_in_app
       FROM citations c JOIN persons p ON p.id = c.scope_id
       WHERE c.scope_type = 'person' ORDER BY c.id`
    )
    .all();
}

export function citationIds(xref: string) {
  return current
    .open('tree')
    .query<{ id: number }, [string]>(
      `SELECT c.id FROM citations c JOIN persons p ON p.id = c.scope_id
       WHERE c.scope_type = 'person' AND p.xref = ? ORDER BY c.id`
    )
    .all(xref)
    .map((r) => r.id);
}

// A hand Mark on Image 12 of Volume v1, as the Scan viewer writes it.
export function mark(id: number) {
  openAnnotations(current.open('tree')).swap([id], {
    volumeId: 'v1',
    volume: 'Juva 1790-1796',
    image: 12,
    fileId: 'f12',
    box: { left: 10, top: 20, width: 300, height: 40 },
    by: 'hand'
  });
}

// A citation made in the app on the person, with its Mark.
export function citeInApp(xref: string, page: string) {
  const db = current.open('tree');
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

export const MARKED = {
  page: ASTIA,
  original_page: PAGE.a,
  link_image: 12,
  link_box_left: 10
};
export const PLAIN = {
  original_page: null,
  link_image: null,
  link_box_left: null
};

export function personId(xref: string) {
  return current
    .open('tree')
    .query<{ id: number }, [string]>('SELECT id FROM persons WHERE xref = ?')
    .get(xref)!.id;
}

// A Reminder on the person.
export function remind(text: string, xref: string) {
  current.open('tree').run(
    `INSERT INTO reminders (text, person_id, created_at)
       VALUES (?, ?, '2026-10-23T10:00:00.000Z')`,
    [text, personId(xref)]
  );
}

// The person's citation at `page` converted to a Citation of its Image
// (ADR-0016): made in the app, under the Volume's own source, its page
// kept as its original page.
export function convert(xref: string, page: string) {
  const db = current.open('tree');
  const id = db
    .query<{ id: number }, [string, string]>(
      `SELECT c.id FROM citations c JOIN persons p ON p.id = c.scope_id
       WHERE p.xref = ? AND c.page = ? ORDER BY c.id LIMIT 1`
    )
    .get(xref, page)!.id;
  mark(id);
  const source = db.run(
    "INSERT INTO sources (xref, title, publisher) VALUES ('@ASTIA_V1@', 'Juva 1790-1796', 'Kansallisarkisto, Astia')"
  );
  db.run(
    "UPDATE citations SET source_id = ?, added_in_app = 1, text = 'Matti Esimerkki' WHERE id = ?",
    [Number(source.lastInsertRowid), id]
  );
  return id;
}

export const CONVERTED = { ...MARKED, added_in_app: 1 };
