import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

import { memoryAstia } from './citation-scans/memory-astia';
import { openScans } from './citation-scans/scans';
import { pinsOf } from './citation-scans/test-pins';
import { createCitations } from './citations';
import { openDb } from './db';
import { importGedcom } from './gedcom-import';
import { parseGedcom } from './gedcom-parser';
import { createPersonDetails } from './person-details';

// Facts and names never read the pins.
const UNREAD = memoryAstia({});
const SCANS = openScans({
  pins: pinsOf(join(tmpdir(), 'person-details-unread'), openDb(':memory:'), {
    astia: UNREAD
  }),
  astia: UNREAD
});

const RIPPI =
  'https://www.myheritage.fi/research/collection-10509/x?itemId=1&action=showRecord';

const GEDCOM = [
  '0 @S1@ SOUR',
  '1 TITL Suomalaiset rippi- ja lastenkirjat, 1657-1915',
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/',
  '1 SEX M',
  '1 DEAT',
  '2 DATE 1820',
  '1 BIRT',
  '2 DATE 1757',
  '2 PLAC Pitäjä',
  '1 RESI',
  '2 DATE BET 1794 AND 1808',
  '2 ADDR',
  '3 ADR1 No. 3, Kylämaa, Pitäjä',
  '1 SOUR Family bible',
  '1 SOUR @S1@',
  `2 PAGE ${RIPPI}`,
  '2 DATA',
  '3 TEXT Matti EsimerkkiKirja: Rippikirja, 1794 - 1808Sivu: 139',
  '0 @I2@ INDI',
  '1 NAME Liisa /Malli/',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 MARR',
  '2 DATE 1780',
  ''
].join('\n');

test('serves facts in date order, and the Citations', () => {
  const db = openDb(':memory:');
  importGedcom(db, parseGedcom(GEDCOM), () => null);
  const { citations, ...details } = createPersonDetails(
    db,
    createCitations(db, SCANS)
  )(1)!;
  expect(citations.map((c) => c.id)).toEqual([2, 1]);
  expect(details).toEqual({
    id: 1,
    name: 'Matti Esimerkki',
    sex: 'M',
    facts: [
      {
        tag: 'BIRT',
        date: '1757',
        place: 'Pitäjä',
        address: null,
        value: null,
        spouse: null
      },
      {
        tag: 'MARR',
        date: '1780',
        place: null,
        address: null,
        value: null,
        spouse: 'Liisa Malli'
      },
      {
        tag: 'RESI',
        date: 'BET 1794 AND 1808',
        place: null,
        address: 'No. 3, Kylämaa, Pitäjä',
        value: null,
        spouse: null
      },
      {
        tag: 'DEAT',
        date: '1820',
        place: null,
        address: null,
        value: null,
        spouse: null
      }
    ]
  });
  expect(createPersonDetails(db, createCitations(db, SCANS))(99)).toBeNull();
});

test('serves birth first and death last, whatever their dates', () => {
  const gedcom = [
    '0 @I1@ INDI',
    '1 NAME Matti /Esimerkki/',
    '1 BURI',
    '2 DATE 1820',
    '1 DEAT',
    '1 RESI',
    '2 DATE 1750',
    '1 BIRT',
    '1 OCCU Torppari',
    ''
  ].join('\n');
  const db = openDb(':memory:');
  importGedcom(db, parseGedcom(gedcom), () => null);
  const tags = createPersonDetails(
    db,
    createCitations(db, SCANS)
  )(1)?.facts.map((f) => f.tag);
  expect(tags).toEqual(['BIRT', 'RESI', 'OCCU', 'DEAT', 'BURI']);
});
