// What an Entry records (ADR-0033): the Event chosen on its card, whatever
// its Volume's Book, which gives its Roles.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { at, baptism, BAPTISMS, entriesDataset, made } from './test-entries';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'entry-events-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function dataset() {
  return entriesDataset(dir);
}

test('an Entry records the Event chosen on its card, whatever its Volume', async () => {
  const { db, entries, changes } = dataset();
  // A burial in the baptisms' Volume: books mix their Registers.
  const rows = made(
    await entries.make({ ...at(3), event: 'BURI' }, null, [
      { personId: 3, role: null }
    ])
  );
  const entryId = rows[0]!.citation.entryId!;
  expect(rows[0]!.citation.event).toBe('BURI');
  expect(
    await entries.make({ ...at(4), event: null }, null, [
      { personId: 4, role: null }
    ])
  ).toEqual({ rejected: 'Choose what kind of entry it is.' });
  // Its Roles are the Event's: a burial names one person, in none.
  expect(
    await entries.make({ ...at(4), event: 'BURI' }, null, [
      { personId: 4, role: 'CHIL' }
    ])
  ).toEqual({ rejected: "That isn't a Role in this kind of entry." });
  expect(
    await entries.edit(entryId, {
      people: [
        { personId: 3, role: null },
        { personId: 4, role: null }
      ]
    })
  ).toEqual({ rejected: 'This kind of entry names one person.' });

  // Chosen anew on Edit, with a Change on each of its Citations.
  changes.length = 0;
  const edited = made(
    await entries.edit(entryId, {
      event: 'CHR',
      people: [{ personId: 3, role: 'CHIL' }]
    })
  );
  expect(edited.map((r) => r.citation.event)).toEqual(['CHR']);
  expect(changes.map((c) => c.what)).toEqual([
    { kind: 'event', volume: BAPTISMS, image: 3, from: 'BURI', to: 'CHR' },
    {
      kind: 'role',
      volume: BAPTISMS,
      image: 3,
      from: null,
      to: 'CHIL'
    }
  ]);
  expect(
    db.query('SELECT event FROM entries WHERE id = ?').get(entryId)
  ).toEqual({ event: 'CHR' });
});

test("an Entry made before its Event was chosen keeps what it says until it's chosen", async () => {
  const { db, entries } = dataset();
  const rows = made(
    await entries.make(baptism(3), 'Kaste', [{ personId: 1, role: 'CHIL' }])
  );
  const entryId = rows[0]!.citation.entryId!;
  db.run('UPDATE entries SET event = NULL WHERE id = ?', [entryId]);
  // Retyped as it is; who it names is checked once they change.
  made(await entries.edit(entryId, { text: 'Kaste 1795' }));
  expect(
    await entries.edit(entryId, { people: [{ personId: 1, role: 'CHIL' }] })
  ).toEqual({ rejected: 'Choose what kind of entry it is.' });
});
