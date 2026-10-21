import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';

import { gedcom7Errors } from '../../test/gedcom7/validate';
import { treeSnapshot } from '../../test/tree-snapshot';
import { openMarks } from './citation-scans/marks';
import { DatasetRegistry } from './dataset-registry';
import { exportDataset } from './export-dataset';
import { line, pointer, writeGedcom } from './gedcom-writer';
import { packGedzip } from './gedzip';
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

// GEDCOM 5.5.1 the way MyHeritage and other programs write it, with media.
const FIXTURE = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 LANG Finnish',
  '1 SUBM @U1@',
  '0 @U1@ SUBM',
  '1 NAME A Submitter',
  '0 @R1@ REPO',
  '1 NAME Archive',
  '0 @N1@ NOTE A shared note',
  '1 CONT over two lines',
  '0 @S1@ SOUR',
  '1 TITL Rippikirja',
  '1 AUTH Parish',
  '1 REPO @R1@',
  '0 @I1@ INDI',
  '1 NAME Jane /Doe/',
  '2 TYPE Name at birth',
  '2 GIVN Jane',
  '2 NOTE @N1@',
  '1 NAME  /Doe/',
  '1 SEX F',
  '1 BIRT',
  '2 DATE @#DJULIAN@ 1 JAN 1700',
  '2 PLAC Pajula',
  '3 MAP',
  '4 LATI N61.9',
  '4 LONG E27.1',
  '2 SOUR @S1@',
  '3 DATA',
  '4 TEXT Baptised',
  '3 OBJE',
  '4 FILE actes/baptism.jpg',
  '5 FORM jpg',
  '1 DEAT',
  '2 AGE 48',
  '2 CAUS fever',
  '1 RESI',
  '2 DATE BET 1867 AND 1879',
  '2 ADDR Pajula',
  '3 CITY Haukivuori',
  '1 EVEN',
  '2 TYPE Moved away',
  '1 OBJE',
  '2 FILE photos/Charlotte Brontë.jpg',
  '3 FORM jpg',
  '2 TITL Portrait',
  '2 NOTE Taken in 1900',
  '1 ASSO @I2@',
  '2 RELA Godparent',
  '1 NOTE Line one',
  '2 CONT @line two',
  '1 SOUR @S1@',
  '2 PAGE https://www.myheritage.fi/research/collection-10509/x?itemId=1',
  '2 QUAY 4',
  '2 EVEN Record',
  '3 ROLE 10509:1-:abc',
  '2 DATA',
  '3 DATE 1 JAN 1900',
  '3 TEXT Jane Doe',
  '1 SOUR Parish register, seen in person',
  '1 FAMS @F1@',
  '1 CHAN',
  '2 DATE 4 FEB 2018',
  '3 TIME 20:42:25',
  '0 @I2@ INDI',
  '1 NAME John /Doe/',
  '1 FAMS @F1@',
  '0 @I3@ INDI',
  '1 NAME Child /Doe/',
  '1 FAMC @F1@',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I1@',
  '1 CHIL @I3@',
  '1 MARR',
  '2 DATE 1890',
  '0 TRLR',
  ''
].join('\r\n');

async function importFixture() {
  const gedzip = packGedzip(
    FIXTURE,
    new Map([
      ['photos/Charlotte Brontë.jpg', new Uint8Array([1, 2, 3])],
      ['actes/baptism.jpg', new Uint8Array([4, 5, 6])]
    ])
  );
  await importDataset({
    registry,
    slug: 'a',
    source: { gedzip },
    sourceFilename: 'a.gdz'
  });
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

  test('carries Marks and Vision matches, their Boxes and the pages imported', async () => {
    await importFixture();
    const db = registry.open('a');
    const index =
      'https://www.myheritage.fi/research/collection-30233/x?itemId=7';
    const other =
      'https://www.myheritage.fi/research/collection-10509/x?itemId=2';
    for (const [person, page] of [
      [2, index],
      [3, other]
    ] as const) {
      db.run(
        "INSERT INTO citations (scope_type, scope_id, source_id, page, sort_order) VALUES ('person', ?, 1, ?, 0)",
        [person, page]
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
        '2 NOTE Imported page: https://www.myheritage.fi/research/collection-10509/x?itemId=1'
      ].join('\r\n')
    );
    expect(text).toContain(
      '1 SOUR @S1@\r\n2 PAGE https://www.myheritage.fi/research/collection-30233/x?itemId=7\r\n2 OBJE @A1@'
    );
    expect(text).toContain(
      '2 NOTE Found by the vision model, not checked by hand'
    );
    expect(text).toContain('2 NOTE Astia Volume 999: I Ab:1');
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
