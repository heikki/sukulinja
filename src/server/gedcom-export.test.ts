import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';

import { importGedcomFixture } from '../../test/gedcom-fixture';
import { gedcom7Errors } from '../../test/gedcom7/validate';
import { treeSnapshot } from '../../test/tree-snapshot';
import { openAppCitations } from './app-citations';
import { openMarks } from './citation-scans/marks';
import { DatasetRegistry } from './dataset-registry';
import { exportDataset } from './export-dataset';
import { line, pointer, writeGedcom } from './gedcom-writer';
import { importDataset } from './import-dataset';

const DEMO = resolve(import.meta.dir, '../../resources/demo/bourbon.gdz');
const MAXIMAL = resolve(import.meta.dir, '../../test/gedcom7/maximal70.gdz');

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
  const gdz = await exportDataset(registry, 'a');
  await importDataset({
    registry,
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
      'photos/Charlotte Brontë.jpg'
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
    for (const [person, page, added] of [
      [2, index, 0],
      [3, other, 1]
    ] as const) {
      db.run(
        "INSERT INTO citations (scope_type, scope_id, source_id, page, added_in_app, sort_order) VALUES ('person', ?, 1, ?, ?, 0)",
        [person, page, added]
      );
    }
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
    marks.write('record 2', { volumeId: '999', volume: 'I Ab:1', by: 'hand' });
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
    ).toEqual({ n: 2 });
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
        `1 TITL ${volume}`,
        '1 PUBL Kansallisarkisto, Astia'
      ].join('\r\n')
    );
    expect(text.match(/1 SOUR @ASTIA_1234@/g)).toHaveLength(2);
    expect(text).toContain('3 TEXT Baptism 12.3.1860');
    expect(text).toContain('2 NOTE Added in Sukulinja');
    const b = registry.open('b');
    expect(
      b
        .query(
          'SELECT link_image, link_box_top, added_in_app FROM citations WHERE added_in_app = 1'
        )
        .all()
    ).toEqual([
      { link_image: 25, link_box_top: 20, added_in_app: 1 },
      { link_image: 25, link_box_top: 20, added_in_app: 1 }
    ]);
  });

  test('gives back the demo, which is valid GEDCOM 7 but for one untyped event', async () => {
    await importDataset({
      registry,
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
      expect.stringContaining('INDI-EVEN requires a') as string
    ]);
  });
});

test("reads FamilySearch's maximal70 GEDZIP, its escaped FILE included", async () => {
  await importDataset({
    registry,
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
