import { expect, test } from 'bun:test';

import type { Reminder, ReminderOn } from '@/common/types';

import { personReminders, sourceOf } from './reminders';

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

test("a person's open Reminders, on them or their Citations, counting the done", () => {
  const { listed, done } = personReminders(ALL, 1, false);
  expect(ids(listed)).toEqual([2, 3, 5]);
  expect(done).toBe(2);
});

test('with Show done, the done ones follow the open', () => {
  const { listed, done } = personReminders(ALL, 1, true);
  expect(ids(listed)).toEqual([2, 3, 5, 1, 4]);
  expect(done).toBe(2);
});

test("someone else's, and an Image's, aren't theirs", () => {
  const { listed, done } = personReminders(ALL, 2, false);
  expect(ids(listed)).toEqual([6]);
  expect(done).toBe(1);
});

test("a Citation's names its source; one on the person, none", () => {
  expect(sourceOf(reminder(1, citation(1, 11)))).toBe('Source');
  const named = { ...citation(1, 11), reference: 'I Aa:201, s. 18' };
  expect(sourceOf(reminder(2, named))).toBe('I Aa:201, s. 18');
  expect(sourceOf(reminder(3, { kind: 'person', personId: 1 }))).toBe(null);
});
