import { expect, test } from 'bun:test';

import { openDb, SCHEMA_VERSION } from '../datasets/db';
import { parseGedcom } from '../gedcom/parser';
import { importGedcom } from './gedcom';

// MyHeritage-shaped: a source record, a citation pointing at it whose TEXT
// runs over CONC lines and raw lines without a level number, and an inline
// citation with no source record.
const GEDCOM = [
  '0 HEAD',
  '0 @S1@ SOUR',
  '1 TITL Suomalaiset rippi- ja lastenkirjat, 1657-1915',
  '1 PUBL MyHeritage',
  '0 @I1@ INDI',
  '1 NAME Jane /Doe/',
  '1 SOUR @S1@',
  '2 PAGE https://www.myheritage.fi/research/collection-10509/x?itemId=1',
  '2 QUAY 4',
  '2 DATA',
  '3 TEXT Jane Doe',
  '4 CONC Kirja: ',
  '\tMaa:FinlandKirja:Rippikirja, 1794 - 1808',
  '\tHallintoalue:PajulaSivu:139',
  'Katso talou',
  '4 CONC den jäseniä',
  '1 SOUR Parish register, seen in person',
  '2 PAGE p. 12',
  ''
].join('\n');

test('imports source records and person citations as recorded', () => {
  const db = openDb(':memory:');
  const stats = importGedcom(db, parseGedcom(GEDCOM), () => null);
  expect(stats.sources).toBe(1);
  expect(stats.citations).toBe(2);

  const rows = db
    .query<
      {
        title: string | null;
        page: string | null;
        quality: number | null;
        text: string | null;
      },
      []
    >(
      `SELECT s.title, c.page, c.quality, c.text FROM citations c
       LEFT JOIN sources s ON s.id = c.source_id ORDER BY c.sort_order`
    )
    .all();
  expect(rows).toEqual([
    {
      title: 'Suomalaiset rippi- ja lastenkirjat, 1657-1915',
      page: 'https://www.myheritage.fi/research/collection-10509/x?itemId=1',
      // MyHeritage's 4 is GEDCOM's best, 3.
      quality: 3,
      text: [
        'Jane DoeKirja: ',
        'Maa:FinlandKirja:Rippikirja, 1794 - 1808',
        'Hallintoalue:PajulaSivu:139',
        'Katso talouden jäseniä'
      ].join('\n')
    },
    {
      title: null,
      page: 'p. 12',
      quality: null,
      text: 'Parish register, seen in person'
    }
  ]);
});

function importText(lines: string[]) {
  const db = openDb(':memory:');
  const stats = importGedcom(db, parseGedcom(lines.join('\n')), (p) => p);
  return { db, stats };
}

test('stores notes, causes, ages, types, citation dates and source authors, in order', () => {
  const { db, stats } = importText([
    '0 @S1@ SOUR',
    '1 TITL Rippikirja',
    '1 AUTH Parish of Pajula',
    '1 TEXT The household pages',
    '0 @I1@ INDI',
    '1 NAME Jane /Doe/',
    '2 GIVN Jane',
    '2 SURN Doe',
    '1 NOTE First note',
    '1 NOTE Second note',
    '1 CENS',
    '2 DATE 1900',
    '1 EVEN',
    '2 TYPE Moved away',
    '1 DEAT Y',
    '2 AGE 80y',
    '2 CAUS fever',
    '2 NOTE On the farm',
    '1 RESI',
    '2 ADDR Pajula',
    '3 ADR1 Pajula',
    '3 CITY Haukivuori',
    '1 SOUR @S1@',
    '2 PAGE p. 4',
    '2 EVEN Record',
    '3 ROLE 10509:1-:abc',
    '2 DATA',
    '3 DATE 1 JAN 1900',
    '3 TEXT Jane Doe',
    '0 TRLR'
  ]);
  expect(stats.unstored).toEqual([]);
  expect(
    db
      .query('SELECT text FROM notes WHERE owner_type = ? ORDER BY sort_order')
      .all('person')
  ).toEqual([{ text: 'First note' }, { text: 'Second note' }]);
  expect(
    db
      .query(
        'SELECT tag, type, date_text AS date, address, age, cause FROM facts ORDER BY sort_order'
      )
      .all()
  ).toEqual([
    {
      tag: 'CENS',
      type: null,
      date: '1900',
      address: null,
      age: null,
      cause: null
    },
    {
      tag: 'EVEN',
      type: 'Moved away',
      date: null,
      address: null,
      age: null,
      cause: null
    },
    {
      tag: 'DEAT',
      type: null,
      date: null,
      address: null,
      age: '80y',
      cause: 'fever'
    },
    {
      tag: 'RESI',
      type: null,
      date: null,
      address: 'Pajula, Pajula, Haukivuori',
      age: null,
      cause: null
    }
  ]);
  expect(
    db.query('SELECT text FROM notes WHERE owner_type = ?').all('fact')
  ).toEqual([{ text: 'On the farm' }]);
  expect(
    db.query('SELECT owner_type, text, line1, city FROM addresses').all()
  ).toEqual([
    { owner_type: 'fact', text: 'Pajula', line1: 'Pajula', city: 'Haukivuori' }
  ]);
  expect(
    db.query('SELECT tag, value FROM name_pieces ORDER BY sort_order').all()
  ).toEqual([
    { tag: 'GIVN', value: 'Jane' },
    { tag: 'SURN', value: 'Doe' }
  ]);
  expect(
    db.query('SELECT event, role, data_date, page FROM citations').all()
  ).toEqual([
    {
      event: 'Record',
      role: '10509:1-:abc',
      data_date: '1 JAN 1900',
      page: 'p. 4'
    }
  ]);
  expect(db.query('SELECT author, text FROM sources').all()).toEqual([
    { author: 'Parish of Pajula', text: 'The household pages' }
  ]);
});

