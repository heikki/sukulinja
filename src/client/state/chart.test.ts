// Selecting someone on the chart, without the DOM: a fake ChartView says
// what the chart's element was told, in order.

import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { MemoryOptions } from '@/client/dataset-api/memory';
import type { PersonDetails, PersonRow } from '@/common/types';

import { openAppState } from '.';
import type { ChartView, UrlView } from '.';

function row(id: number): PersonRow {
  return {
    id,
    given: `P${id}`,
    surname: null,
    sex: null,
    birth_year: null,
    death_year: null,
    birth_date: null,
    death_date: null,
    died: false,
    photo_path: null,
    crop: null
  };
}

function details(id: number): PersonDetails {
  return { id, name: null, sex: null, facts: [], citations: [] };
}

// A couple, 1 and 2, and their child 3; 4 is in no family.
function dataset(options: MemoryOptions = {}) {
  return memoryDatasetApi(
    {
      persons: [1, 2, 3, 4].map(row),
      families: [{ id: 1, husband_id: 1, wife_id: 2, child_ids: [3] }],
      details: { 1: details(1), 2: details(2), 3: details(3), 4: details(4) }
    },
    options
  );
}

// The chart's element: it draws `drawn`, and keeps what it's told.
function fakeView(drawn: number[]) {
  const told: string[] = [];
  const view: ChartView = {
    draws: (id) => drawn.includes(id),
    show: (id, at) => {
      told.push(at === null ? `show ${id}` : `show ${id} at clicked`);
    },
    rerooting: (pin, open) => {
      const where = pin === null ? 'centre' : `${pin.x},${pin.y}`;
      told.push(`reroot at ${where}${open ? ', open' : ''}`);
    },
    writeUrl: (push) => {
      told.push(push ? 'push' : 'replace');
    }
  };
  return { view, told };
}

function url(rootId: number | null, selectedId: number | null = null) {
  return (): UrlView => ({ rootId, selectedId, panned: false });
}

// The app state with the chart loaded from `from`, drawing `drawn`.
async function loaded(drawn: number[], from = url(1)) {
  const state = openAppState(dataset());
  const { view, told } = fakeView(drawn);
  state.chart.attach(view);
  await state.chart.load(from);
  return {
    state,
    told,
    selectedId: () => state.selected.id.get(),
    root: () => state.chart.root.get()
  };
}

test("starts from the URL's Root and Selected person", async () => {
  const { state, told, selectedId, root } = await loaded([1, 2, 3], url(1, 3));
  expect(state.chart.people.get().persons.size).toBe(4);
  expect(state.chart.people.get().parentFamByPerson.get(3)?.id).toBe(1);
  expect([root(), selectedId()]).toEqual([1, 3]);
  expect(told).toEqual([]);
});

test("someone the URL names who isn't there gives the default Root, written back", async () => {
  const { told, selectedId, root } = await loaded([1, 2, 3], url(99, 3));
  expect([root(), selectedId()]).toEqual([1, 1]);
  expect(told).toEqual(['replace']);
});

test("a dataset that can't load says why", async () => {
  const state = openAppState(dataset({ down: true }));
  await state.chart.load(url(1));
  expect(state.chart.loading.get()).toBe(false);
  expect(state.chart.error.get()).toBe('The app is not responding.');
  expect(state.chart.root.get()).toBe(null);
});

test('selecting someone drawn shows their card, and keeps Root', async () => {
  const { state, told, selectedId, root } = await loaded([1, 2, 3]);
  state.chart.select(3, [{ x: 10, y: 20 }]);
  expect([root(), selectedId()]).toEqual([1, 3]);
  expect(told).toEqual(['replace', 'show 3 at clicked']);
});

test("selecting someone the chart doesn't draw builds it around them", async () => {
  const { state, told, selectedId, root } = await loaded([1, 2, 3]);
  state.chart.select(4);
  expect([root(), selectedId()]).toEqual([4, 4]);
  expect(told).toEqual(['reroot at centre, open', 'push']);
});

test('makeRoot pins the new chart where asked; on Root, it only selects', async () => {
  const { state, told, selectedId, root } = await loaded([1, 2, 3], url(1, 3));
  state.chart.makeRoot(2, { x: 5, y: 6 });
  expect([root(), selectedId()]).toEqual([2, 2]);
  state.chart.makeRoot(2);
  expect(told).toEqual(['reroot at 5,6, open', 'push', 'replace', 'show 2']);
});

test('Back or Forward follows the URL, opening no dock and writing no URL', async () => {
  const { state, told, selectedId, root } = await loaded([1, 2, 3]);
  state.chart.follow(url(2, 3), () => undefined);
  expect([root(), selectedId()]).toEqual([2, 3]);
  // With a pan of its own, nothing is pinned.
  state.chart.follow(
    () => ({ rootId: 1, selectedId: null, panned: true }),
    () => undefined
  );
  expect([root(), selectedId()]).toEqual([1, 1]);
  // Someone the dataset doesn't have is no Root.
  state.chart.follow(url(99), () => undefined);
  expect(root()).toBe(1);
  expect(told).toEqual(['reroot at centre']);
});

test('without a chart drawn, selecting makes Root', async () => {
  const state = openAppState(dataset());
  await state.chart.load(url(1));
  state.chart.select(3);
  expect(state.chart.root.get()).toBe(3);
  expect(state.selected.id.get()).toBe(3);
});
