// An Entry against the tree (ADR-0033): its dates and place offer its
// owner's Facts, and only the lines ticked are done, in the save's one
// transaction, each with its Change. Examples are invented.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NO_FIELDS } from '@/common/entry-events';
import type { EntryFields } from '@/common/entry-events';
import type { Ticked } from '@/common/entry-offers';
import type { InEntry } from '@/common/operations';

import { baptism, entriesDataset, made } from './test-entries';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'entry-tree-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const PLACE = 'Esimerkkilä 2, Juva, Suomi';
const AT_MAKELA = { place: 'Esimerkkilä 2' };

// A baptism born and baptised on the days given, at Esimerkkilä 2 unless not.
function fields(born: string | null, baptised: string | null, at = true) {
  const place = at ? AT_MAKELA : {};
  return { ...NO_FIELDS, ...place, lifeDate: born, date: baptised };
}

function factsOf(
  db: ReturnType<typeof entriesDataset>['db'],
  personId: number
) {
  return db
    .query<
      { id: number; tag: string; date: string | null; place: string | null },
      [number]
    >(
      `SELECT id, tag, date_text AS date, place FROM facts
       WHERE scope_type = 'person' AND scope_id = ? ORDER BY id`
    )
    .all(personId);
}

function baptismOf(
  personId: number,
  said: EntryFields,
  ticked: Ticked[] = [],
  image = 3
) {
  const people: InEntry[] = [{ personId, role: 'CHIL' }];
  const at = baptism(image, undefined, { fields: said, ticked });
  return [at, null, people] as [typeof at, null, InEntry[]];
}

test('a child with no Birth or Christening is offered both, and only those ticked are added and supported', async () => {
  const { db, entries, changes } = entriesDataset(dir);
  const said = fields('3 MAR 1795', '5 MAR 1795');
  const asked = { volumeId: 'juva-3', event: 'CHR' as const, fields: said };
  expect(
    await entries.offers({ ...asked, people: [{ personId: 3, role: 'CHIL' }] })
  ).toEqual([
    { tag: 'BIRT', action: 'add', now: { date: '3 MAR 1795', place: PLACE } },
    { tag: 'CHR', action: 'add', now: { date: '5 MAR 1795', place: PLACE } }
  ]);

  const [row] = made(
    await entries.make(...baptismOf(3, said, [{ tag: 'BIRT', action: 'add' }]))
  );
  expect(factsOf(db, 3)).toMatchObject([
    { tag: 'BIRT', date: '3 MAR 1795', place: PLACE }
  ]);
  expect(row!.citation.supports).toEqual([factsOf(db, 3)[0]!.id]);
  expect(row!.citation.fields).toEqual({ ...said, date: '5 MAR 1795' });
  expect(changes.map((c) => c.what.kind)).toEqual(['cite', 'fact', 'support']);

  // Left unticked, the Christening is offered again on Edit.
  expect(
    await entries.offers({ ...asked, people: [{ personId: 3, role: 'CHIL' }] })
  ).toMatchObject([
    { tag: 'BIRT', action: 'support' },
    { tag: 'CHR', action: 'add' }
  ]);
  const entryId = row!.citation.entryId!;
  made(
    await entries.edit(entryId, { ticked: [{ tag: 'CHR', action: 'add' }] })
  );
  expect(factsOf(db, 3).map((f) => f.tag)).toEqual(['BIRT', 'CHR']);
});

test("an edit with a Fact's line unticked takes back the Entry's support; one sending no lines leaves it", async () => {
  const { db, entries, changes } = entriesDataset(dir);
  const said = fields('3 MAR 1795', '5 MAR 1795');
  const [row] = made(
    await entries.make(
      ...baptismOf(3, said, [
        { tag: 'BIRT', action: 'add' },
        { tag: 'CHR', action: 'add' }
      ])
    )
  );
  const [birth, christening] = factsOf(db, 3);
  const entryId = row!.citation.entryId!;
  const asked = {
    volumeId: 'juva-3',
    entryId,
    event: 'CHR' as const,
    fields: said,
    people: [{ personId: 3, role: 'CHIL' }]
  };
  expect(await entries.offers(asked)).toMatchObject([
    { tag: 'BIRT', action: 'support', factId: birth!.id, kept: true },
    { tag: 'CHR', action: 'support', factId: christening!.id, kept: true }
  ]);

  // Its text alone changed, no lines sent: both stay supported.
  const [kept] = made(await entries.edit(entryId, { text: 'Kaste 1795' }));
  expect(kept!.citation.supports).toEqual([birth!.id, christening!.id]);

  // The Birth's line unticked: no longer its source, with a Change.
  const before = changes.length;
  const [edited] = made(
    await entries.edit(entryId, { ticked: [{ tag: 'CHR', action: 'support' }] })
  );
  expect(edited!.citation.supports).toEqual([christening!.id]);
  expect(changes.slice(before).map((c) => c.what)).toMatchObject([
    { kind: 'support', did: 'remove', tag: 'BIRT' }
  ]);
  expect(factsOf(db, 3).map((f) => f.tag)).toEqual(['BIRT', 'CHR']);
});

