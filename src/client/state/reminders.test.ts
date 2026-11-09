import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { On, Reminder } from '@/common/types';

import { openReminders } from './reminders';
import type { ReminderPlaces } from './reminders';

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

test('a Reminder is drafted on its places, until it stops', () => {
  const reminders = openReminders(memoryDatasetApi({}));
  expect(reminders.drafting.get()).toBe(null);
  const places: ReminderPlaces = {
    cited: null,
    base: { header: ['Matti Testinen'], target: { personId: 1 } }
  };
  reminders.draft(places);
  expect(reminders.drafting.get()).toBe(places);
  reminders.draft(null);
  expect(reminders.drafting.get()).toBe(null);
});
