import { expect, test } from 'bun:test';

import type { FamilyRow, PersonRow } from '@/common/types';

import { nearestRelative } from './person-edits';

const FAMILY: FamilyRow = { id: 1, husband_id: 1, wife_id: 2, child_ids: [3] };
const SECOND: FamilyRow = { id: 2, husband_id: 3, wife_id: 4, child_ids: [5] };

function person(id: number): PersonRow {
  return {
    id,
    given: null,
    surname: null,
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

function people(families: FamilyRow[]) {
  const persons = new Map([1, 2, 3, 4, 5, 6].map((id) => [id, person(id)]));
  return {
    persons,
    families,
    parentFamByPerson: new Map([
      [3, FAMILY],
      [5, SECOND]
    ]),
    spouseFamsByPerson: new Map([
      [1, [FAMILY]],
      [2, [FAMILY]],
      [3, [SECOND]],
      [4, [SECOND]]
    ])
  };
}

test('the nearest relative is a parent, else a spouse, else a child, else anyone', () => {
  const p = people([FAMILY, SECOND]);
  expect(nearestRelative(3, p)).toBe(1);
  expect(nearestRelative(4, p)).toBe(3);
  expect(nearestRelative(1, p)).toBe(2);
  expect(nearestRelative(6, p)).toBe(1);
});
