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
