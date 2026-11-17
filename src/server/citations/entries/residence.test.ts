// A household line (ADR-0033): its one person's Residence over its
// Volume's years at its place, a new one each Volume, one that agrees
// supported. Names are invented.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NO_FIELDS } from '@/common/entry-events';
import type { Ticked } from '@/common/entry-offers';
import type { InEntry } from '@/common/operations';

import { fileId } from '../astia/memory-astia';
import { BOX, entriesDataset, made } from './test-entries';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'entry-residence-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const AT = { ...NO_FIELDS, place: 'Esimerkkilä 2' };
const PLACE = 'Esimerkkilä 2, Juva, Suomi';
const PEOPLE: InEntry[] = [{ personId: 3, role: null }];

// A line of the rippikirja `volumeId` naming Juho (3).
function line(volumeId: string, ticked: Ticked[]) {
  const target = {
    volumeId,
    image: 4,
    fileId: fileId(volumeId, 4, 'full'),
    box: BOX,
    event: 'RESI' as const,
    fields: AT,
    ticked
  };
  return [target, null, PEOPLE] as const;
}

function asked(volumeId: string) {
  return { volumeId, event: 'RESI' as const, people: PEOPLE, fields: AT };
}

test('a household line adds a Residence over its Volume, and the next Volume another', async () => {
  const { db, entries } = entriesDataset(dir);
  expect(await entries.offers(asked('juva-1'))).toEqual([
    {
      tag: 'RESI',
      action: 'add',
      now: { date: 'BET 1790 AND 1796', place: PLACE }
    }
  ]);
  made(await entries.make(...line('juva-1', [{ tag: 'RESI', action: 'add' }])));
  // Agrees now: same place, the years overlap.
  expect(await entries.offers(asked('juva-1'))).toMatchObject([
    { tag: 'RESI', action: 'support' }
  ]);
  // The next Volume is a new Residence, not the old one made longer.
  expect(await entries.offers(asked('juva-2'))).toMatchObject([
    { tag: 'RESI', action: 'add', now: { date: 'BET 1797 AND 1803' } }
  ]);
  made(await entries.make(...line('juva-2', [{ tag: 'RESI', action: 'add' }])));
  expect(
    db
      .query(
        `SELECT tag, date_text AS date, place FROM facts
         WHERE scope_type = 'person' AND scope_id = 3 ORDER BY id`
      )
      .all()
  ).toEqual([
    { tag: 'RESI', date: 'BET 1790 AND 1796', place: PLACE },
    { tag: 'RESI', date: 'BET 1797 AND 1803', place: PLACE }
  ]);
});

test('a household line with no place offers nothing', async () => {
  const { entries } = entriesDataset(dir);
  expect(
    await entries.offers({ ...asked('juva-1'), fields: NO_FIELDS })
  ).toEqual([]);
});
