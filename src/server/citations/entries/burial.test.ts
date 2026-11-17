// A burial Entry (ADR-0033): its one person's Death from its Died, only
// when filled, and Burial from its Buried, at its place. Names are
// invented.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NO_FIELDS } from '@/common/entry-events';
import type { EntryFields } from '@/common/entry-events';
import type { Ticked } from '@/common/entry-offers';

import { at, entriesDataset, made } from './test-entries';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'entry-burial-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function burial(fields: EntryFields, ticked: Ticked[], image = 7) {
  const target = { ...at(image), event: 'BURI' as const, fields, ticked };
  return [target, null, [{ personId: 3, role: null }]] as const;
}

const BURIED = { ...NO_FIELDS, date: '9 APR 1801', place: 'Esimerkkilä 2' };

test('a burial with no Died offers only the Burial; with one, the Death too', async () => {
  const { db, entries } = entriesDataset(dir);
  const asked = {
    volumeId: 'juva-3',
    event: 'BURI' as const,
    people: [{ personId: 3, role: null }]
  };
  expect(
    (await entries.offers({ ...asked, fields: BURIED })).map((o) => o.tag)
  ).toEqual(['BURI']);
  const died = { ...BURIED, lifeDate: '2 APR 1801' };
  expect(
    (await entries.offers({ ...asked, fields: died })).map((o) => o.tag)
  ).toEqual(['DEAT', 'BURI']);

  const ticked: Ticked[] = [
    { tag: 'DEAT', action: 'add' },
    { tag: 'BURI', action: 'add' }
  ];
  const rows = made(await entries.make(...burial(died, ticked)));
  expect(
    db
      .query(
        `SELECT tag, date_text AS date, place FROM facts
         WHERE scope_type = 'person' AND scope_id = 3 ORDER BY id`
      )
      .all()
  ).toEqual([
    { tag: 'DEAT', date: '2 APR 1801', place: 'Esimerkkilä 2, Juva, Suomi' },
    { tag: 'BURI', date: '9 APR 1801', place: 'Esimerkkilä 2, Juva, Suomi' }
  ]);
  expect(rows[0]!.citation.supports).toHaveLength(2);
});
