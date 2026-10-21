import { expect, test } from 'bun:test';

import { openDb } from './db';
import { importGedcom } from './gedcom-import';
import { parseGedcom } from './gedcom-parser';

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
      quality: 4,
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
    db.query('SELECT text, line1, city FROM fact_addresses').all()
  ).toEqual([{ text: 'Pajula', line1: 'Pajula', city: 'Haukivuori' }]);
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
    '3 MAP',
    '4 LATI N61.9',
    '1 ASSO @I2@',
    '1 ASSO @I3@',
    '0 @I2@ INDI',
    '1 CHAN',
    '2 DATE 1 JAN 2020',
    '0 @R1@ REPO',
    '1 NAME Archive',
    '0 TRLR'
  ]);
  expect(stats.unstored).toEqual([
    { path: 'INDI.ASSO', count: 2 },
    { path: 'INDI.BIRT.PLAC.MAP', count: 1 },
    { path: 'INDI.CHAN', count: 1 },
    { path: 'REPO', count: 1 }
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
