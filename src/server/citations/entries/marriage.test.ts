// A marriage Entry (ADR-0033): its couple's family's Marriage offered from
// its date and place, the couple made a family when it's saved, a new
// spouse with them. Names are invented.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NO_FIELDS } from '@/common/entry-events';
import type { Ticked } from '@/common/entry-offers';
import type { InEntry, Newcomer } from '@/common/operations';

import { at, entriesDataset, made } from './test-entries';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'entry-marriage-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

type Db = ReturnType<typeof entriesDataset>['db'];

const MARRIED = { ...NO_FIELDS, date: '2 JUN 1794', place: 'Esimerkkilä 2' };
const ADD: Ticked[] = [{ tag: 'MARR', action: 'add' }];

function couple(groom: number, bride: number): InEntry[] {
  return [
    { personId: groom, role: 'HUSB' },
    { personId: bride, role: 'WIFE' }
  ];
}

// A marriage on Image `image` naming the people, its date ticked as given.
function marriage(
  people: InEntry[],
  ticked: Ticked[] = ADD,
  newcomers: Newcomer[] = [],
  image = 5
) {
  const target = {
    ...at(image),
    event: 'MARR' as const,
    fields: MARRIED,
    ticked,
    newcomers
  };
  return [target, null, people] as const;
}

function familyFacts(db: Db) {
  return db
    .query(
      `SELECT scope_id AS familyId, tag, date_text AS date, place FROM facts
       WHERE scope_type = 'family' ORDER BY id`
    )
    .all();
}

function familyOf(db: Db, a: number, b: number) {
  return db
    .query<{ id: number }, [number, number]>(
      `SELECT id FROM families WHERE (husband_id = ?1 AND wife_id = ?2)
         OR (husband_id = ?2 AND wife_id = ?1)`
    )
    .get(a, b);
}

test("a couple's Marriage is offered, added to their family and supported", async () => {
  const { db, entries } = entriesDataset(dir);
  const asked = {
    volumeId: 'juva-3',
    event: 'MARR' as const,
    people: couple(1, 2),
    fields: MARRIED
  };
  expect(await entries.offers(asked)).toMatchObject([
    { tag: 'MARR', action: 'add', now: { date: '2 JUN 1794' } }
  ]);
  const rows = made(await entries.make(...marriage(couple(1, 2))));
  expect(familyFacts(db)).toEqual([
    {
      familyId: 1,
      tag: 'MARR',
      date: '2 JUN 1794',
      place: 'Esimerkkilä 2, Juva, Suomi'
    }
  ]);
  // The groom's Citation supports it.
  expect(rows[0]!.citation.supports).toHaveLength(1);
  // A second Entry of it finds it matching.
  expect(await entries.offers(asked)).toMatchObject([
    { tag: 'MARR', action: 'support' }
  ]);
});

test('two in the tree who are no couple become a family when it is saved', async () => {
  const { db, entries } = entriesDataset(dir);
  made(await entries.make(...marriage(couple(3, 4), [])));
  expect(familyOf(db, 3, 4)).not.toBeNull();
  expect(familyFacts(db)).toEqual([]);
  // Ticked, the new family gets the Marriage.
  made(await entries.make(...marriage(couple(4, 3), ADD, [], 6)));
  expect(familyFacts(db)).toMatchObject([
    { familyId: familyOf(db, 3, 4)!.id, tag: 'MARR' }
  ]);
});

test('a new bride is made into a family with the groom', async () => {
  const { db, entries } = entriesDataset(dir);
  const bride: Newcomer = {
    personId: -1,
    name: { given: 'Kaisa', surname: 'Malli', sex: 'U' }
  };
  const rows = made(
    await entries.make(...marriage(couple(3, -1), ADD, [bride]))
  );
  const brideId = rows[1]!.personId;
  expect(db.query('SELECT sex FROM persons WHERE id = ?').get(brideId)).toEqual(
    { sex: 'F' }
  );
  const family = familyOf(db, 3, brideId)!;
  expect(familyFacts(db)).toMatchObject([{ familyId: family.id, tag: 'MARR' }]);
});

test('editing makes no family of two in the tree, only a new bride with the groom (ADR-0037)', async () => {
  const { db, entries } = entriesDataset(dir);
  const rows = made(
    await entries.make(...marriage([{ personId: 3, role: 'HUSB' }], []))
  );
  const entryId = rows[0]!.citation.entryId!;
  made(await entries.edit(entryId, { people: couple(3, 4), ticked: [] }));
  expect(familyOf(db, 3, 4)).toBeNull();
  // A couple who aren't a family get no lines in an edit.
  expect(
    await entries.offers({
      volumeId: 'juva-3',
      entryId,
      event: 'MARR',
      people: couple(3, 4),
      fields: MARRIED
    })
  ).toEqual([]);

  const groomOnly = made(
    await entries.make(...marriage([{ personId: 4, role: 'HUSB' }], [], [], 6))
  );
  const bride: Newcomer = {
    personId: -1,
    name: { given: 'Kaisa', surname: 'Malli', sex: 'U' }
  };
  const edited = made(
    await entries.edit(groomOnly[0]!.citation.entryId!, {
      people: couple(4, -1),
      newcomers: [bride],
      ticked: []
    })
  );
  expect(familyOf(db, 4, edited[1]!.personId)).not.toBeNull();
});
