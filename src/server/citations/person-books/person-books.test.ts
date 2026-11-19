import { expect, test } from 'bun:test';

import type { CitationRow, FactRow } from '@/common/types';

import { memoryParishes } from '../astia/parishes';
import { JUVA, juvaAstia } from '../astia/test-parish';
import { openPersonBooks } from './index';

const SAAMINKI = '1231967062';

// Juva's two rippikirjat (1790-1796, 1797-1803) and baptisms (1790-1810),
// and Sääminki's rippikirja and baptisms, one not digitized.
const astia = juvaAstia(
  'Juvan seurakunnan arkisto',
  undefined,
  {},
  {
    [SAAMINKI]: {
      title: 'Säämingin seurakunnan arkisto',
      volumes: [
        {
          id: 'saa-1',
          label: 'I Aa:1 Pää- ja rippikirjat (1795-1805)',
          images: 5
        },
        {
          id: 'saa-2',
          label: 'I C:1 Syntyneiden ja kastettujen luettelot (1790-1800)',
          images: 5,
          digitized: false
        }
      ]
    }
  }
);
const books = openPersonBooks({ astia, parishes: memoryParishes() });

let next = 1;
function fact(tag: string, date: string, place: string | null) {
  next += 1;
  return {
    id: next,
    familyId: null,
    tag,
    type: null,
    date,
    place,
    address: null,
    value: null,
    spouse: null
  } satisfies FactRow;
}

function citedIn(parish: string): Pick<CitationRow, 'cited'> {
  return { cited: { parish, kind: 'rippi', years: null } };
}

test("finds the Volumes a person's Facts fit, in the parishes their places name", async () => {
  const [baptism, , life] = await books.booksFor({
    facts: [
      fact('BIRT', '2 FEB 1796', 'Kaipola, Juva, Suomi'),
      fact('RESI', 'BET 1800 AND 1802', 'Koikkala, Sääminki, Suomi'),
      fact('DEAT', '1802', 'Juva, Suomi')
    ],
    citations: []
  });
  expect(baptism?.parishes).toEqual([
    { archiveId: JUVA, title: 'Juvan seurakunnan arkisto', parish: 'Juva' }
  ]);
  expect(baptism?.volumes).toEqual([
    {
      id: 'juva-3',
      label: 'I C:1 Syntyneiden ja kastettujen luettelot (1790-1810)',
      years: { from: 1790, to: 1810 },
      archiveId: JUVA,
      archive: 'Juvan seurakunnan arkisto',
      parish: 'Juva',
      near: true
    }
  ]);
  // A life is looked for wherever they lived, their residences' first.
  expect(life?.volumes.map((v) => [v.id, v.near])).toEqual([
    ['saa-1', true],
    ['juva-1', true],
    ['juva-2', true]
  ]);
});

test("looks in the person's other parishes where a Fact names none", async () => {
  const [baptism] = await books.booksFor({
    facts: [fact('BIRT', '1796', null)],
    citations: [citedIn('Juva')]
  });
  expect(baptism?.volumes.map((v) => [v.id, v.near])).toEqual([
    ['juva-3', false]
  ]);
});

test('offers no Volume not digitized, and says where it looked', async () => {
  const [baptism] = await books.booksFor({
    facts: [fact('BIRT', '1796', 'Sääminki')],
    citations: []
  });
  expect(baptism?.parishes.map((p) => p.archiveId)).toEqual([SAAMINKI]);
  expect(baptism?.volumes).toEqual([]);
});

test('looks nowhere for a person whose places name no known parish', async () => {
  const [baptism] = await books.booksFor({
    facts: [fact('BIRT', '1796', 'Pariisi, Ranska')],
    citations: []
  });
  expect(baptism?.parishes).toEqual([]);
  expect(baptism?.volumes).toEqual([]);
});
