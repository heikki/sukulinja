// A save refused when the tree changed since its Entry pane's lines were
// listed (ADR-0037): the lines come with the last Change then, which the
// save sends back. Names are invented.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NO_FIELDS } from '@/common/entry-events';

import { baptism, entriesDataset, made } from './test-entries';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'entry-seen-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const REFUSED = {
  rejected: 'The tree has changed since; look at the list again.'
};
const CHILD = [{ personId: 1, role: 'CHIL' }];

test('a new Entry or an edit is refused when a Change is newer than its lines', async () => {
  const { db, entries } = entriesDataset(dir);
  const asked = {
    volumeId: 'juva-3',
    event: 'CHR' as const,
    people: CHILD,
    fields: NO_FIELDS
  };
  const { seen } = await entries.lines(asked);
  const rows = made(await entries.make({ ...baptism(3), seen }, null, CHILD));
  const entryId = rows[0]!.citation.entryId!;

  // Listed again, then the tree changes (this dataset's Changes aren't
  // written, so one is put).
  const now = (await entries.lines({ ...asked, entryId })).seen;
  db.run(
    "INSERT INTO changes (at, what) VALUES ('2026-11-26T10:00:00Z', '{}')"
  );
  expect(await entries.edit(entryId, { text: 'Kaste', seen: now })).toEqual(
    REFUSED
  );
  expect(await entries.make({ ...baptism(4), seen: now }, null, CHILD)).toEqual(
    REFUSED
  );
  // Listed after it, the edit is saved.
  const after = (await entries.lines({ ...asked, entryId })).seen;
  expect(after).toBeGreaterThan(now);
  made(await entries.edit(entryId, { text: 'Kaste', seen: after }));
});
