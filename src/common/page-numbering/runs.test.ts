import { expect, test } from 'bun:test';

import { pageClash, runsOf } from './runs';

function pin(image: number, ...pages: number[]) {
  return { image, pages };
}

test('a Volume numbering its pages once is one run over all its Images', () => {
  const pins = [pin(30, 50), pin(5, 1)];
  expect(runsOf(pins, 60)).toEqual([
    { pins: [pin(5, 1), pin(30, 50)], asides: [], from: 1, to: 60 }
  ]);
});

test('numbering over again starts a run, which reaches back to the one before', () => {
  const pins = [pin(2, 1), pin(20, 40), pin(25, 1), pin(45, 40)];
  expect(runsOf(pins, 50)).toEqual([
    { pins: [pin(2, 1), pin(20, 40)], asides: [], from: 1, to: 24 },
    { pins: [pin(25, 1), pin(45, 40)], asides: [], from: 21, to: 50 }
  ]);
});

test('a page going back between two of the run is an aside, not a run', () => {
  const pins = [pin(2, 1), pin(15, 30), pin(17, 5), pin(20, 40)];
  expect(runsOf(pins, 30)).toEqual([
    {
      pins: [pin(2, 1), pin(15, 30), pin(20, 40)],
      asides: [pin(17, 5)],
      from: 1,
      to: 30
    }
  ]);
});

test('the same page clashes near by, not in another run far off', () => {
  const clashes = pageClash(pin(12, 7));
  expect(clashes(pin(12, 9))).toBe(true);
  expect(clashes(pin(15, 7))).toBe(true);
  expect(clashes(pin(40, 7))).toBe(false);
  expect(clashes(pin(13, 8))).toBe(false);
});
