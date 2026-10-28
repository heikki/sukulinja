import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GedcomDocument } from '@domorium/validator';

import { importGedcomFixture } from '../../../test/gedcom-fixture';
import { openMarks } from '../citations/testing';
import { DatasetRegistry } from '../datasets/registry';
import { line } from '../gedcom/writer';
import { writeGedcom551 } from '../gedcom/writer-551';
import { exportGedcom551 } from './gedcom551';

let tmp = '';
let registry = new DatasetRegistry('');
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'export551-'));
  registry = new DatasetRegistry(join(tmp, 'data'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function linesOf(text: string) {
  return text.replace(/^\uFEFF/u, '').split('\r\n');
}

// What a 5.5.1 reader makes of a value and its CONC and CONT lines.
function joined(lines: string[], level: number) {
  const [first, ...rest] = lines;
  let value = first!.replace(/^\d+ \S+ ?/u, '');
  for (const l of rest) {
    if (l.startsWith(`${level} CONC `)) {
      value += l.slice(`${level} CONC `.length);
    } else if (l.startsWith(`${level} CONT`)) {
      value += `\n${l.slice(`${level} CONT `.length)}`;
    }
  }
  return value.replaceAll('@@', '@');
}

describe('writeGedcom551', () => {
  test('splits a long value between two non-space characters, at most 255 with CRLF', () => {
    const note = `${'Pitkä sana, toinen sana @ kolmas. '.repeat(20).trimEnd()}\nLoppu`;
    const { text, long } = writeGedcom551([
      { tag: 'INDI', xref: '@I1@', children: [line('NOTE', note)] }
    ]);
    const lines = linesOf(text).slice(1, -1);
    expect(long).toEqual([]);
    expect(lines.every((l) => Array.from(l).length <= 253)).toBe(true);
    expect(lines.slice(1).every((l) => /^2 CON[CT]/u.test(l))).toBe(true);
    for (const l of lines.filter((x) => x.startsWith('2 CONC'))) {
      expect(l).not.toMatch(/^2 CONC [ ]/u);
    }
    // No line ends in a space, nor splits an @@.
    expect(lines.some((l) => l.endsWith(' '))).toBe(false);
    expect(lines.some((l) => /[^@]@$/u.test(l.replaceAll('@@', '')))).toBe(
      false
    );
    expect(joined(lines, 2)).toBe(note);
  });

  test('doubles every @ but in a date, and reports a FILE it cannot split', () => {
    const url = `https://example.org/${'x'.repeat(260)}`;
    const { text, long } = writeGedcom551([
      {
        tag: 'INDI',
        xref: '@I1@',
        children: [
          line('NOTE', 'mail a@b.fi'),
          line('BIRT', null, [line('DATE', '@#DJULIAN@ 1 JAN 1700')]),
          line('OBJE', null, [line('FILE', url)])
        ]
      }
    ]);
    expect(linesOf(text)).toEqual([
      '0 @I1@ INDI',
      '1 NOTE mail a@@b.fi',
      '1 BIRT',
      '2 DATE @#DJULIAN@ 1 JAN 1700',
      '1 OBJE',
      `2 FILE ${url}`,
      ''
    ]);
    expect(long).toEqual(['FILE']);
  });
});

describe('exporting for MyHeritage', () => {
  test('writes valid GEDCOM 5.5.1 without photos', async () => {
    await importGedcomFixture(registry, 'a');
    const { text, left } = exportGedcom551(registry.open('a'));
    const lines = linesOf(text);

    expect(lines.slice(0, 10)).toEqual([
      '0 HEAD',
      '1 SOUR SUKULINJA',
      '2 NAME Sukulinja',
      '1 SUBM @U1@',
      '1 GEDC',
      '2 VERS 5.5.1',
      '2 FORM LINEAGE-LINKED',
      '1 CHAR UTF-8',
      '1 LANG Finnish',
      '0 @I1@ INDI'
    ]);
    expect(lines.every((l) => Array.from(l).length <= 253)).toBe(true);
    expect(
      new GedcomDocument().createDocument(text.slice(1)).getErrors()
    ).toEqual([]);

    // No photos: not on people, events or citations, and no records of them.
    expect(lines.filter((l) => l.includes('OBJE'))).toEqual([]);
    expect(left).toEqual(['2 photo links']);

    for (const expected of [
      // GEDCOM 7's ways, back as 5.5.1 writes them.
      ['2 TYPE Name at birth'],
      ['2 NOTE @N1@'],
      ['2 DATE @#DJULIAN@ 1 JAN 1700'],
      ['1 ASSO @I2@', '2 RELA Godparent'],
      ['1 NOTE Line one', '2 CONT @@line two'],
      ['2 EVEN Record', '3 ROLE 10509:1-:abc'],
      ['1 SOUR Parish register, seen in person'],
      ['0 @N1@ NOTE A shared note', '1 CONT over two lines']
    ]) {
      expect(text).toContain(expected.join('\r\n'));
    }
    expect(lines.filter((l) => l.startsWith('1 _UID '))).toHaveLength(4);
    expect(lines.filter((l) => l.includes(' UID '))).toEqual([]);
  });

  test('links a Mark to its Image without a Box, and leaves out "Added in Sukulinja"', async () => {
    await importGedcomFixture(registry, 'a');
    const db = registry.open('a');
    const page =
      'https://www.myheritage.fi/research/collection-30233/x?itemId=7';
    db.run(
      "INSERT INTO citations (scope_type, scope_id, source_id, page, added_in_app, sort_order) VALUES ('person', 2, 1, ?, 1, 0)",
      [page]
    );
    openMarks(db).write(`url ${page}`, {
      volumeId: '1234',
      volume: 'I Aa:5 Rippikirja',
      image: 25,
      fileId: '5678',
      box: { left: 10, top: 80, width: 300, height: 40 },
      by: 'vision'
    });
    const { text, left } = exportGedcom551(db);

    expect(text).toContain(
      [
        '1 SOUR @S1@',
        `2 PAGE ${page}`,
        '2 OBJE @A1@',
        '2 NOTE Found by the vision model, not checked by hand',
        '0 @I3@ INDI'
      ].join('\r\n')
    );
    expect(text).toContain(
      [
        '0 @A1@ OBJE',
        '1 FILE https://astia.narc.fi/uusiastia/ws/getFile.php?fileId=5678&aineistoId=1234',
        '2 FORM jpg',
        '2 TITL I Aa:5 Rippikirja, Image 25',
        '0 TRLR'
      ].join('\r\n')
    );
    expect(text).not.toContain('CROP');
    expect(text).not.toContain('Added in Sukulinja');
    expect(left).toEqual(['2 photo links', '1 Boxes, as 5.5.1 has no crop']);
    expect(
      new GedcomDocument().createDocument(text.slice(1)).getErrors()
    ).toEqual([]);
  });

  test('adds a submitter when the dataset has none', async () => {
    await registry.createStaging('b').then(async (s) => {
      s.db.run("INSERT INTO persons (xref, uid) VALUES ('@I1@', 'u-1')");
      await s.commit();
    });
    const lines = linesOf(exportGedcom551(registry.open('b')).text);
    expect(lines).toContain('1 SUBM @U1@');
    expect(lines.slice(-4)).toEqual([
      '0 @U1@ SUBM',
      '1 NAME Sukulinja',
      '0 TRLR',
      ''
    ]);
  });
});