test('lists each kind of line it has nowhere to store, by path and count', () => {
  const { stats } = importText([
    '0 HEAD',
    '1 GEDC',
    '2 VERS 5.5.1',
    '0 @I1@ INDI',
    '1 NAME Jane /Doe/',
    '1 RIN MH:I1',
    '1 _UPD 26 MAR 2026',
    '1 BIRT',
    '2 PLAC Pajula',
    '3 FORM Village',
    '1 ALIA @I2@',
    '1 ALIA @I3@',
    '1 NOTE @N9@',
    '0 @I2@ INDI',
    '0 @O1@ OBJE',
    '1 FILE a.jpg',
    '0 TRLR'
  ]);
  expect(stats.unstored).toEqual([
    { path: 'INDI.ALIA', count: 2 },
    { path: 'INDI.BIRT.PLAC.FORM', count: 1 },
    { path: 'INDI.NOTE', count: 1 },
    { path: 'OBJE', count: 1 }
  ]);
});

test('keeps each UID as written, and gives everyone without one a new one', () => {
  const { db } = importText([
    '0 @I1@ INDI',
    '1 UID 57946566E10CCFB0735B471A8829D14E',
    '0 @I2@ INDI',
    '0 @I3@ INDI',
    '0 @F1@ FAM',
    '1 UID 0F1A',
    '0 @F2@ FAM'
  ]);
  const persons = db
    .query<{ uid: string }, []>('SELECT uid FROM persons ORDER BY id')
    .all()
    .map((r) => r.uid);
  expect(persons[0]).toBe('57946566E10CCFB0735B471A8829D14E');
  expect(persons[1]).toMatch(/^[0-9a-f-]{36}$/);
  expect(persons[2]).toMatch(/^[0-9a-f-]{36}$/);
  expect(persons[1]).not.toBe(persons[2]);
  const families = db
    .query<{ uid: string }, []>('SELECT uid FROM families ORDER BY id')
    .all()
    .map((r) => r.uid);
  expect(families[0]).toBe('0F1A');
  expect(families[1]).toMatch(/^[0-9a-f-]{36}$/);
});

test('puts the photo marked _PRIM first', () => {
  const { db, stats } = importText([
    '0 @I1@ INDI',
    '1 OBJE',
    '2 FILE a.jpg',
    '3 FORM image/jpeg',
    '1 OBJE',
    '2 FILE b.jpg',
    '3 FORM image/jpeg',
    '2 _PRIM Y',
    '2 TITL Portrait'
  ]);
  expect(stats.unstored).toEqual([]);
  expect(
    db
      .query(
        `SELECT m.file_path AS file, ml.title, ml.sort_order AS n FROM media_links ml
         JOIN media m ON m.id = ml.media_id ORDER BY ml.sort_order`
      )
      .all()
  ).toEqual([
    { file: 'b.jpg', title: 'Portrait', n: 0 },
    { file: 'a.jpg', title: null, n: 1 }
  ]);
});

