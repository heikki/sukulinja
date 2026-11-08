import { expect, test } from 'bun:test';

import type { Box, EmitOutput } from './emit';
import { SelectedBox } from './selected-box';

// Father 1 and mother 2 over their child 3; 3 is drawn a second time,
// apart, as under pedigree collapse.
const BOXES: Box[] = [
  { key: 'r/p1', personId: 1, pos: { x: 0, y: -200 } },
  { key: 'r/p2', personId: 2, pos: { x: 100, y: -200 } },
  { key: 'r/p3', personId: 3, pos: { x: 50, y: 0 } },
  { key: 'r/x/p3', personId: 3, pos: { x: 900, y: 0 } }
];
const CHART: EmitOutput = {
  boxes: BOXES,
  lines: [],
  extents: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }
};

function first() {
  return 0;
}

function setup() {
  const selected: number[] = [];
  const ring = new SelectedBox({
    select: (id) => {
      selected.push(id);
    },
    pauseMs: 5
  });
  return { ring, selected };
}

test("rings the copy in view of the Selected person's cards", () => {
  const { ring } = setup();
  ring.drawn(CHART, 3, () => 1);
  expect(ring.box?.key).toBe('r/x/p3');
});

test('keeps its box while the chart still draws it as the Selected person', () => {
  const { ring } = setup();
  ring.pick('r/x/p3');
  ring.drawn(CHART, 3, first);
  expect(ring.box?.key).toBe('r/x/p3');
  // Someone else selected moves the ring to them.
  ring.drawn(CHART, 1, first);
  expect(ring.box?.key).toBe('r/p1');
});

test('a step moves the ring at once and selects its person once the keys pause', async () => {
  const { ring, selected } = setup();
  ring.drawn(CHART, 3, first);
  expect(ring.step('up')?.key).toBe('r/p1');
  expect(ring.step('right')?.key).toBe('r/p2');
  // Drawn again before the pause, the ring stays ahead of the selection.
  ring.drawn(CHART, 3, first);
  expect(ring.box?.key).toBe('r/p2');
  expect(selected).toEqual([]);
  await Bun.sleep(20);
  expect(selected).toEqual([2]);
});

test('a step going nowhere leaves the ring where it is', () => {
  const { ring } = setup();
  ring.drawn(CHART, 1, first);
  expect(ring.step('up')).toBeNull();
  expect(ring.box?.key).toBe('r/p1');
});

test('a click drops the step waiting', async () => {
  const { ring, selected } = setup();
  ring.drawn(CHART, 3, first);
  ring.step('up');
  ring.pick('r/p2');
  await Bun.sleep(20);
  expect(selected).toEqual([]);
});

test('the step waiting is selected at once when flushed', () => {
  const { ring, selected } = setup();
  ring.drawn(CHART, 3, first);
  ring.step('up');
  ring.flush();
  expect(selected).toEqual([1]);
  ring.flush();
  expect(selected).toEqual([1]);
});
