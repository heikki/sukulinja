import { expect, test } from 'bun:test';

import type { Reminder, ReminderOn } from '@/common/types';

import { personReminders } from './reminders';

const DONE = '2026-10-23T10:00:00.000Z';

function reminder(id: number, on: ReminderOn, done: string | null = null) {
  const row: Reminder = { id, text: `R${id}`, on, created: '', done };
  return row;
}

function citation(personId: number, citationId: number): ReminderOn {
  return {
    kind: 'citation',
    personId,
    citationId,
    source: null,
    reference: null
  };
}

const ALL = [
  reminder(1, { kind: 'person', personId: 1 }, DONE),
  reminder(2, { kind: 'person', personId: 1 }),
  reminder(3, citation(1, 11)),
  reminder(4, citation(1, 11), DONE),
  reminder(5, citation(1, 12)),
  reminder(6, { kind: 'person', personId: 2 }),
  reminder(7, citation(2, 21), DONE),
  reminder(8, {
    kind: 'image',
    volumeId: '201',
    volume: 'I Aa:201',
    image: 18,
    fileId: '201-f18',
    stale: false
  })
];

function ids(reminders: Reminder[] | undefined) {
  return reminders?.map((r) => r.id);
}

test("a person's open Reminders, their own and by Citation, counting the done", () => {
  const { own, byCitation, done } = personReminders(ALL, 1, false);
  expect(ids(own)).toEqual([2]);
  expect(ids(byCitation.get(11))).toEqual([3]);
  expect(ids(byCitation.get(12))).toEqual([5]);
  expect(done).toBe(2);
});

test('with Show done, the done ones follow the open', () => {
  const { own, byCitation, done } = personReminders(ALL, 1, true);
  expect(ids(own)).toEqual([2, 1]);
  expect(ids(byCitation.get(11))).toEqual([3, 4]);
  expect(done).toBe(2);
});

test("someone else's, and an Image's, aren't theirs", () => {
  const { own, byCitation, done } = personReminders(ALL, 2, false);
  expect(ids(own)).toEqual([6]);
  expect(byCitation.size).toBe(0);
  expect(done).toBe(1);
});