test('stores what other programs write: change dates, map, citations and media on facts, shared notes, associations, repositories, the submitter', () => {
  const { db, stats } = importText([
    '0 HEAD',
    '1 SUBM @B1@',
    '1 LANG French',
    '1 COPR (c) Someone',
    '1 NOTE About this tree',
    '1 PLAC',
    '2 FORM Commune, Pays',
    '0 @B1@ SUBM',
    '1 NAME A Submitter',
    '1 EMAIL a@@example.org',
    '1 ADDR 1 Rue',
    '2 CITY Vienne',
    '0 @R1@ REPO',
    '1 NAME Archive',
    '1 PHON +33 1',
    '0 @R2@ REPO',
    '1 NAME Library',
    '0 @N1@ NOTE A shared note',
    '1 SOUR @S1@',
    '0 @S1@ SOUR',
    '1 TITL Register',
    '1 REPO @R1@',
    '1 REPO @R2@',
    '1 DATA',
    '2 EVEN BIRT, DEAT',
    '1 CHAN',
    '2 DATE 7 MAY 2020',
    '3 TIME 18:46:35',
    '0 @I1@ INDI',
    '1 NAME Jane /Doe/',
    '2 NOTE @N1@',
    '2 SOUR @S1@',
    '1 NOTE @N1@',
    '1 NOTE Written out',
    '2 SOUR @S1@',
    '1 BIRT',
    '2 AGNC Parish',
    '2 PLAC Paris',
    '3 MAP',
    '4 LATI N48.85',
    '4 LONG E2.35',
    '3 NOTE Old church',
    '2 SOUR @S1@',
    '3 DATA',
    '4 TEXT Baptised',
    '3 OBJE',
    '4 FILE actes/baptism.jpg',
    '5 FORM jpg',
    '4 TITL Baptism record',
    '2 OBJE',
    '3 FILE photos/church.jpg',
    '4 FORM jpg',
    '3 NOTE Before the fire',
    '1 ASSO @I2@',
    '2 RELA Godparent',
    '2 NOTE Named after her',
    '1 CHAN',
    '2 DATE 4 FEB 2018',
    '3 TIME 20:42:25',
    '0 @I2@ INDI',
    '0 TRLR'
  ]);
  expect(stats.unstored).toEqual([]);
  expect(db.query('SELECT key, value FROM meta ORDER BY key').all()).toEqual([
    { key: 'copyright', value: '(c) Someone' },
    { key: 'header_note', value: 'About this tree' },
    { key: 'language', value: 'fr' },
    { key: 'place_form', value: 'Commune, Pays' },
    { key: 'schema_version', value: String(SCHEMA_VERSION) },
    { key: 'submitter', value: '@B1@' }
  ]);
  expect(db.query('SELECT name, email FROM submitters').all()).toEqual([
    { name: 'A Submitter', email: 'a@example.org' }
  ]);
  expect(
    db
      .query(
        `SELECT r.name FROM source_repositories sr
         JOIN repositories r ON r.id = sr.repository_id ORDER BY sr.sort_order`
      )
      .all()
  ).toEqual([{ name: 'Archive' }, { name: 'Library' }]);
  expect(
    db.query('SELECT data_events, change_date, change_time FROM sources').all()
  ).toEqual([
    {
      data_events: 'BIRT, DEAT',
      change_date: '7 MAY 2020',
      change_time: '18:46:35'
    }
  ]);
  expect(
    db.query('SELECT change_date FROM persons WHERE id = 1').get()
  ).toEqual({ change_date: '4 FEB 2018' });
  expect(
    db.query('SELECT place, latitude, longitude, agency FROM facts').get()
  ).toEqual({
    place: 'Paris',
    latitude: 'N48.85',
    longitude: 'E2.35',
    agency: 'Parish'
  });
  // The shared note is stored once, pointed at from the name and the person.
  expect(db.query('SELECT text FROM shared_notes').all()).toEqual([
    { text: 'A shared note' }
  ]);
  expect(
    db
      .query(
        'SELECT owner_type, text, shared_note_id AS shared FROM notes ORDER BY id'
      )
      .all()
  ).toEqual([
    { owner_type: 'name', text: null, shared: 1 },
    { owner_type: 'place', text: 'Old church', shared: null },
    { owner_type: 'media_link', text: 'Before the fire', shared: null },
    { owner_type: 'association', text: 'Named after her', shared: null },
    { owner_type: 'person', text: null, shared: 1 },
    { owner_type: 'person', text: 'Written out', shared: null }
  ]);
  expect(
    db.query('SELECT scope_type, text FROM citations ORDER BY id').all()
  ).toEqual([
    { scope_type: 'shared_note', text: null },
    { scope_type: 'name', text: null },
    { scope_type: 'fact', text: 'Baptised' },
    { scope_type: 'note', text: null }
  ]);
  expect(
    db
      .query(
        `SELECT ml.scope_type, m.file_path AS file, ml.title FROM media_links ml
         JOIN media m ON m.id = ml.media_id ORDER BY ml.id`
      )
      .all()
  ).toEqual([
    {
      scope_type: 'citation',
      file: 'actes/baptism.jpg',
      title: 'Baptism record'
    },
    { scope_type: 'fact', file: 'photos/church.jpg', title: null }
  ]);
  expect(db.query('SELECT relation FROM associations').all()).toEqual([
    { relation: 'Godparent' }
  ]);
});

test('reads every line of the demo GEDZIP', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { unpackGedzip } = await import('../gedcom/gedzip');
  const dir = await mkdtemp(join(tmpdir(), 'demo-'));
  try {
    const demo = resolve(
      import.meta.dir,
      '../../../resources/demo/bourbon.gdz'
    );
    const { text } = await unpackGedzip(await Bun.file(demo).bytes(), dir);
    const stats = importGedcom(openDb(':memory:'), parseGedcom(text), (p) => p);
    expect(stats.unstored).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
