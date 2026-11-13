import { beforeEach, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openCitations } from '../../citations';
import { memoryAstia } from '../../citations/testing';
import { openDb } from '../../datasets/db';
import { openServices } from '../../datasets/services';
import { parseGedcom } from '../../gedcom/parser';
import { importGedcom } from '../../import/gedcom';
import { LEFT_OUT, openTreeView } from '../tree-view';
import type { OnScreen } from '../tree-view';
import { operationNamed, READ_OPERATIONS, toolsOf } from './catalogue';

const SCANS = openCitations(join(tmpdir(), 'assistant-unread'), {
  astia: memoryAstia({}),
  datasets: async () => await Promise.resolve([])
});

// Made-up people: Matti (1, 1801–1860) and Liisa (2, 1805–1870), married
// in Kylä, with a child Juho (3, born 1990, no death: may be living).
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/',
  '1 BIRT',
  '2 DATE 1801',
  '2 PLAC Kylä, Pitäjä, Suomi',
  '1 DEAT',
  '2 DATE 1860',
  '0 @I2@ INDI',
  '1 NAME Liisa /Malli/',
  '1 BIRT',
  '2 DATE 1805',
  '1 DEAT',
  '2 DATE 1870',
  '0 @I3@ INDI',
  '1 NAME Juho /Esimerkki/',
  '1 BIRT',
  '2 DATE 1990',
  '2 PLAC Kylä, Pitäjä, Suomi',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 CHIL @I3@',
  '1 MARR',
  '2 DATE 1825',
  '2 PLAC Kylä, Pitäjä, Suomi',
  ''
].join('\n');

let db = openDb(':memory:');

beforeEach(() => {
  db = openDb(':memory:');
  importGedcom(db, parseGedcom(GEDCOM), () => null);
});

async function run(
  name: string,
  input: unknown,
  onScreen: OnScreen = { personId: null }
) {
  const view = openTreeView(
    openServices(db, SCANS.forDataset(db), tmpdir()),
    onScreen,
    2026
  );
  const op = operationNamed(name)!;
  return await op.run(view, input as never);
}

// The answer, read as an object.
async function read(
  name: string,
  input: unknown,
  onScreen: OnScreen = { personId: null }
) {
  return (await run(name, input, onScreen)) as Record<string, unknown>;
}

test('finds people by name, leaving out who may be living', async () => {
  const found = await run('find_persons', {
    name: 'esimerkki',
    bornFrom: null,
    bornTo: null
  });
  expect(found).toEqual({
    matched: 1,
    people: [{ id: 1, name: 'Matti Esimerkki', born: 1801, died: 1860 }],
    leftOutAsMaybeLiving: 1
  });
});

test('finds by birth years', async () => {
  const found = await read('find_persons', {
    name: null,
    bornFrom: 1803,
    bornTo: 1900
  });
  expect(found.people).toEqual([
    { id: 2, name: 'Liisa Malli', born: 1805, died: 1870 }
  ]);
});

test('reads a person with their family, a living child left out', async () => {
  const matti = await read('person', { id: 1 });
  expect(matti.name).toBe('Matti Esimerkki');
  expect(matti.spouses).toEqual([
    { id: 2, name: 'Liisa Malli', born: 1805, died: 1870 }
  ]);
  expect(matti.children).toEqual([LEFT_OUT]);
  expect(matti.facts).toContainEqual(
    expect.objectContaining({ kind: 'Birth', date: '1801' })
  );
});

test('refuses someone who may be living, unless they are on screen', async () => {
  expect(await run('person', { id: 3 })).toEqual({
    error: `This is ${LEFT_OUT}.`
  });
  const juho = await read('person', { id: 3 }, { personId: 3 });
  expect(juho.name).toBe('Juho Esimerkki');
});

test('lists places with their counts, and what happened at one', async () => {
  expect(await run('places', { contains: 'kyla' })).toEqual({
    matched: 1,
    places: [{ place: 'Kylä, Pitäjä, Suomi', facts: 3 }]
  });
  const at = await read('place_facts', { place: 'Kylä, Pitäjä, Suomi' });
  expect(at.leftOutAsMaybeLiving).toBe(1);
  expect(at.facts).toEqual([
    {
      kind: 'Birth',
      date: '1801',
      whose: [{ id: 1, name: 'Matti Esimerkki', born: 1801, died: 1860 }]
    },
    {
      kind: 'Marriage',
      date: '1825',
      whose: [
        { id: 1, name: 'Matti Esimerkki', born: 1801, died: 1860 },
        { id: 2, name: 'Liisa Malli', born: 1805, died: 1870 }
      ]
    }
  ]);
});

test('reads Reminders and Changes', async () => {
  const services = openServices(db, SCANS.forDataset(db), tmpdir());
  await services.reminders.add('Tarkista syntymä', { personId: 1 });
  expect(await run('reminders', { includeDone: false })).toEqual([
    expect.objectContaining({
      text: 'Tarkista syntymä',
      on: {
        person: { id: 1, name: 'Matti Esimerkki', born: 1801, died: 1860 }
      },
      done: null
    })
  ]);
  expect(await run('changes', { limit: 5 })).toEqual([]);
});

test('every operation is a strict tool with a closed input', () => {
  const tools = toolsOf(READ_OPERATIONS);
  expect(tools.map((t) => t.name)).toEqual([
    'find_persons',
    'person',
    'places',
    'place_facts',
    'reminders',
    'changes'
  ]);
  for (const t of tools) {
    expect(t.strict).toBe(true);
    expect(t.input_schema.additionalProperties).toBe(false);
  }
});
