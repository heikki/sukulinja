import { expect, test } from 'bun:test';

import type {
  FamilyRow,
  Link,
  PersonRow,
  VolumeCitation
} from '@/common/types';

import { citingImage, roleLabel, startingPeople } from './cite';

function row(personId: number, link: Link): VolumeCitation {
  return {
    personId,
    citation: {
      id: personId,
      source: null,
      reference: null,
      entry: null,
      page: null,
      record: null,
      text: null,
      churchBook: true,
      madeInApp: false,
      markKey: `citation ${personId}`,
      citedPage: null,
      cited: null,
      supports: [],
      entryId: null
    },
    link
  };
}

test('those citing the Image are the people beside it, of any certainty', () => {
  const at = { volumeId: '201', volume: 'I Aa:1', url: '' };
  const rows = [
    row(1, { ...at, precision: 'image', image: 18, certainty: 'estimated' }),
    row(2, {
      ...at,
      precision: 'entry',
      image: 18,
      box: { left: 0, top: 0, width: 10, height: 10 },
      certainty: 'match'
    }),
    row(3, { ...at, precision: 'image', image: 19, certainty: 'marked' }),
    row(4, { ...at, precision: 'volume', certainty: 'estimated' })
  ];
  expect([...citingImage(rows, 18)]).toEqual([1, 2]);
});

function person(id: number, sex: string): PersonRow {
  return {
    id,
    given: `P${id}`,
    surname: 'Esimerkki',
    sex,
    birth_year: null,
    death_year: null,
    birth_date: null,
    death_date: null,
    died: false,
    photo_path: null,
    crop: null
  };
}

// Matti (1) is the child of Juho (2) and Liisa (3); Anna (4) has no
// parents in the tree.
const BORN: FamilyRow = { id: 1, husband_id: 2, wife_id: 3, child_ids: [1] };
const IX = {
  persons: new Map(
    [1, 2, 3, 4].map((id) => [id, person(id, id === 1 || id === 2 ? 'M' : 'F')])
  ),
  parentFamByPerson: new Map([[1, BORN]]),
  spouseFamsByPerson: new Map([
    [2, [BORN]],
    [3, [BORN]]
  ])
};
const BAPTISMS = 'I C:3 Syntyneiden ja kastettujen luettelot (1790-1800)';
const MARRIAGES = 'I E:1 Vihittyjen luettelot (1790-1800)';
const RIPPI = 'I Aa:1 Pää- ja rippikirjat (1790-1796)';

test('a new baptism names the Selected person its child and their parents', () => {
  expect(startingPeople(BAPTISMS, 1, IX, new Set())).toEqual([
    { personId: 1, role: 'CHIL' },
    { personId: 2, role: 'FATH' },
    { personId: 3, role: 'MOTH' }
  ]);
  // Those citing the Image already are left out; no parents, none named.
  expect(startingPeople(BAPTISMS, 1, IX, new Set([2]))).toEqual([
    { personId: 1, role: 'CHIL' },
    { personId: 3, role: 'MOTH' }
  ]);
  expect(startingPeople(BAPTISMS, 4, IX, new Set())).toEqual([
    { personId: 4, role: 'CHIL' }
  ]);
  expect(startingPeople(BAPTISMS, null, IX, new Set())).toEqual([]);
});

test('a new marriage names them groom or bride, another Book with no Role', () => {
  expect(startingPeople(MARRIAGES, 1, IX, new Set())).toEqual([
    { personId: 1, role: 'HUSB' }
  ]);
  expect(startingPeople(MARRIAGES, 4, IX, new Set())).toEqual([
    { personId: 4, role: 'WIFE' }
  ]);
  expect(startingPeople(RIPPI, 1, IX, new Set())).toEqual([
    { personId: 1, role: null }
  ]);
  expect(roleLabel(BAPTISMS, 'FATH')).toBe('Father');
  expect(roleLabel(RIPPI, null)).toBe('Add person');
});
