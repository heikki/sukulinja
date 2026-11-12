import { expect, test } from 'bun:test';

import type { FamilyRow, PersonRow } from '@/common/types';

import { unlinkings } from './unlinkings';

function person(id: number, given: string): PersonRow {
  return {
    id,
    given,
    surname: 'Esimerkki',
    sex: null,
    birth_year: null,
    death_year: null,
    birth_date: null,
    death_date: null,
    died: false,
    photo_path: null,
    crop: null
  };
}

function fam(
  id: number,
  husband: number | null,
  wife: number | null,
  children: number[]
): FamilyRow {
  return { id, husband_id: husband, wife_id: wife, child_ids: children };
}

const PERSONS = new Map(
  [person(1, 'Matti'), person(2, 'Liisa'), person(3, 'Juho')].map((p) => [
    p.id,
    p
  ])
);

// Matti (1) and Liisa (2) with Juho (3); Matti alone in a second family.
const TREE = [fam(1, 1, 2, [3]), fam(2, 1, null, [])];

test('offers no unlinking that would cut someone off', () => {
  const tree = { persons: PERSONS, families: TREE };
  expect(unlinkings(3, tree)).toEqual([]);
  expect(unlinkings(1, tree)).toEqual([
    { familyId: 2, label: 'Remove from the family' }
  ]);
});

test('names the others in the family', () => {
  // Juho married to Liisa too: a second way round.
  const tree = { persons: PERSONS, families: [...TREE, fam(3, 3, 2, [])] };
  expect(unlinkings(3, tree)).toEqual([
    {
      familyId: 1,
      label: 'Remove as child of Matti Esimerkki and Liisa Esimerkki'
    },
    { familyId: 3, label: 'Remove as spouse of Liisa Esimerkki' }
  ]);
  const single = { persons: PERSONS, families: [fam(1, 1, null, [3, 2])] };
  expect(unlinkings(1, single)).toEqual([]);
  expect(
    unlinkings(2, {
      ...single,
      families: [...single.families, fam(2, 2, 1, [])]
    })
  ).toEqual([
    { familyId: 1, label: 'Remove as child of Matti Esimerkki' },
    { familyId: 2, label: 'Remove as spouse of Matti Esimerkki' }
  ]);
});
