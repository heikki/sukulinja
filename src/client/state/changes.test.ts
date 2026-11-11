import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { Change } from '@/common/types';

import { openChanges } from './changes';

const UNDONE: Change = {
  id: 1,
  at: '2026-11-09T10:00:00.000Z',
  what: { kind: 'undo-import' },
  on: null,
  who: null
};

test('asks for the Changes anew each time they are shown', async () => {
  const api = memoryDatasetApi({ changes: [UNDONE] });
  const changes = openChanges(api);
  expect(changes.all.get()).toBeNull();
  changes.load();
  await Bun.sleep(0);
  expect(changes.all.get()).toEqual([UNDONE]);
  changes.load();
  await Bun.sleep(0);
  expect(api.asked.filter((a) => a === 'changes')).toHaveLength(2);
});

test("says when they couldn't be had", async () => {
  const changes = openChanges(memoryDatasetApi({}, { down: true }));
  changes.load();
  await Bun.sleep(0);
  expect(changes.all.get()).toBe('failed');
});

test('clearing forgets them all', async () => {
  const api = memoryDatasetApi({ changes: [UNDONE] });
  const changes = openChanges(api);
  changes.load();
  await Bun.sleep(0);
  await changes.clear();
  expect(changes.all.get()).toEqual([]);
  changes.load();
  await Bun.sleep(0);
  expect(changes.all.get()).toEqual([]);
});
