import { expect, test } from 'bun:test';

import type { On, Reminder } from '@/common/types';

import { listed } from './helpers';

const DONE = '2026-10-23T10:00:00.000Z';

function reminder(id: number, on: On, done: string | null = null) {
  const row: Reminder = { id, text: `R${id}`, on, created: '', done };
  return row;
}

const IMAGE: On = {
  kind: 'image',
  volumeId: '201',
  volume: 'I Aa:201',
  image: 18,
  fileId: '201-f18',
  stale: false
};

test('lists the open ones, then with Show done the done ones', () => {
  const all = [
    reminder(1, IMAGE),
    reminder(2, IMAGE, DONE),
    reminder(3, { kind: 'person', personId: 1 })
  ];
  expect(listed(all, false).map((r) => r.id)).toEqual([1, 3]);
  expect(listed(all, true).map((r) => r.id)).toEqual([1, 3, 2]);
});
