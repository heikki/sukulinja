import { expect, test } from 'bun:test';

import type { FamilyRow, PersonRow } from '@/common/types';

import {
  parentRows,
  pickFor,
  rolePickLabel,
  startingPeople,
  withChild,
  withEvent
} from './cite';

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
const BAPTISMS = 'CHR';
const MARRIAGES = 'MARR';
const RIPPI = 'RESI';

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
  expect(rolePickLabel(BAPTISMS, 'FATH')).toBe('Father');
  expect(rolePickLabel(RIPPI, null)).toBe('Person');
});

test('choosing another kind of entry keeps whom it fits, in their Role', () => {
  // A household line's person becomes a baptism's child, with their parents.
  expect(withEvent([{ personId: 1, role: null }], 'CHR', IX)).toEqual([
    { personId: 1, role: 'CHIL' },
    { personId: 2, role: 'FATH' },
    { personId: 3, role: 'MOTH' }
  ]);
  // A marriage's: groom or bride by their sex.
  expect(withEvent([{ personId: 4, role: null }], 'MARR', IX)).toEqual([
    { personId: 4, role: 'WIFE' }
  ]);
  // A burial or a household line has no Roles.
  expect(
    withEvent(
      [
        { personId: 1, role: 'CHIL' },
        { personId: 2, role: 'FATH' }
      ],
      'BURI',
      IX
    )
  ).toEqual([
    { personId: 1, role: null },
    { personId: 2, role: null }
  ]);
  // A Role the new kind hasn't is let go; one it has stays.
  expect(
    withEvent(
      [
        { personId: 2, role: 'FATH' },
        { personId: 3, role: 'WIFE' }
      ],
      'MARR',
      IX
    )
  ).toEqual([
    { personId: 2, role: 'HUSB' },
    { personId: 3, role: 'WIFE' }
  ]);
});

test("a baptism's parents are the child's in the tree, its child theirs; no search", () => {
  const child = { personId: 1, role: 'CHIL' };
  function ids(p: ReturnType<typeof pickFor>) {
    return p.choices.map((c) => c.personId);
  }
  const father = pickFor(
    { event: BAPTISMS, role: 'FATH', named: [child] },
    IX,
    1,
    new Set()
  );
  expect(ids(father)).toEqual([2]);
  expect(father).toMatchObject({
    relativesOf: 1,
    newAs: 'father',
    search: false
  });
  // With no parent in the tree, only a new one.
  expect(
    pickFor(
      {
        event: BAPTISMS,
        role: 'MOTH',
        named: [{ personId: 4, role: 'CHIL' }]
      },
      IX,
      4,
      new Set()
    )
  ).toMatchObject({ choices: [], relativesOf: 4, newAs: 'mother' });
  const ofParents = pickFor(
    {
      event: BAPTISMS,
      role: 'CHIL',
      named: [
        { personId: 2, role: 'FATH' },
        { personId: 3, role: 'MOTH' }
      ]
    },
    IX,
    2,
    new Set()
  );
  expect(ids(ofParents)).toEqual([1]);
  expect(ofParents).toMatchObject({ relativesOf: 2, newAs: 'child' });
  // With no one named yet, or in another Book, anyone.
  expect(
    pickFor({ event: BAPTISMS, role: 'FATH', named: [] }, IX, 1, new Set())
  ).toMatchObject({ search: true, newAs: null });
  expect(
    pickFor({ event: RIPPI, role: null, named: [child] }, IX, 1, new Set())
  ).toMatchObject({ search: true });
});

test("a baptism's parents rows are the child's in the tree, and a new child brings theirs", () => {
  const named = [
    { personId: 1, role: 'CHIL' },
    { personId: 3, role: 'MOTH' }
  ];
  expect(parentRows(named, IX)).toEqual([
    { role: 'FATH', personId: 2, named: false },
    { role: 'MOTH', personId: 3, named: true }
  ]);
  expect(parentRows([{ personId: 4, role: 'CHIL' }], IX)).toEqual([
    { role: 'FATH', personId: null, named: false },
    { role: 'MOTH', personId: null, named: false }
  ]);
  expect(withChild(named, 4, IX)).toEqual([{ personId: 4, role: 'CHIL' }]);
  expect(withChild([], 1, IX)).toEqual([
    { personId: 1, role: 'CHIL' },
    { personId: 2, role: 'FATH' },
    { personId: 3, role: 'MOTH' }
  ]);
});
