import { expect, test } from 'bun:test';

import { shiftIntoView } from './in-view';

const VIEW = { min: { x: 0, y: 0 }, max: { x: 400, y: 300 } };

function rect(x: number, y: number, w = 100, h = 100) {
  return { min: { x, y }, max: { x: x + w, y: y + h } };
}

test('a rect inside the view stays put', () => {
  expect(shiftIntoView(rect(50, 50), VIEW)).toEqual({ x: 0, y: 0 });
});

test('a rect past an edge moves just far enough back in', () => {
  expect(shiftIntoView(rect(-30, 50), VIEW)).toEqual({ x: 30, y: 0 });
  expect(shiftIntoView(rect(350, 250), VIEW)).toEqual({ x: -50, y: -50 });
});

test('a rect wider than the view is centred on that axis', () => {
  expect(shiftIntoView(rect(-100, 50, 600), VIEW)).toEqual({ x: 0, y: 0 });
  expect(shiftIntoView(rect(0, 50, 600), VIEW)).toEqual({ x: -100, y: 0 });
});
