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
import {
  operationNamed,
  READ_OPERATIONS,
  SHOW_OPERATIONS,
  showNamed,
  toolsOf,
  WRITE_OPERATIONS,
  writeNamed
} from './catalogue';

const SCANS = openCitations(join(tmpdir(), 'assistant-unread'), {
  astia: memoryAstia({}),
  datasets: async () => await Promise.resolve([])
});

// Made-up people: Matti (1, 1801–1860) and Liisa (2, 1805–1870), married
// in Kylä, with a child Juho (3, born 1990, no death: may be living);
// Matti has a source.
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Matti /Esimerkki/',
  '1 BIRT',
  '2 DATE 1801',
  '2 PLAC Kylä, Pitäjä, Suomi',
  '1 DEAT',
  '2 DATE 1860',
  '1 SOUR @S1@',
  '2 PAGE s. 14',
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
  '0 @S1@ SOUR',
  '1 TITL Kylän rippikirja',
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

test('reads someone who may be living once the living are included', async () => {
  const living = { personId: null, living: true };
  const juho = await read('person', { id: 3 }, living);
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

test('every operation is a tool with a closed input, strict but for batches', () => {
  const tools = toolsOf(READ_OPERATIONS, WRITE_OPERATIONS, SHOW_OPERATIONS);
  expect(tools.map((t) => t.name)).toEqual([
    'find_persons',
    'person',
    'places',
    'place_facts',
    'reminders',
    'changes',
    'select_person',
    'open_source',
    'add_fact',
    'edit_fact',
    'support_fact',
    'rename_person',
    'move_person',
    'remind',
    'add_fact_many',
    'edit_fact_many',
    'support_fact_many',
    'remind_many',
    'withdraw_proposal_item'
  ]);
  for (const t of tools) {
    expect(t.strict).toBe(t.name.endsWith('_many') ? undefined : true);
    expect(t.input_schema.additionalProperties).toBe(false);
  }
  // Each write says why, for the person to read.
  for (const t of tools.slice(8, -1)) {
    expect(t.input_schema.required).toContain('reason');
  }
});

// What the write proposes, with the person on screen as given.
function asks(name: string, input: unknown, onScreen: OnScreen) {
  const view = openTreeView(
    openServices(db, SCANS.forDataset(db), tmpdir()),
    onScreen,
    2026
  );
  return writeNamed(name)!.asks(view, input as never);
}

test('proposes nothing on someone who may be living, unless on screen', () => {
  const input = { personId: 3, text: 'Katso kastekirja.' };
  expect(asks('remind', input, { personId: null })).toEqual({
    rejected: `This is ${LEFT_OUT}.`
  });
  expect(asks('remind', input, { personId: 3 })).toMatchObject({
    operation: 'remind',
    body: { text: 'Katso kastekirja.', on: { personId: 3 } }
  });
});

test('a fact edited keeps what is left null as it was', async () => {
  const matti = await read('person', { id: 1 });
  const birth = (matti.facts as Array<{ id: number; tag: string }>).find(
    (f) => f.tag === 'BIRT'
  )!;
  expect(
    asks(
      'edit_fact',
      {
        personId: 1,
        factId: birth.id,
        date: '3.3.1801',
        place: null,
        address: null,
        value: null,
        type: null
      },
      { personId: null }
    )
  ).toEqual({
    operation: 'editFact',
    body: {
      personId: 1,
      factId: birth.id,
      fields: {
        date: '3.3.1801',
        place: 'Kylä, Pitäjä, Suomi',
        address: '',
        value: '',
        type: ''
      }
    },
    label:
      "Change Matti Esimerkki's Birth 1801 · Kylä, Pitäjä, Suomi to Birth 3.3.1801 · Kylä, Pitäjä, Suomi"
  });
});

// Where the show moves the view, with no one on screen.
function shows(name: string, input: unknown) {
  const view = openTreeView(
    openServices(db, SCANS.forDataset(db), tmpdir()),
    { personId: null },
    2026
  );
  return showNamed(name)!.shows(view, input as never);
}

test('selects someone, and opens their source, but no one left out', async () => {
  expect(shows('select_person', { personId: 2 })).toEqual({
    on: { kind: 'person', personId: 2 },
    label: 'Selected Liisa Malli (1805–1870)'
  });
  expect(shows('select_person', { personId: 3 })).toEqual({
    rejected: `This is ${LEFT_OUT}.`
  });
  const matti = await read('person', { id: 1 });
  const [source] = matti.sources as Array<{ id: number }>;
  const opened = shows('open_source', { personId: 1, citationId: source!.id });
  if ('rejected' in opened) throw new Error(opened.rejected);
  expect(opened.on).toMatchObject({ kind: 'citation', citationId: source!.id });
  expect(opened.label).toStartWith('Opened Matti Esimerkki (1801–1860)');
  expect(shows('open_source', { personId: 1, citationId: 999 })).toEqual({
    rejected: 'They have no such source.'
  });
});

test('adds a fact with its sources supporting it, once it has an id', async () => {
  const matti = await read('person', { id: 1 });
  const [source] = matti.sources as Array<{ id: number }>;
  const fact = { tag: 'RESI', familyId: null, value: '', type: '' };
  const said = { date: '1830–1839', place: 'Kylä, Pitäjä, Suomi', address: '' };
  const input = { personId: 1, ...fact, ...said, citationIds: [source!.id] };
  const asked = asks('add_fact', input, { personId: null });
  if ('rejected' in asked) throw new Error(asked.rejected);
  expect(asked.label).toContain('supported by');
  expect(asked.then!.map((s) => s.bodyAfter(41))).toEqual([
    { citationId: source!.id, factId: 41, on: true }
  ]);
  const elsewhere = { ...input, citationIds: [999] };
  expect(asks('add_fact', elsewhere, { personId: null })).toEqual({
    rejected: 'They have no such source.'
  });
});
