import { describe, expect, test } from 'bun:test';

import { householdTable } from './claude-reader';

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
