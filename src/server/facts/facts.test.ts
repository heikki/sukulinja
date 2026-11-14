import { beforeEach, expect, test } from 'bun:test';

import type { NewChange } from '../changes/changes';
import { openDb } from '../datasets/db';
import { parseGedcom } from '../gedcom/parser';
import { importGedcom } from '../import/gedcom';
import { createFacts } from './facts';

// Made-up people: Matti (1), married to Liisa (2), and Juho (3), in no
// family of theirs.
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/',
  '1 BIRT',
  '2 DATE BET 1757 AND 1758',
  '2 PLAC Pitäjä',
  '3 MAP',
  '4 LATI N61.0',
  '4 LONG E27.0',
  '3 NOTE Old church',
  '2 SOUR Family bible',
  '2 NOTE Born at home',
  '1 OCCU torppari',
  '0 @I2@ INDI',
  '1 NAME Liisa /Malli/',
  '0 @I3@ INDI',
  '1 NAME Juho /Muu/',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 MARR',
  '2 DATE 1780',
  ''
].join('\n');

const BLANK = { date: '', place: '', address: '', value: '', type: '' };

let db = openDb(':memory:');
let changes: NewChange[] = [];
let facts = createFacts(db, () => undefined);

beforeEach(() => {
  db = openDb(':memory:');
  importGedcom(db, parseGedcom(GEDCOM), () => null);
  changes = [];
  facts = createFacts(db, (c) => {
    changes.push(c);
  });
});

function factRow(id: number) {
  return db
    .query<Record<string, unknown>, [number]>(
      `SELECT scope_type, scope_id, tag, type, date_text, place, latitude,
         value, sort_order FROM facts WHERE id = ?`
    )
    .get(id);
}

function idOf(tag: string) {
  return db
    .query<{ id: number }, [string]>('SELECT id FROM facts WHERE tag = ?')
    .get(tag)!.id;
}

function changeOf(table: string, id: number) {
  return db
    .query<{ change_date: string | null }, [number]>(
      `SELECT change_date FROM ${table} WHERE id = ?`
    )
    .get(id)!.change_date;
}

test('adds a Fact last among the person’s, its date read the Finnish way', () => {
  const added = facts.add(1, {
    ...BLANK,
    tag: 'DEAT',
    familyId: null,
    date: '4.3.1820',
    place: ' Haukivuori '
  });
  expect(added).toEqual({ id: expect.any(Number) as number });
  const { id } = added as { id: number };
  expect(factRow(id)).toEqual({
    scope_type: 'person',
    scope_id: 1,
    tag: 'DEAT',
    type: null,
    date_text: '4 MAR 1820',
    place: 'Haukivuori',
    latitude: null,
    value: null,
    sort_order: 2
  });
  expect(changeOf('persons', 1)).not.toBeNull();
  expect(changes).toEqual([
    {
      on: { personId: 1 },
      what: {
        kind: 'fact',
        did: 'add',
        tag: 'DEAT',
        was: null,
        now: '4.3.1820 · Haukivuori'
      }
    }
  ]);
});

test('an event that says nothing else is flagged as happened, as GEDCOM 7 has it', () => {
  const { id } = facts.add(1, { ...BLANK, tag: 'BURI', familyId: null }) as {
    id: number;
  };
  expect(factRow(id)).toMatchObject({ date_text: null, value: 'Y' });
});

test('a marriage is added to a family the person is a spouse in', () => {
  const { id } = facts.add(2, {
    ...BLANK,
    tag: 'DIV',
    familyId: 1,
    date: '1790'
  }) as { id: number };
  expect(factRow(id)).toMatchObject({ scope_type: 'family', scope_id: 1 });
  expect(changeOf('families', 1)).not.toBeNull();
  expect(changes[0]!.on).toEqual({ personId: 2 });
  expect(facts.add(3, { ...BLANK, tag: 'MARR', familyId: 1 })).toEqual({
    rejected: "They aren't a spouse in that family."
  });
});

test('refuses what it can’t add', () => {
  function add(fact: Partial<typeof BLANK & { tag: string }>) {
    return facts.add(1, { ...BLANK, tag: 'BIRT', familyId: null, ...fact });
  }
  expect(add({ date: 'keväällä' })).toEqual({
    rejected:
      'Write the date like this: 3.3.1761, 3/1761, 1761, n. 1761, ennen 1761, 1761 jälkeen, 1870–1879.'
  });
  expect(add({ tag: 'MARR' })).toEqual({
    rejected: "A marriage is a family's."
  });
  expect(add({ tag: 'SSN' })).toEqual({ rejected: "A SSN can't be added." });
  expect(add({ tag: 'OCCU' })).toEqual({
    rejected: 'Say what the occupation is.'
  });
  expect(add({ tag: 'EVEN' })).toEqual({
    rejected: 'Say what kind of event it is.'
  });
  expect(facts.add(99, { ...BLANK, tag: 'BIRT', familyId: null })).toBeNull();
  expect(changes).toEqual([]);
});

