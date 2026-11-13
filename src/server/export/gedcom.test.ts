import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { unzipSync } from 'fflate';

import { importGedcomFixture } from '../../../test/gedcom-fixture';
import { gedcom7Errors } from '../../../test/gedcom7/validate';
import { treeSnapshot } from '../../../test/tree-snapshot';
import { CITATIONS_READ, openAnnotations, openSupport } from '../citations';
import { openAppCitations, openMarks } from '../citations/testing';
import { openDb } from '../datasets/db';
import { DatasetRegistry } from '../datasets/registry';
import { parseGedcom } from '../gedcom/parser';
import { line, pointer, writeGedcom } from '../gedcom/writer';
import { importGedcom } from '../import/gedcom';
import { createPhotos, openTags } from '../photos';
import { createTree } from '../tree';
import { packDataset } from './dataset';

const DEMO = resolve(import.meta.dir, '../../../resources/demo/bourbon.gdz');
const MAXIMAL = resolve(import.meta.dir, '../../../test/gedcom7/maximal70.gdz');

let tmp = '';
let registry = new DatasetRegistry('');
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'export-'));
  registry = new DatasetRegistry(join(tmp, 'data'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('writeGedcom', () => {
  test('writes levels, CRLF, CONT lines and @@, and pointers as they are', () => {
    const text = writeGedcom([
      line('HEAD', null, [line('GEDC', null, [line('VERS', '7.0')])]),
      {
        tag: 'INDI',
        xref: '@I1@',
        children: [
          line('NOTE', '@home\nsecond line\n\n@work'),
          pointer('FAMS', '@F1@')
        ]
      },
      line('TRLR')
    ]);
    expect(text).toBe(
      [
        '﻿0 HEAD',
        '1 GEDC',
        '2 VERS 7.0',
        '0 @I1@ INDI',
        '1 NOTE @@home',
        '2 CONT second line',
        '2 CONT',
        '2 CONT @@work',
        '1 FAMS @F1@',
        '0 TRLR',
        ''
      ].join('\r\n')
    );
  });
});

async function importFixture() {
  await importGedcomFixture(registry, 'a');
}

// Imports the dataset `a` exported, as `b`.
async function roundTrip() {
  const gdz = await packDataset(registry.open('a'), registry.mediaDir('a'));
  await registry.import({
    slug: 'b',
    source: { gedzip: gdz },
    sourceFilename: 'a.gdz'
  });
  return unzipSync(gdz);
}

function gedcomOf(zip: Record<string, Uint8Array>) {
  return new TextDecoder().decode(zip['gedcom.ged']);
}

describe('exporting a GEDZIP', () => {
  test('gives back the same tree, media and all', async () => {
    await importFixture();
    await roundTrip();
    expect(treeSnapshot(registry.open('b'))).toEqual(
      treeSnapshot(registry.open('a'))
    );
    expect(
      registry.open('b').query('SELECT COUNT(*) AS n FROM media_links').get()
    ).toEqual({ n: 2 });
  });

  test('writes a photo linked to no one as an OBJE record, and keeps it', async () => {
    await importFixture();
    const zip = await roundTrip();
    expect(gedcomOf(zip)).toContain(
      '1 FILE photos/Unknown%20family.jpg\r\n2 FORM image/jpeg'
    );
    const unlinked = registry
      .open('b')
      .query(
        `SELECT original_path FROM media m WHERE NOT EXISTS
           (SELECT 1 FROM media_links ml WHERE ml.media_id = m.id)`
      )
      .all();
    expect(unlinked).toEqual([
      { original_path: 'photos/Unknown%20family.jpg' }
    ]);
  });

  test('leaves out Reminders and Changes', async () => {
    await importFixture();
    const db = registry.open('a');
    const person = db
      .query<{ id: number }, []>('SELECT id FROM persons')
      .get()!;
    db.run(
      `INSERT INTO reminders (text, person_id, created_at)
       VALUES ('Remember the second wife', ?, '2026-10-23T10:00:00.000Z')`,
      [person.id]
    );
    db.run(
      `INSERT INTO changes (at, what, person_id)
       VALUES ('2026-11-09T10:00:00.000Z', ?, ?)`,
      [JSON.stringify({ kind: 'uncite', cited: 'The 1803 book' }), person.id]
    );
    const gedcom = gedcomOf(await roundTrip());
    for (const text of ['second wife', '1803 book']) {
      expect(gedcom).not.toContain(text);
    }
    expect(
      registry.open('b').query('SELECT COUNT(*) AS n FROM reminders').get()
    ).toEqual({ n: 0 });
    expect(
      registry.open('b').query('SELECT COUNT(*) AS n FROM changes').get()
    ).toEqual({ n: 0 });
  });

  test("carries Tags as the person's OBJE links with a CROP, and as Tags", async () => {
    await importFixture();
    const db = registry.open('a');
    function idOf(sql: string) {
      return db.query<{ id: number }, []>(sql).get()!.id;
    }
    const jane = idOf("SELECT id FROM persons WHERE xref = '@I1@'");
    const child = idOf("SELECT id FROM persons WHERE xref = '@I3@'");
    const portrait = idOf(
      "SELECT id FROM media WHERE original_path LIKE '%Bront%'"
    );
    const family = idOf(
      "SELECT id FROM media WHERE original_path LIKE '%Unknown%'"
    );
    const tags = openTags(db, createPhotos(db), () => undefined);
    tags.tag(portrait, jane, { left: 1, top: 2, width: 3, height: 4 });
    tags.tag(family, child, { left: 5, top: 6, width: 7, height: 8 });
    const zip = await roundTrip();
    expect(treeSnapshot(registry.open('b'))).toEqual(treeSnapshot(db));
    const text = gedcomOf(zip);
    expect(text).toContain(
      '1 FILE photos/Unknown%20family.jpg\r\n2 FORM image/jpeg\r\n1 NOTE Added in Sukulinja'
    );
    expect(text).toContain(
      '2 CROP\r\n3 TOP 6\r\n3 LEFT 5\r\n3 HEIGHT 8\r\n3 WIDTH 7'
    );
    expect(gedcom7Errors(text)).toEqual([]);
  });

  test('writes the chosen portrait first, and an import gives it back', async () => {
    await importFixture();
    const db = registry.open('a');
    function idOf(sql: string) {
      return db.query<{ id: number }, []>(sql).get()!.id;
    }
    const jane = idOf("SELECT id FROM persons WHERE xref = '@I1@'");
    const family = idOf(
      "SELECT id FROM media WHERE original_path LIKE '%Unknown%'"
    );
    const tags = openTags(db, createPhotos(db), () => undefined);
    tags.tag(family, jane, { left: 5, top: 6, width: 7, height: 8 });
    expect(tags.choosePortrait(family, jane)).toMatchObject({ id: family });
    function portraitOf(of: Database) {
      const id = of
        .query<{ id: number }, []>("SELECT id FROM persons WHERE xref = '@I1@'")
        .get()!.id;
      const p = createTree(of)
        .persons()
        .find((r) => r.id === id)!;
      const file = of
        .query<{ original_path: string }, [string]>(
          'SELECT original_path FROM media WHERE file_path = ?'
        )
        .get(p.photo_path!)!.original_path;
      return { crop: p.crop, file: decodeURIComponent(file) };
    }
    const chosen = portraitOf(db);
    expect(chosen.file).toContain('Unknown');
    await roundTrip();
    expect(portraitOf(registry.open('b'))).toEqual(chosen);
  });

  test('writes valid GEDCOM 7', async () => {
    await importFixture();
    const zip = await roundTrip();
    expect(gedcom7Errors(gedcomOf(zip))).toEqual([]);
  });

  test('packs each photo under its own name, its FILE written as a URL', async () => {
    await importFixture();
    const zip = await roundTrip();
    expect(Object.keys(zip).sort()).toEqual([
      'actes/baptism.jpg',
      'gedcom.ged',
      'photos/Charlotte Brontë.jpg',
      'photos/Unknown family.jpg'
    ]);
    expect(gedcomOf(zip)).toContain(
      '1 FILE photos/Charlotte%20Bront%C3%AB.jpg'
    );
  });

  test("writes MyHeritage's citations the GEDCOM 7 way", async () => {
    await importFixture();
    const text = gedcomOf(await roundTrip());
    expect(text).toContain(
      [
        '1 SOUR @S1@',
        '2 PAGE https://www.myheritage.fi/research/collection-10509/x?itemId=1',
        '2 DATA',
        '3 DATE 1 JAN 1900',
        '3 TEXT Jane Doe',
        '2 EVEN EVEN',
        '3 PHRASE Record',
        '3 ROLE OTHER',
        '4 PHRASE 10509:1-:abc',
        '2 QUAY 3'
      ].join('\r\n')
    );
    expect(text).toContain('1 SOUR @VOID@');
    expect(text).toContain('2 DATE JULIAN 1 JAN 1700');
    expect(text).toContain('2 AGE 48y');
  });

  test('carries Marks and Matches, their Boxes, the original pages and the citations made in the app', async () => {
    await importFixture();
    const db = registry.open('a');
    const index =
      'https://www.myheritage.fi/research/collection-30233/x?itemId=7';
    const other =
      'https://www.myheritage.fi/research/collection-10509/x?itemId=2';
    const ids = (
      [
        [2, index, 0],
        [3, other, 1]
      ] as const
    ).map(
      ([person, page, added]) =>
        db.run(
          "INSERT INTO citations (scope_type, scope_id, source_id, page, added_in_app, sort_order) VALUES ('person', ?, 1, ?, ?, 0)",
          [person, page, added]
        ).lastInsertRowid
    );
    const marks = openMarks(db);
    const volume =
      'I Aa:5 Pää- ja rippikirjat, I Haapakoski - Längelmäki (1859-1868)';
    marks.write('record 1', {
      volumeId: '1234',
      volume,
      image: 25,
      fileId: '5678',
      box: { left: 10, top: 20, width: 300, height: 40 },
      by: 'hand'
    });
    marks.write(`url ${index}`, {
      volumeId: '1234',
      volume,
      image: 25,
      fileId: '5678',
      box: { left: 10, top: 80, width: 300, height: 40 },
      by: 'vision'
    });
    // A Mark writes only to references; a Citation made in the app holds
    // its Link as it was written (ADR-0016).
    openAnnotations(db).swap([Number(ids[1])], {
      volumeId: '999',
      volume: 'I Ab:1',
      by: 'hand'
    });
    db.run(
      "INSERT INTO rejections (reference_url, volume_id, image) VALUES (?, '1234', 3)",
      [index]
    );

    const text = gedcomOf(await roundTrip());
    expect(treeSnapshot(registry.open('b'))).toEqual(treeSnapshot(db));
    expect(gedcom7Errors(text)).toEqual([]);
    expect(text).toContain(
      [
        '2 PAGE https://astia.narc.fi/uusiastia/viewer/?fileId=5678&aineistoId=1234',
        '2 DATA'
      ].join('\r\n')
    );
    expect(text).toContain(
      [
        '2 OBJE @A1@',
        '3 CROP',
        '4 TOP 20',
        '4 LEFT 10',
        '4 HEIGHT 40',
        '4 WIDTH 300',
        '2 NOTE Original page: https://www.myheritage.fi/research/collection-10509/x?itemId=1'
      ].join('\r\n')
    );
    expect(text).toContain(
      '1 SOUR @S1@\r\n2 PAGE https://www.myheritage.fi/research/collection-30233/x?itemId=7\r\n2 OBJE @A1@'
    );
    expect(text).toContain(
      '2 NOTE Found by the vision model, not checked by hand'
    );
    expect(text).toContain(
      '2 NOTE Astia Volume 999: I Ab:1\r\n2 NOTE Added in Sukulinja'
    );
    expect(text).toContain(
      [
        '0 @A1@ OBJE',
        '1 FILE https://astia.narc.fi/uusiastia/ws/getFile.php?fileId=5678&aineistoId=1234',
        '2 FORM image/jpeg',
        `2 TITL ${volume}, Image 25`
      ].join('\r\n')
    );
    // One OBJE record per Image, and no media made of it.
    expect(text.match(/0 @A\d+@ OBJE/g)).toHaveLength(1);
    expect(
      registry.open('b').query('SELECT COUNT(*) AS n FROM media').get()
    ).toEqual({ n: 3 });
    // Rejections stay out of the GEDZIP.
    expect(
      registry.open('b').query('SELECT COUNT(*) AS n FROM rejections').get()
    ).toEqual({ n: 0 });
  });

  test("carries a Citation made in the app on an Image, and its Volume's source", async () => {
    await importFixture();
    const db = registry.open('a');
    const volume = 'I Aa:5 Pää- ja rippikirjat (1859-1868)';
    const made = openAppCitations(db);
    for (const personId of [2, 3]) {
      made.create({
        personId,
        volumeId: '1234',
        volume,
        archive: 'Juvan seurakunnan arkisto',
        image: 25,
        fileId: '5678',
        box: { left: 10, top: 20, width: 300, height: 40 },
        text: 'Baptism 12.3.1860'
      });
    }

    const text = gedcomOf(await roundTrip());
    expect(treeSnapshot(registry.open('b'))).toEqual(treeSnapshot(db));
    expect(gedcom7Errors(text)).toEqual([]);
    expect(text).toContain(
      [
        '0 @ASTIA_1234@ SOUR',
        `1 TITL Juvan seurakunnan arkisto, ${volume}`,
        '1 PUBL Kansallisarkisto, Astia'
      ].join('\r\n')
    );
    expect(text.match(/1 SOUR @ASTIA_1234@/g)).toHaveLength(2);
    // Its PAGE reads as an archive's book is cited, its address last, which
    // the import reads back as its page (ADR-0019).
    expect(text).toContain(
      `2 PAGE Juvan seurakunnan arkisto, ${volume}. Kansallisarkisto, Astia, kuva 25. https://astia.narc.fi/uusiastia/viewer/?fileId=5678&aineistoId=1234`
    );
    expect(text).toContain('3 TEXT Baptism 12.3.1860');
    expect(text).toContain('2 NOTE Added in Sukulinja');
    const b = registry.open('b');
    expect(
      b
        .query(
          `SELECT link_image, link_box_top, added_in_app FROM ${CITATIONS_READ} WHERE added_in_app = 1`
        )
        .all()
    ).toEqual([
      { link_image: 25, link_box_top: 20, added_in_app: 1 },
      { link_image: 25, link_box_top: 20, added_in_app: 1 }
    ]);
  });

  test('repeats a Citation under each Fact it supports, and reads it back as support', async () => {
    await importFixture();
    const db = registry.open('a');
    const id = openAppCitations(db).create({
      personId: 1,
      volumeId: '1234',
      volume: 'I Aa:5 Pää- ja rippikirjat (1859-1868)',
      archive: 'Juvan seurakunnan arkisto',
      image: 25,
      fileId: '5678',
      box: { left: 10, top: 20, width: 300, height: 40 },
      text: 'Born 1.2.1801, died 1870'
    });
    const support = openSupport(db);
    const facts = db
      .query<{ id: number }, []>(
        "SELECT id FROM facts WHERE scope_type = 'person' AND scope_id = 1 AND tag IN ('BIRT', 'DEAT')"
      )
      .all();
    expect(facts).toHaveLength(2);
    for (const f of facts) support.add(id, f.id);

    const text = gedcomOf(await roundTrip());
    expect(text.match(/SOUR @ASTIA_1234@/g)).toHaveLength(3);
    expect(text.match(/\d TEXT Born 1\.2\.1801, died 1870/g)).toHaveLength(3);
    // Each copy shows the entry on its Image too, one OBJE record for all.
    expect(text.match(/\d OBJE @A\d+@\r\n\d CROP/g)).toHaveLength(3);
    // The import reads every line of the copies.
    const stats = importGedcom(
      openDb(':memory:'),
      parseGedcom(text),
      () => null
    );
    expect(stats.unstored.filter((u) => u.path.includes('SOUR'))).toEqual([]);
    expect(gedcom7Errors(text)).toEqual([]);
    const b = registry.open('b');
    expect(treeSnapshot(b)).toEqual(treeSnapshot(db));
    expect(
      b
        .query('SELECT COUNT(*) AS n FROM citations WHERE added_in_app = 1')
        .get()
    ).toEqual({ n: 1 });
  });

  test('gives back the demo, which is valid GEDCOM 7 but for one untyped event', async () => {
    await registry.import({
      slug: 'a',
      source: { gedzip: await Bun.file(DEMO).bytes() },
      sourceFilename: 'bourbon.gdz'
    });
    const zip = await roundTrip();
    expect(treeSnapshot(registry.open('b'))).toEqual(
      treeSnapshot(registry.open('a'))
    );
    // The demo has an EVEN with an empty TYPE; GEDCOM 7 requires one, and
    // the export doesn't make one up.
    expect(gedcom7Errors(gedcomOf(zip))).toEqual([
      'VAL002 Missing required tag TYPE in EVEN'
    ]);
  });
});

test("reads FamilySearch's maximal70 GEDZIP, its escaped FILE included", async () => {
  await registry.import({
    slug: 'max',
    source: { gedzip: await Bun.file(MAXIMAL).bytes() },
    sourceFilename: 'maximal70.gdz'
  });
  const paths = registry
    .open('max')
    .query<{ original_path: string }, []>('SELECT original_path FROM media')
    .all()
    .map((r) => r.original_path);
  expect(paths).toContain('media/CharlotteBront%C3%AB.jpg');
});
