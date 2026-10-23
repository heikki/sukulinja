import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import { openAppState } from '@/client/state';
import type { PersonRow, Reminder, ReminderOn } from '@/common/types';

import { follow, listed, onLabel, pickable } from './helpers';

const DONE = '2026-10-23T10:00:00.000Z';

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
const CITATION: ReminderOn = {
  kind: 'citation',
  personId: 1,
  citationId: 11,
  source: 'Juvan seurakunnan arkisto',
  reference: 'I Aa:201, s. 18'
};

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
const PERSONS = new Map([[1, MATTI]]);

test('lists the open ones, then with Show done the done ones', () => {
  const all = [
    reminder(1, IMAGE),
    reminder(2, IMAGE, DONE),
    reminder(3, { kind: 'person', personId: 1 })
  ];
  expect(listed(all, false).map((r) => r.id)).toEqual([1, 3]);
  expect(listed(all, true).map((r) => r.id)).toEqual([1, 3, 2]);
});

test('names what each is on', () => {
  const person = onLabel(reminder(1, { kind: 'person', personId: 1 }), PERSONS);
  expect(person).toStartWith('Matti Testinen (');
  expect(onLabel(reminder(2, CITATION), PERSONS)).toEndWith(
    ' — I Aa:201, s. 18'
  );
  expect(onLabel(reminder(3, IMAGE), PERSONS)).toBe('I Aa:201, Image 18');
});

test('one on an Image from an earlier filming goes nowhere', () => {
  expect(pickable(reminder(1, IMAGE))).toBe(true);
  expect(pickable(reminder(2, { ...IMAGE, stale: true }))).toBe(false);
  expect(pickable(reminder(3, CITATION))).toBe(true);
});

function appState() {
  return openAppState(
    memoryDatasetApi({ volumes: { '201': { images: 40, citations: [] } } })
  );
}

test("a Citation's selects its person, asking for the source unfolded", () => {
  const state = appState();
  follow(state, reminder(1, CITATION));
  expect(state.selected.id.get()).toBe(1);
  expect(state.selected.reveal.get()).toEqual({ personId: 1, citationId: 11 });
});

test("an Image's opens the Scan viewer there; a stale one doesn't", () => {
  const state = appState();
  follow(state, reminder(1, { ...IMAGE, stale: true }));
  expect(state.viewer.opened.get()).toBe(null);
  follow(state, reminder(2, IMAGE));
  expect(state.viewer.opened.get()).toEqual({
    volumeId: '201',
    volume: 'I Aa:201',
    image: 18
  });
});