test('nothing ticked saves the Entry with its dates alone', async () => {
  const { db, entries, changes } = entriesDataset(dir);
  const said = fields('3 MAR 1795', '5 MAR 1795');
  const [row] = made(await entries.make(...baptismOf(3, said)));
  expect(row!.citation.supports).toEqual([]);
  expect(factsOf(db, 3)).toEqual([]);
  expect(changes.map((c) => c.what.kind)).toEqual(['cite']);
  expect(db.query('SELECT date, life_date, place FROM entries').get()).toEqual({
    date: '5 MAR 1795',
    life_date: '3 MAR 1795',
    place: 'Esimerkkilä 2'
  });
});

test('a Fact that agrees is supported; one that says less is changed only when ticked', async () => {
  const { db, entries } = entriesDataset(dir);
  // Matti's Birth is 3 MAR 1795 and his Christening 12 MAR 1795, with no place.
  const asked = {
    volumeId: 'juva-3',
    event: 'CHR' as const,
    people: [{ personId: 1, role: 'CHIL' }]
  };
  expect(
    await entries.offers({
      ...asked,
      fields: fields('3 MAR 1795', '12 MAR 1795', false)
    })
  ).toMatchObject([
    { tag: 'BIRT', action: 'support', factId: 1 },
    { tag: 'CHR', action: 'support', factId: 2 }
  ]);
  const said = fields('3 MAR 1795', '12 MAR 1795');
  const offers = await entries.offers({ ...asked, fields: said });
  expect(offers.map((o) => [o.tag, o.action])).toEqual([
    ['BIRT', 'support'],
    ['BIRT', 'change'],
    ['CHR', 'support'],
    ['CHR', 'change']
  ]);
  const [row] = made(
    await entries.make(
      ...baptismOf(1, said, [
        { tag: 'BIRT', action: 'support' },
        { tag: 'CHR', action: 'support' },
        { tag: 'CHR', action: 'change' }
      ])
    )
  );
  expect(row!.citation.supports).toEqual([1, 2]);
  expect(factsOf(db, 1)).toEqual([
    { id: 1, tag: 'BIRT', date: '3 MAR 1795', place: null },
    { id: 2, tag: 'CHR', date: '12 MAR 1795', place: PLACE }
  ]);
});

test('a Fact that differs is offered only its change; left, it stays unsupported', async () => {
  const { db, entries } = entriesDataset(dir);
  const said = fields(null, '13 MAR 1795', false);
  const [row] = made(await entries.make(...baptismOf(1, said)));
  expect(row!.citation.supports).toEqual([]);
  expect(factsOf(db, 1)[1]).toMatchObject({ date: '12 MAR 1795' });
  const entryId = row!.citation.entryId!;
  const [after] = made(
    await entries.edit(entryId, { ticked: [{ tag: 'CHR', action: 'change' }] })
  );
  expect(after!.citation.supports).toEqual([2]);
  expect(factsOf(db, 1)[1]).toMatchObject({ date: '13 MAR 1795' });
});

test('of two Facts of a kind, the one that agrees is offered support; none agreeing, nothing to tick', async () => {
  const { db, entries } = entriesDataset(dir);
  db.run(
    "INSERT INTO facts (scope_type, scope_id, tag, date_text) VALUES ('person', 1, 'BIRT', '1794')"
  );
  const asked = {
    volumeId: 'juva-3',
    event: 'CHR' as const,
    people: [{ personId: 1, role: 'CHIL' }]
  };
  expect(
    await entries.offers({ ...asked, fields: fields('3 MAR 1795', null) })
  ).toMatchObject([{ tag: 'BIRT', action: 'support', factId: 1 }]);
  expect(
    await entries.offers({ ...asked, fields: fields('3 MAR 1793', null) })
  ).toEqual([{ tag: 'BIRT', action: 'two' }]);
});

test('a line ticked that is no longer offered, or a date it cannot read, refuses all of it', async () => {
  const { db, entries } = entriesDataset(dir);
  const stale = await entries.make(
    ...baptismOf(1, fields('3 MAR 1795', null), [
      { tag: 'BIRT', action: 'add' }
    ])
  );
  expect(stale).toEqual({
    rejected: 'The tree has changed since; look at the list again.'
  });
  expect(await entries.make(...baptismOf(3, fields('3.3.1795', null)))).toEqual(
    { rejected: '"3.3.1795" isn\'t a date the card can write.' }
  );
  expect(db.query('SELECT COUNT(*) AS n FROM entries').get()).toEqual({ n: 0 });
});
