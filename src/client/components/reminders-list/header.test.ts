import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import { openAppState } from '@/client/state';
import type { PersonRow, Reminder, ReminderOn } from '@/common/types';

import { headerOf } from './header';
import { onLines } from './lines';

function reminder(on: ReminderOn): Reminder {
  return { id: 1, text: 'R', on, created: '', done: null };
}

const MATTI: PersonRow = {
  id: 1,
  given: 'Matti',
  surname: 'Testinen',
  sex: 'M',
  birth_year: 1770,
  death_year: 1820,
  birth_date: null,
  death_date: null,
  died: true,
  photo_path: null,
  crop: null
};

const IMAGE: ReminderOn = {
  kind: 'image',
  volumeId: '201',
  volume: 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
  image: 40,
  fileId: '201-f40',
  stale: false,
  personId: null
};

async function loaded() {
  const state = openAppState(memoryDatasetApi({ persons: [MATTI] }));
  await state.chart.load(() => ({ rootId: 1, selectedId: 1, panned: false }));
  return state;
}

test('a person is headed by their name', async () => {
  const state = await loaded();
  const on: ReminderOn = { kind: 'person', personId: 1 };
  expect(headerOf(state, reminder(on))).toEqual(['Matti Testinen']);
});

test("an Image's by its Volume, as the Scan viewer names it, and Image", () => {
  const state = openAppState(memoryDatasetApi({}));
  expect(headerOf(state, reminder(IMAGE))).toEqual([
    'Pää- ja rippikirjat (1790-1796) · Image 40'
  ]);
});

test("a person's one line goes to them", async () => {
  const state = await loaded();
  const on: ReminderOn = { kind: 'person', personId: 1 };
  expect(onLines(state, reminder(on))).toEqual([
    { text: 'Matti Testinen', to: on }
  ]);
});

test("an Image's line goes to it, unless it's from an earlier filming", async () => {
  const state = await loaded();
  expect(onLines(state, reminder(IMAGE))[0]?.to).toEqual(IMAGE);
  const stale: ReminderOn = { ...IMAGE, stale: true };
  expect(onLines(state, reminder(stale))[0]?.to).toBeNull();
});

test('an Image about someone goes to them, then to the Image', async () => {
  const state = await loaded();
  const on: ReminderOn = { ...IMAGE, personId: 1 };
  const lines = onLines(state, reminder(on));
  expect(lines.map((l) => l.to)).toEqual([{ kind: 'person', personId: 1 }, on]);
  expect(lines[0]?.text).toBe('Matti Testinen');
  expect(lines[1]?.text).toBe('Pää- ja rippikirjat (1790-1796) · Image 40');
});
