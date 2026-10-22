import { expect, test } from 'bun:test';

import type {
  FamilyRow,
  Link,
  PersonRow,
  VolumeCitation
} from '@/common/types';

import { citeChoices, citingImage, searchable } from './cite';

function person(id: number, given: string, sex: string): PersonRow {
  return {
    id,
    given,
    surname: 'Esimerkki',
    sex,
    birth_year: 1790 + id,
    death_year: null,
    birth_date: null,
    death_date: null,
    died: false,
    photo_path: null,
    crop: null
  };
}

// Matti (1), his parents Juho (2) and Liisa (3), his sister Maria (4); his
// wife Anna (5) and their son Heikki (6).
const PEOPLE = [
  person(1, 'Matti', 'M'),
  person(2, 'Juho', 'M'),
  person(3, 'Liisa', 'F'),
  person(4, 'Maria', 'F'),
  person(5, 'Anna', 'F'),
  person(6, 'Heikki', 'M'),
  person(7, 'Outsider', 'M')
];
const BORN: FamilyRow = { id: 1, husband_id: 2, wife_id: 3, child_ids: [1, 4] };
const OWN: FamilyRow = { id: 2, husband_id: 1, wife_id: 5, child_ids: [6] };
const IX = {
  persons: new Map(PEOPLE.map((p) => [p.id, p])),
  parentFamByPerson: new Map([
    [1, BORN],
    [4, BORN],
    [6, OWN]
  ]),
  spouseFamsByPerson: new Map([
    [1, [OWN]],
    [2, [BORN]],
    [3, [BORN]],
    [5, [OWN]]
  ])
};

// Each choice as the menu reads: relation, name, years.
function labels(left: number[]) {
  return citeChoices(1, IX, new Set(left)).map((c) =>
    [c.muted?.before, c.label, c.muted?.after].filter(Boolean).join(' ')
  );
}

test('lists the Selected person, then their family, each by how related and their years', () => {
  expect(labels([])).toEqual([
    'Matti Esimerkki (1791)',
    'Father · Juho Esimerkki (1792)',
    'Mother · Liisa Esimerkki (1793)',
    'Sister · Maria Esimerkki (1794)',
    'Wife · Anna Esimerkki (1795)',
    'Son · Heikki Esimerkki (1796)'
  ]);
});

test('leaves out those already citing the Image, down to nobody', () => {
  expect(labels([1, 3])).toEqual([
    'Father · Juho Esimerkki (1792)',
    'Sister · Maria Esimerkki (1794)',
    'Wife · Anna Esimerkki (1795)',
    'Son · Heikki Esimerkki (1796)'
  ]);
  expect(labels([1, 2, 3, 4, 5, 6])).toEqual([]);
  expect([
    ...searchable(IX.persons, new Set([1, 2, 3, 4, 5, 6])).keys()
  ]).toEqual([7]);
});

function row(personId: number, link: Link): VolumeCitation {
  return {
    personId,
    citation: {
      id: personId,
      source: null,
      reference: null,
      entry: null,
      page: null,
      url: null,
      record: null,
      text: null,
      churchBook: true,
      madeInApp: false,
      markKey: `citation ${personId}`,
      citedPage: null,
      cited: null
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
