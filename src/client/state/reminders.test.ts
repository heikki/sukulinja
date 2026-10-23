import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { Reminder, ReminderOn } from '@/common/types';

import { openReminders, remindersOn } from './reminders';

function reminder(id: number, on: ReminderOn, done: string | null = null) {
  const row: Reminder = { id, text: `R${id}`, on, created: '', done };
  return row;
}

const IMAGE: ReminderOn = {
  kind: 'image',
  volumeId: '201',
  volume: 'I Aa:201',
  image: 18,
  fileId: '201-f18',
  stale: false
};

test('the open Reminders on an Image, or on a Citation linking it', () => {
  const all = [
    reminder(1, IMAGE),
    reminder(2, { ...IMAGE, image: 19 }),
    reminder(3, { ...IMAGE, stale: true }),
    reminder(4, IMAGE, '2026-10-23T10:00:00.000Z'),
    reminder(5, {
      kind: 'citation',
      personId: 1,
      citationId: 11,
      source: null,
      reference: null
    }),
    reminder(6, {
      kind: 'citation',
      personId: 1,
      citationId: 12,
      source: null,
      reference: null
    }),
    reminder(7, { kind: 'person', personId: 1 })
  ];
  const here = remindersOn(all, { volumeId: '201', image: 18 }, new Set([11]));
  expect(here.map((r) => r.id)).toEqual([1, 5]);
});

test('Reminders are asked for once, and kept in step with what changes here', async () => {
  const api = memoryDatasetApi({ reminders: [reminder(1, IMAGE)] });
  const reminders = openReminders(api);
  reminders.load();
  reminders.load();
  await Bun.sleep(0);
  expect(api.asked).toEqual(['reminders']);

  const made = await reminders.remind(' Second wife? ', { personId: 3 });
  expect(made).toMatchObject({ text: 'Second wife?', on: { personId: 3 } });
  await reminders.change(1, { done: true });
  await reminders.remove(made.id);
  const all = reminders.all.get();
  expect(
    Array.isArray(all) ? all.map((r) => [r.id, r.done !== null]) : all
  ).toEqual([[1, true]]);
  expect(api.asked).toEqual([
    'reminders',
    'remind person 3:  Second wife? ',
    'change reminder 1',
    `delete reminder ${made.id}`
  ]);
});

test('a failed load is asked for again', async () => {
  const api = memoryDatasetApi({}, { down: true });
  const reminders = openReminders(api);
  reminders.load();
  await Bun.sleep(0);
  expect(reminders.all.get()).toBe('failed');
  reminders.load();
  await Bun.sleep(0);
  expect(api.asked).toEqual(['reminders', 'reminders']);
});
