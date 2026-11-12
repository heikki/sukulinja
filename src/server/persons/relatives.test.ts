import { beforeEach, expect, test } from 'bun:test';

import type { NewChange, Relation, Sex } from '@/common/types';

import { treeSnapshot } from '../../../test/tree-snapshot';
import { openDb } from '../datasets/db';
import { exportGedcom } from '../export/gedcom';
import { parseGedcom } from '../gedcom/parser';
import { importGedcom } from '../import/gedcom';
import { createRelatives } from './relatives';

// Made-up people: Matti (1) and Liisa (2), married, with their son Juho
// (3), and Anna (4), in no family. Matti's xref is past the others', as
// an import may give.
const GEDCOM = [
  '0 @I7@ INDI',
  '1 NAME Matti /Esimerkki/',
  '1 SEX M',
  '0 @I2@ INDI',
  '1 NAME Liisa /Malli/',
  '1 SEX F',
  '0 @I3@ INDI',
  '1 NAME Juho /Esimerkki/',
  '1 SEX M',
  '0 @I4@ INDI',
  '1 NAME Anna /Muu/',
  '1 SEX F',
  '0 @F1@ FAM',
  '1 HUSB @I7@',
  '1 WIFE @I2@',
  '1 CHIL @I3@',
  ''
].join('\n');

const MATTI = 1;
const LIISA = 2;
const JUHO = 3;
const ANNA = 4;

let db = openDb(':memory:');
let changes: NewChange[] = [];
let relatives = createRelatives(db, () => undefined);

beforeEach(() => {
  db = openDb(':memory:');
  importGedcom(db, parseGedcom(GEDCOM), () => null);
  changes = [];
  relatives = createRelatives(db, (c) => {
    changes.push(c);
  });
});

interface Adding {
  relation: Relation;
  given: string;
  surname: string;
  sex: Sex;
  familyId: number | null;
}

// A new person put in place, a child named Uusi Esimerkki unless said.
function add(personId: number, adding: Partial<Adding>) {
  const { relation, given, surname, sex, familyId } = {
    relation: 'child',
    given: 'Uusi',
    surname: 'Esimerkki',
    sex: 'U',
    familyId: null,
    ...adding
  } satisfies Adding;
  return relatives.add(personId, {
    relation,
    who: { given, surname, sex },
    familyId
  });
}

// Someone already in the tree put in place.
function link(
  personId: number,
  relation: Relation,
  relativeId: number,
  familyId: number | null = null
) {
  return relatives.add(personId, {
    relation,
    who: { personId: relativeId },
    familyId
  });
}

function idOf(answer: ReturnType<typeof add>) {
  if (answer === null || 'rejected' in answer) throw new Error('not added');
  return answer.id;
}

function families() {
  return db
    .query<
      { id: number; husband_id: number | null; wife_id: number | null },
      []
    >('SELECT id, husband_id, wife_id FROM families ORDER BY id')
    .all();
}

function childrenOf(familyId: number) {
  return db
    .query<{ person_id: number }, [number]>(
      'SELECT person_id FROM family_children WHERE family_id = ? ORDER BY sort_order'
    )
    .all(familyId)
    .map((r) => r.person_id);
}

function personRow(id: number) {
  return db
    .query<Record<string, unknown>, [number]>(
      `SELECT p.xref, p.sex, n.full_text, n.given, n.surname,
         p.change_date IS NOT NULL AS changed, length(p.uid) AS uid
       FROM persons p JOIN names n ON n.person_id = p.id WHERE p.id = ?`
    )
    .get(id);
}

test('a new person gets a name, a sex, a UID and an xref no import gave', () => {
  const id = idOf(
    add(JUHO, { relation: 'spouse', given: ' Maria ', surname: '', sex: 'F' })
  );
  expect(personRow(id)).toEqual({
    xref: '@I8@',
    sex: 'F',
    full_text: 'Maria //',
    given: 'Maria',
    surname: null,
    changed: 1,
    uid: 36
  });
});

test('a parent goes into the family the person is a child in', () => {
  const grandfather = idOf(add(MATTI, { relation: 'father', sex: 'M' }));
  const [, parents] = families();
  expect(parents).toEqual({ id: 2, husband_id: grandfather, wife_id: null });
  expect(childrenOf(2)).toEqual([MATTI]);
  const grandmother = idOf(add(MATTI, { relation: 'mother', sex: 'F' }));
  expect(families()[1]).toMatchObject({ wife_id: grandmother });
  expect(add(MATTI, { relation: 'father' })).toEqual({
    rejected: 'They have two parents already.'
  });
});

test('a second parent takes the free place, whatever the relation', () => {
  db.run('UPDATE families SET wife_id = NULL WHERE id = 1');
  const mother = idOf(add(JUHO, { relation: 'father', sex: 'M' }));
  expect(families()[0]).toEqual({ id: 1, husband_id: MATTI, wife_id: mother });
});

