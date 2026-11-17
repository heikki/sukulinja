// A baptism naming someone not in the tree yet (ADR-0033): made with the
// Entry, from their name, in its one transaction, into the family its
// Roles say. Names are invented.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NO_FIELDS } from '@/common/entry-events';
import type { InEntry, Newcomer } from '@/common/operations';

import { baptism, entriesDataset, made } from './test-entries';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'entry-newcomers-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

type Db = ReturnType<typeof entriesDataset>['db'];

const CHILD: Newcomer = {
  personId: -1,
  name: { given: 'Anna', surname: 'Esimerkki', sex: 'F' }
};
const FATHER: Newcomer = {
  personId: -2,
  name: { given: 'Antti', surname: 'Malli', sex: 'U' }
};
const MOTHER: Newcomer = {
  personId: -3,
  name: { given: 'Kaisa', surname: 'Malli', sex: 'U' }
};

// A baptism on Image 3 naming the people, making the newcomers; the
// child's Birth from its date, ticked when `born`.
function newBaptism(people: InEntry[], newcomers: Newcomer[], born = false) {
  const fields = { ...NO_FIELDS, lifeDate: born ? '3 MAR 1795' : null };
  const ticked = born ? [{ tag: 'BIRT', action: 'add' as const }] : [];
  const at = { ...baptism(3, undefined, { fields, ticked }), newcomers };
  return [at, null, people] as const;
}

function personNamed(db: Db, given: string) {
  return db
    .query<{ id: number; sex: string | null }, [string]>(
      `SELECT p.id, p.sex FROM persons p JOIN names n ON n.person_id = p.id
       WHERE n.given = ?`
    )
    .get(given);
}

function familyOfChild(db: Db, personId: number) {
  return db
    .query<
      { id: number; husband: number | null; wife: number | null },
      [number]
    >(
      `SELECT f.id, f.husband_id AS husband, f.wife_id AS wife FROM families f
       JOIN family_children c ON c.family_id = f.id WHERE c.person_id = ?`
    )
    .get(personId);
}

function count(db: Db, table: string) {
  return db
    .query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`)
    .get()!.n;
}

test("a new child goes into its parents' family, with its Birth ticked", async () => {
  const { db, entries, changes } = entriesDataset(dir);
  const rows = made(
    await entries.make(
      ...newBaptism(
        [
          { personId: -1, role: 'CHIL' },
          { personId: 1, role: 'FATH' },
          { personId: 2, role: 'MOTH' }
        ],
        [CHILD],
        true
      )
    )
  );
  const child = personNamed(db, 'Anna')!;
  expect(child.sex).toBe('F');
  expect(familyOfChild(db, child.id)).toEqual({ id: 1, husband: 1, wife: 2 });
  expect(rows.map((r) => [r.personId, r.citation.role])).toEqual([
    [child.id, 'CHIL'],
    [1, 'FATH'],
    [2, 'MOTH']
  ]);
  expect(
    db
      .query(
        "SELECT tag, date_text AS date FROM facts WHERE scope_type = 'person' AND scope_id = ?"
      )
      .all(child.id)
  ).toEqual([{ tag: 'BIRT', date: '3 MAR 1795' }]);
  expect(rows[0]!.citation.supports).toHaveLength(1);
  expect(changes.map((c) => c.what.kind)).toEqual([
    'person',
    'cite',
    'cite',
    'cite',
    'fact',
    'support'
  ]);
});

test('a new child of two in the tree who are no couple gets a new family of them', async () => {
  const { db, entries } = entriesDataset(dir);
  made(
    await entries.make(
      ...newBaptism(
        [
          { personId: -1, role: 'CHIL' },
          { personId: 3, role: 'FATH' },
          { personId: 2, role: 'MOTH' }
        ],
        [CHILD]
      )
    )
  );
  const child = personNamed(db, 'Anna')!;
  expect(familyOfChild(db, child.id)).toMatchObject({ husband: 3, wife: 2 });
  expect(count(db, 'families')).toBe(2);
});

test("new parents go in with a child in the tree, a parent's sex their Role's", async () => {
  const { db, entries } = entriesDataset(dir);
  const rows = made(
    await entries.make(
      ...newBaptism(
        [
          { personId: 3, role: 'CHIL' },
          { personId: -2, role: 'FATH' },
          { personId: -3, role: 'MOTH' }
        ],
        [FATHER, MOTHER]
      )
    )
  );
  const father = personNamed(db, 'Antti')!;
  const mother = personNamed(db, 'Kaisa')!;
  expect([father.sex, mother.sex]).toEqual(['M', 'F']);
  expect(familyOfChild(db, 3)).toMatchObject({
    husband: father.id,
    wife: mother.id
  });
  expect(rows.map((r) => r.personId)).toEqual([3, father.id, mother.id]);
});

test('an Entry naming no one in the tree is refused, and makes no one', async () => {
  const { db, entries } = entriesDataset(dir);
  const persons = count(db, 'persons');
  expect(
    await entries.make(
      ...newBaptism(
        [
          { personId: -1, role: 'CHIL' },
          { personId: -2, role: 'FATH' }
        ],
        [CHILD, FATHER]
      )
    )
  ).toEqual({ rejected: 'Name someone in the tree.' });
  expect(
    await entries.make(...newBaptism([{ personId: 3, role: 'CHIL' }], [CHILD]))
  ).toEqual({ rejected: 'Someone new is named twice, or not at all.' });
  expect(count(db, 'persons')).toBe(persons);
});

test('a newcomer refused by the tree undoes the whole save', async () => {
  const { db, entries } = entriesDataset(dir);
  // Juho is Matti and Liisa's child already: no room for another father.
  db.run(
    'INSERT INTO family_children (family_id, person_id, sort_order) VALUES (1, 3, 0)'
  );
  const before = ['persons', 'families', 'entries', 'citations'].map((t) =>
    count(db, t)
  );
  expect(
    await entries.make(
      ...newBaptism(
        [
          { personId: 3, role: 'CHIL' },
          { personId: -2, role: 'FATH' }
        ],
        [FATHER]
      )
    )
  ).toEqual({ rejected: 'They have two parents already.' });
  expect(
    ['persons', 'families', 'entries', 'citations'].map((t) => count(db, t))
  ).toEqual(before);
});

test('an edit names someone new too', async () => {
  const { db, entries } = entriesDataset(dir);
  const rows = made(
    await entries.make(...newBaptism([{ personId: 3, role: 'CHIL' }], []))
  );
  const entryId = rows[0]!.citation.entryId!;
  const edited = made(
    await entries.edit(entryId, {
      people: [
        { personId: 3, role: 'CHIL' },
        { personId: -3, role: 'MOTH' }
      ],
      newcomers: [MOTHER]
    })
  );
  const mother = personNamed(db, 'Kaisa')!;
  expect(edited.map((r) => [r.personId, r.citation.role])).toEqual([
    [3, 'CHIL'],
    [mother.id, 'MOTH']
  ]);
  expect(familyOfChild(db, 3)).toMatchObject({
    husband: null,
    wife: mother.id
  });
});
