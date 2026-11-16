import { describe, expect, test } from 'bun:test';

import {
  entriesPrompt,
  entryNames,
  householdTable,
  toEntries,
  toPages
} from './claude-reader';

const members = [
  { relation: 'Perheenpää', name: 'Matti Esimerkki', born: '1757' },
  { relation: 'Vaimo', name: 'Liisa Malli', born: 'Touko 1760' },
  { relation: 'Tytär', name: 'Anna', born: null }
];

describe('householdTable', () => {
  test('lists the household in order, marking the person', () => {
    const anna = {
      name: 'Anna',
      household: {
        born: null,
        relation: 'Tytär',
        with: 'Matti Esimerkki',
        members
      }
    };
    expect(householdTable(anna)).toContain(
      [
        '- Perheenpää: Matti Esimerkki, born 1757',
        '- Vaimo: Liisa Malli, born Touko 1760',
        '- Tytär: Anna  ← this person'
      ].join('\n')
    );
  });

  test('gives nothing for a person listed alone', () => {
    const alone = members.slice(0, 1);
    const matti = {
      name: 'Matti Esimerkki',
      household: {
        born: '1757',
        relation: 'Perheenpää',
        with: null,
        members: alone
      }
    };
    expect(householdTable(matti)).toBe('');
    expect(householdTable({ name: 'Matti Esimerkki' })).toBe('');
  });
});

describe('entryNames', () => {
  test("lists the people an index entry names, for a parent's citation", () => {
    const matti = {
      name: 'Matti Esimerkki',
      named: [
        { relation: 'father' as const, name: 'Matti Esimerkki' },
        { relation: 'mother' as const, name: 'Liisa Malli' },
        { relation: 'child' as const, name: 'Juho Esimerkki' }
      ]
    };
    expect(entryNames(matti)).toContain(
      [
        '- Father: Matti Esimerkki',
        '- Mother: Liisa Malli',
        '- Child: Juho Esimerkki'
      ].join('\n')
    );
  });

  test('gives nothing for a person asked about alone', () => {
    expect(entryNames({ name: 'Matti Esimerkki' })).toBe('');
  });
});

describe('toEntries', () => {
  const scan = { bytes: new Uint8Array(), width: 1000, height: 2000 };
  const answer = {
    readable: true,
    found: true,
    confidence: 0.8,
    born_year: 1757,
    event_date: '',
    box: { x: 100, y: 400, width: 500, height: 40 }
  };

  test('gives each person their own answer, one left out not found', () => {
    const json = { readable: true, people: [{ person: 2, ...answer }] };
    expect(toEntries(json, 2, scan)).toEqual([
      { found: false, confidence: 0, box: null },
      {
        found: true,
        confidence: 0.8,
        bornYear: 1757,
        date: null,
        box: { left: 0.1, top: 0.2, width: 0.5, height: 0.02 }
      }
    ]);
  });

  test('an unreadable Image, or a refusal, leaves everyone unreadable', () => {
    expect(toEntries({ readable: false, people: [] }, 2, scan)).toEqual([
      { unreadable: true },
      { unreadable: true }
    ]);
    expect(toEntries(null, 1, scan)).toEqual([{ unreadable: true }]);
  });
});

test('asks for everyone at once, each by number', () => {
  const prompt = entriesPrompt([
    { name: 'Matti Esimerkki', date: '1791-03-02' },
    { name: 'Liisa Malli' }
  ]);
  expect(prompt).toContain(
    '## Person 1\nName: Matti Esimerkki\nDate of the event: 1791-03-02'
  );
  expect(prompt).toContain('## Person 2\nName: Liisa Malli');
  expect(prompt).not.toContain('Name: …');
});

function hand(number: number) {
  return { number, handwritten: true };
}
function printed(number: number) {
  return { number, handwritten: false };
}

test("a printed form's numbers give way to the handwritten ones", () => {
  expect(toPages({ readable: true, pages: [hand(983), printed(18)] })).toEqual({
    pages: [983]
  });
  // Where the book has no others, printed numbers are its own.
  expect(toPages({ readable: true, pages: [printed(18)] })).toEqual({
    pages: [18]
  });
  expect(toPages({ readable: true, pages: [] })).toEqual({ unreadable: true });
});