test('an edit keeps a date typed as the panel shows it, and the rest of the Fact', () => {
  const birth = idOf('BIRT');
  expect(
    facts.edit(1, birth, { ...BLANK, date: '1757–1758', place: 'Pitäjä' })
  ).toEqual({ id: birth });
  // Nothing changed, so nothing is said to.
  expect(changes).toEqual([]);
  facts.edit(1, birth, { ...BLANK, date: '3.3.1757', place: 'Pitäjä' });
  expect(factRow(birth)).toMatchObject({
    date_text: '3 MAR 1757',
    place: 'Pitäjä',
    latitude: 'N61.0'
  });
  expect(changes.at(-1)!.what).toEqual({
    kind: 'fact',
    did: 'edit',
    tag: 'BIRT',
    was: '1757–1758 · Pitäjä',
    now: '3.3.1757 · Pitäjä'
  });
});

test('edits a residence’s address, and its ADDR with it', () => {
  const { id } = facts.add(1, {
    ...BLANK,
    tag: 'RESI',
    familyId: null,
    date: '1990',
    place: 'Helsinki',
    address: 'Kauppakatu 1'
  }) as { id: number };
  function address() {
    return db
      .query<{ address: string | null }, [number]>(
        'SELECT address FROM facts WHERE id = ?'
      )
      .get(id)?.address;
  }
  function addr() {
    return db
      .query<{ text: string | null }, [number]>(
        "SELECT text FROM addresses WHERE owner_type = 'fact' AND owner_id = ?"
      )
      .all(id);
  }
  expect(address()).toBe('Kauppakatu 1');
  expect(addr()).toEqual([{ text: 'Kauppakatu 1' }]);
  facts.edit(1, id, {
    ...BLANK,
    date: '1990',
    place: 'Helsinki',
    address: 'Kauppakatu 2'
  });
  expect(address()).toBe('Kauppakatu 2');
  expect(addr()).toEqual([{ text: 'Kauppakatu 2' }]);
  expect(changes.at(-1)!.what).toMatchObject({
    was: '1990 · Helsinki · Kauppakatu 1',
    now: '1990 · Helsinki · Kauppakatu 2'
  });
  facts.edit(1, id, { ...BLANK, date: '1990', place: 'Helsinki' });
  expect(address()).toBeNull();
  expect(addr()).toEqual([]);
});

test('a new place drops the old one’s coordinates and notes', () => {
  const birth = idOf('BIRT');
  facts.edit(1, birth, { ...BLANK, date: '1757–1758', place: 'Haukivuori' });
  expect(factRow(birth)).toMatchObject({ place: 'Haukivuori', latitude: null });
  const notes = db
    .query<{ owner_type: string }, []>('SELECT owner_type FROM notes')
    .all();
  expect(notes).toEqual([{ owner_type: 'fact' }]);
});

test('edits an occupation’s title, and only the person’s or their families’ Facts', () => {
  const occupation = idOf('OCCU');
  facts.edit(1, occupation, { ...BLANK, value: 'talollinen' });
  expect(factRow(occupation)).toMatchObject({ value: 'talollinen' });
  expect(facts.edit(3, occupation, { ...BLANK, value: 'x' })).toBeNull();
  expect(facts.edit(2, idOf('MARR'), { ...BLANK, date: '1781' })).toEqual({
    id: idOf('MARR')
  });
});

test('deleting takes its support and notes, its Citations staying with the person', () => {
  const birth = idOf('BIRT');
  expect(db.query('SELECT fact_id FROM fact_citations').all()).toEqual([
    { fact_id: birth }
  ]);
  expect(facts.remove(3, birth)).toBe(false);
  expect(facts.remove(1, birth)).toBe(true);
  expect(factRow(birth)).toBeNull();
  expect(db.query('SELECT scope_type, scope_id FROM citations').all()).toEqual([
    { scope_type: 'person', scope_id: 1 }
  ]);
  expect(db.query('SELECT * FROM fact_citations').all()).toEqual([]);
  expect(db.query('SELECT * FROM notes').all()).toEqual([]);
  expect(changes).toEqual([
    {
      on: { personId: 1 },
      what: {
        kind: 'fact',
        did: 'delete',
        tag: 'BIRT',
        was: '1757–1758 · Pitäjä',
        now: null
      }
    }
  ]);
});
