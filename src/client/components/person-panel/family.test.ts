import { describe, expect, test } from 'bun:test';

import type { FamilyRow, PersonRow } from '@common/types';

import { householdsOf, lifeText } from './family';

function yearOf(date: string | null) {
  return date === null ? null : Number(/\d{4}/.exec(date)?.[0]);
}

function person(
  id: number,
  sex: string | null,
  birth: string | null = null,
  death: string | null = null
) {
  return {
    id,
    given: `P${id}`,
    surname: null,
    sex,
    birth_year: yearOf(birth),
    death_year: yearOf(death),
    birth_date: birth,
    death_date: death,
    photo_path: null,
    crop: null
  };
}

function family(
  id: number,
  husband: number | null,
  wife: number | null,
  children: number[]
): FamilyRow {
  return { id, husband_id: husband, wife_id: wife, child_ids: children };
}

function indices(persons: PersonRow[], families: FamilyRow[]) {
  const parentFamByPerson = new Map<number, FamilyRow>();
  const spouseFamsByPerson = new Map<number, FamilyRow[]>();
  for (const f of families) {
    for (const c of f.child_ids) parentFamByPerson.set(c, f);
    for (const s of [f.husband_id, f.wife_id]) {
      if (s !== null) {
        spouseFamsByPerson.set(s, [...(spouseFamsByPerson.get(s) ?? []), f]);
      }
    }
  }
  return {
    persons: new Map(persons.map((p) => [p.id, p])),
    parentFamByPerson,
    spouseFamsByPerson
  };
}

function rowsOf(ix: ReturnType<typeof indices>, id: number) {
  return householdsOf(id, ix).map((h) =>
    h.map((r) => [r.person.id, r.relation])
  );
}

describe('householdsOf', () => {
  test('lists the parents, then the other children by birth', () => {
    const ix = indices(
      [
        person(1, 'M'),
        person(2, 'F'),
        person(3, 'F', '1894'),
        person(4, 'M', '1891'),
        person(5, null)
      ],
      [family(10, 1, 2, [3, 4, 5])]
    );
    expect(rowsOf(ix, 3)).toEqual([
      [
        [1, 'Father'],
        [2, 'Mother'],
        [4, 'Brother'],
        [5, 'Sibling']
      ]
    ]);
  });

  test("adds a parent's children from another family as half-siblings", () => {
    const ix = indices(
      [
        person(1, 'M'),
        person(2, 'F'),
        person(3, 'F', '1880'),
        person(4, 'M', '1875')
      ],
      [family(10, 1, 2, [3]), family(11, 1, null, [4])]
    );
    expect(rowsOf(ix, 3)[0]).toEqual([
      [1, 'Father'],
      [2, 'Mother'],
      [4, 'Half-brother']
    ]);
  });

  test('lists each marriage with its spouse and children', () => {
    const ix = indices(
      [
        person(1, 'M'),
        person(2, 'F'),
        person(3, 'F'),
        person(4, 'M', '1900'),
        person(5, 'F', '1898')
      ],
      [family(10, 1, 2, [4, 5]), family(11, 1, 3, [])]
    );
    expect(rowsOf(ix, 1)).toEqual([
      [
        [2, 'Wife'],
        [5, 'Daughter'],
        [4, 'Son']
      ],
      [[3, 'Wife']]
    ]);
  });

  test('leaves out a household with no one else known', () => {
    const ix = indices([person(3, 'F')], [family(10, 1, 2, [3])]);
    expect(householdsOf(3, ix)).toEqual([]);
  });
});

describe('lifeText', () => {
  test('writes birth and death as precisely as recorded', () => {
    expect(lifeText(person(1, 'M', '12 MAR 1894', '1965'))).toBe(
      '12.3.1894 – 1965'
    );
    expect(lifeText(person(1, 'M', '12 MAR 1894'))).toBe('12.3.1894 –');
    expect(lifeText(person(1, 'M', null, 'ABT 1965'))).toBe('– n. 1965');
    expect(lifeText(person(1, 'M'))).toBe('');
  });
});