test('a spouse starts a new family, a woman in the wife’s place', () => {
  const husband = idOf(add(ANNA, { relation: 'spouse', sex: 'M' }));
  expect(families().at(-1)).toEqual({
    id: 2,
    husband_id: husband,
    wife_id: ANNA
  });
  expect(childrenOf(2)).toEqual([]);
});

test('a child goes last into the person’s one family, or a new one', () => {
  const child = idOf(add(LIISA, {}));
  expect(childrenOf(1)).toEqual([JUHO, child]);
  const annas = idOf(add(ANNA, {}));
  expect(families().at(-1)).toEqual({ id: 2, husband_id: null, wife_id: ANNA });
  expect(childrenOf(2)).toEqual([annas]);
});

test('a child of someone with two families goes into the one picked', () => {
  idOf(add(MATTI, { relation: 'spouse', sex: 'F' }));
  expect(add(MATTI, {})).toEqual({
    rejected: 'Say which of their families the child is in.'
  });
  expect(add(JUHO, { familyId: 1 })).toEqual({
    rejected: "They aren't a parent in that family."
  });
  const child = idOf(add(MATTI, { familyId: 2 }));
  expect(childrenOf(2)).toEqual([child]);
  expect(childrenOf(1)).toEqual([JUHO]);
});

test('a sibling goes into the parents’ family, made with no parents if there’s none', () => {
  const brother = idOf(add(JUHO, { relation: 'sibling', sex: 'M' }));
  expect(childrenOf(1)).toEqual([JUHO, brother]);
  const sister = idOf(add(ANNA, { relation: 'sibling', sex: 'F' }));
  expect(families().at(-1)).toEqual({ id: 2, husband_id: null, wife_id: null });
  expect(childrenOf(2)).toEqual([ANNA, sister]);
});

test('each is a Change on the new person, naming whose relative they are', () => {
  const id = idOf(add(JUHO, { relation: 'sibling' }));
  expect(changes).toEqual([
    {
      on: { personId: id },
      what: {
        kind: 'person',
        did: 'add',
        relation: 'sibling',
        of: 'Juho Esimerkki'
      }
    }
  ]);
});

test('refuses what it can’t add, writing nothing', () => {
  const before = treeSnapshot(db);
  expect(add(99, {})).toBeNull();
  expect(add(JUHO, { given: ' ', surname: '' })).toEqual({
    rejected: 'Write a name.'
  });
  expect(add(JUHO, { given: 'Mat/ti' })).toEqual({
    rejected: "A name can't have a slash in it."
  });
  expect(add(JUHO, { sex: 'Q' as 'U' })).toEqual({
    rejected: 'Say their sex.'
  });
  expect(treeSnapshot(db)).toEqual(before);
  expect(changes).toEqual([]);
});

test('links someone already in the tree in that place, making no one', () => {
  function persons() {
    return db.query('SELECT id FROM persons').all().length;
  }
  const before = persons();
  expect(link(ANNA, 'spouse', JUHO)).toEqual({ id: JUHO });
  expect(families().at(-1)).toEqual({ id: 2, husband_id: JUHO, wife_id: ANNA });
  expect(link(MATTI, 'sibling', ANNA)).toEqual({ id: ANNA });
  expect(persons()).toBe(before);
  expect(changes.map((c) => c.what)).toEqual([
    { kind: 'person', did: 'link', relation: 'spouse', of: 'Anna Muu' },
    { kind: 'person', did: 'link', relation: 'sibling', of: 'Matti Esimerkki' }
  ]);
  expect(changes[0]!.on).toEqual({ personId: JUHO });
});

test('refuses a link that would put someone where they are, or give them two families as a child', () => {
  expect(link(JUHO, 'father', JUHO)).toEqual({
    rejected: "They can't be their own relative."
  });
  db.run('UPDATE families SET wife_id = NULL WHERE id = 1');
  expect(link(JUHO, 'mother', MATTI)).toEqual({
    rejected: 'They are a parent there already.'
  });
  expect(link(ANNA, 'sibling', JUHO)).toEqual({
    rejected: 'They are a child in another family already.'
  });
  expect(link(MATTI, 'spouse', LIISA)).toEqual({ id: LIISA });
  expect(link(MATTI, 'spouse', LIISA)).toEqual({
    rejected: 'They are spouses already.'
  });
  expect(link(JUHO, 'father', 99)).toBeNull();
});

test('the GEDZIP carries the new people and families, and brings them back', () => {
  add(ANNA, { relation: 'father', given: 'Pekka', surname: 'Muu', sex: 'M' });
  add(ANNA, { relation: 'spouse', given: 'Olli', surname: 'Uusi', sex: 'M' });
  const { text } = exportGedcom(db);
  const again = openDb(':memory:');
  importGedcom(again, parseGedcom(text), () => null);
  expect(treeSnapshot(again)).toEqual(treeSnapshot(db));
});
