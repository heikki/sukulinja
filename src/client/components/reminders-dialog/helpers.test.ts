import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import { openAppState } from '@/client/state';
import type {
  CitationRow,
  Link,
  PersonRow,
  Reminder,
  ReminderOn
} from '@/common/types';

import { follow, isStale, listed, onLabel } from './helpers';

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

test('one on an Image from an earlier filming is stale', () => {
  expect(isStale(reminder(1, IMAGE))).toBe(false);
  expect(isStale(reminder(2, { ...IMAGE, stale: true }))).toBe(true);
  expect(isStale(reminder(3, CITATION))).toBe(false);
});

const C11: CitationRow = {
  id: 11,
  source: null,
  reference: null,
  entry: null,
  page: null,
  url: null,
  record: null,
  text: null,
  churchBook: true,
  madeInApp: false,
  markKey: 'citation 11',
  citedPage: null,
  cited: null
};
const L11: Link = {
  volumeId: '201',
  volume: 'I Aa:201',
  url: '',
  precision: 'image',
  image: 18,
  certainty: 'estimated'
};

function appState() {
  return openAppState(
    memoryDatasetApi({
      details: {
        1: { id: 1, name: 'Person 1', sex: 'U', facts: [], citations: [C11] }
      },
      links: { 1: [{ citationId: 11, links: [L11] }] },
      volumes: { '201': { images: 40, citations: [] } }
    })
  );
}

test("a Citation's selects its person and opens its scan", async () => {
  const state = appState();
  await follow(state, reminder(1, CITATION));
  expect(state.selected.id.get()).toBe(1);
  expect(state.viewer.source.get()).toEqual({ citation: C11, link: L11 });
});

test("an Image's opens the Scan viewer there; a stale one doesn't", async () => {
  const state = appState();
  await follow(state, reminder(1, { ...IMAGE, stale: true }));
  expect(state.viewer.opened.get()).toBe(null);
  await follow(state, reminder(2, IMAGE));
  expect(state.viewer.opened.get()).toEqual({
    volumeId: '201',
    volume: 'I Aa:201',
    image: 18
  });
});
