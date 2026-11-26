// A saved Entry's kind and owner stay as saved (ADR-0037): an edit
// changing them is refused, and a new Entry replacing it takes the old
// one's Citations and their support with it. Names are invented.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LOCKED } from '@/common/entry-lock';

import { baptism, BOX, entriesDataset, made } from './test-entries';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'entry-lock-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const BORN = { date: null, lifeDate: '3 MAR 1795', place: null };

// Matti's baptism, his Birth ticked, Liisa his mother.
async function mattis() {
  const d = entriesDataset(dir);
  const rows = made(
    await d.entries.make(
      baptism(3, BOX, {
        fields: BORN,
        ticked: [{ tag: 'BIRT', action: 'support', factId: 1 }]
      }),
      'Kaste',
      [
        { personId: 1, role: 'CHIL' },
        { personId: 2, role: 'MOTH' }
      ]
    )
  );
  expect(rows[0]!.citation.supports).toEqual([1]);
  return { ...d, entryId: rows[0]!.citation.entryId! };
}

test('an edit changing the child is refused; the parents change as before', async () => {
  const { entries, entryId } = await mattis();
  expect(
    await entries.edit(entryId, {
      people: [
        { personId: 3, role: 'CHIL' },
        { personId: 2, role: 'MOTH' }
      ]
    })
  ).toEqual({ rejected: LOCKED });
  expect(
    await entries.edit(entryId, {
      people: [
        { personId: 1, role: 'FATH' },
        { personId: 2, role: 'MOTH' }
      ]
    })
  ).toEqual({ rejected: LOCKED });
  const edited = made(
    await entries.edit(entryId, {
      people: [
        { personId: 1, role: 'CHIL' },
        { personId: 4, role: 'FATH' }
      ]
    })
  );
  expect(edited.map((r) => [r.personId, r.citation.role])).toEqual([
    [1, 'CHIL'],
    [4, 'FATH']
  ]);
});

test('another child saves a new Entry, the old one going with its support', async () => {
  const { db, entries, entryId } = await mattis();
  const people = [
    { personId: 3, role: 'CHIL' },
    { personId: 2, role: 'MOTH' }
  ];
  const rows = made(
    await entries.make(
      { ...baptism(3, BOX, { fields: BORN }), replacing: entryId },
      'Kaste',
      people
    )
  );
  const newId = rows[0]!.citation.entryId!;
  expect(newId).not.toBe(entryId);
  expect(rows.map((r) => [r.personId, r.citation.role])).toEqual([
    [3, 'CHIL'],
    [2, 'MOTH']
  ]);
  expect(rows[0]!.citation.text).toBe('Kaste');
  expect(db.query('SELECT id FROM entries').all()).toEqual([{ id: newId }]);
  expect(db.query('SELECT * FROM fact_citations').all()).toEqual([]);
});

test("the people still named keep their Citations' notes in the new Entry", async () => {
  const { db, entries, entryId, citations } = await mattis();
  const [matti, liisa] = citations
    .ofPerson(1)
    .concat(citations.ofPerson(2))
    .filter((c) => c.entryId === entryId)
    .map((c) => c.id);
  db.run(
    `INSERT INTO notes (owner_type, owner_id, text)
     VALUES ('citation', ?, 'His'), ('citation', ?, 'Hers')`,
    [matti!, liisa!]
  );
  const rows = made(
    await entries.make({ ...baptism(3), replacing: entryId }, 'Kaste', [
      { personId: 3, role: 'CHIL' },
      { personId: 2, role: 'MOTH' }
    ])
  );
  expect(
    db
      .query(
        "SELECT owner_id AS id, text FROM notes WHERE owner_type = 'citation'"
      )
      .all()
  ).toEqual([{ id: rows[1]!.citation.id, text: 'Hers' }]);
});

test('a new Entry replacing one in another Volume, or none, is refused', async () => {
  const { entries, entryId } = await mattis();
  const people = [{ personId: 3, role: 'CHIL' }];
  expect(
    await entries.make(
      { ...baptism(3), volumeId: 'juva-1', replacing: entryId },
      null,
      people
    )
  ).toEqual({ rejected: 'An entry stays in its Volume.' });
  expect(
    await entries.make({ ...baptism(3), replacing: 99 }, null, people)
  ).toBeNull();
});
